# Implementation plan: SSH reverse tunnel + outbound WebSocket (PBCM)

Status: **draft for approval** — please edit and comment; implementation only after approval.

---

## 1. Starting point

**In PBCM today:**
- The client agent *always* dials the server itself (`Connection.connect()` → `ws://server/ws/agent?token=…`).
  On the server side, `WebSocketController.handleAgentConnection` checks the token **and** `allowed_ip`
  (`clients.allowed_ip`).
- The repository credentials live on the server (`repositories` table) and are pushed to the client as part of the
  job config via `JOB_SAVE_CONFIG`. The client persists them in its own SQLite and builds the `PBS_REPOSITORY` env
  from them in `Executor` (`user!token@host[:port]:datastore`, password via FD 3, `PBS_FINGERPRINT`).
- The client runs jobs **autonomously** via node-cron, even while the server is offline.

**In DIM today (what PBCM lacks):**
- `clients.connection_mode = 'inbound' | 'outbound'` (migration `06_connection_mode`), plus
  `inbound_registered_ip` / `outbound_target_address`.
- `ClientConnector` (backend): dials the client — registration via `ws://client/ws/register`
  (secret ↔ generated authToken), then a session over `ws://client/ws/agent?token=…`, with reconnect backoff
  `[5s, 10s, 30s, 60s]`.
- `WebSocketController.handleOutboundAgentConnection` — the same AUTH/ping/registration logic, just without the IP check.
- On the client side: `/ws/register` + `/ws/agent` as **server** endpoints in its own Fastify web server,
  `Connection.handleIncoming(socket)` for the incoming session.

## 2. Topology and the decision it rests on

An `ssh -R` initiated by the **PBCM server** requires the server to reach the client host over SSH — exactly the
direction DIM's outbound mode models. From that follows a coherent scenario:

```
            ssh (server is the SSH client)       client host (sshd)
 ┌───────────────┐  ──────────────────────────►  ┌──────────────────────┐
 │  PBCM server  │                               │  pbcm-client         │
 │               │  ws  ─────────────────────►   │  :3001 /ws/agent     │  (outbound mode, as in DIM)
 │               │                               │                      │
 │               │  ◄── reverse forward ────────  │ 127.0.0.1:<dyn>      │  ← proxmox-backup-client
 └──────┬────────┘    (-R 127.0.0.1:0:pbs:8007)  └──────────────────────┘
        │ https
        ▼
   ┌──────────┐
   │   PBS    │   (reachable from the server only)
   └──────────┘
```

The client host needs **no** route to the PBS whatsoever, and no outbound connection — the server brings both.

The tunnel is **not** held permanently: the client requests it over the WebSocket right before a run and releases
it again afterwards (details in §4).

### 2.1 Constraint: the connection mode is immutable

The connection mode is **fixed once when the client is created and cannot be changed afterwards**. It also
determines the route to the PBS — both are the same decision, not a pair of independent switches:

| `connection_mode` | WS between server and client | Route of `proxmox-backup-client` to the PBS |
|---|---|---|
| `inbound` | the client dials the server (today's behaviour) | directly to the PBS |
| `outbound` | the server dials the client (as in DIM) | **always** through the SSH reverse tunnel |

Three things follow, and they shape the whole rest of this plan:

1. **There is no tunnel switch.** Whether traffic is tunnelled follows from `clients.connection_mode`; a separate
   `enabled` flag does not exist. That makes the state "tunnel off, but jobs point at loopback" structurally
   impossible.
2. **Creation is atomic.** An outbound client without a working tunnel configuration has *no* route to the PBS and
   would be inoperable. WS registration and the SSH tunnel test therefore run in the same operation, and **nothing**
   is persisted if either of them fails (see §B3).
3. **No mode switch, no fallback.** Every job of an outbound client carries the tunnel requirement as a marker (§B6)
   and is not started at all without a lease — there is no backing up directly to the PBS as a substitute. If the
   PBCM server is not running, outbound clients do not back up at all.
   That is an architectural statement, not a configuration option, and belongs in the operations documentation as
   such. Switching means: delete the client and create it again — including the loss of the history that hangs off
   the client ID.

**SSH implementation: `ssh2` (npm) rather than the system `ssh`.** Recommended, because:
- no `openssh-client` is needed in the server image (Dockerfile.server stays unchanged),
- `client.forwardIn(bindAddr, bindPort)` + the `'tcp connection'` event → the reverse forward runs in-process and
  every connection is visible as an event (real health and traffic metrics instead of process polling),
- errors (auth, forward rejected, host key) arrive as typed events instead of stderr text,
- host key checking through the `hostVerifier` callback → pinning in the DB, no `known_hosts` file handling.
Fallback (should `ssh2` be unwanted): `spawn("ssh", ["-N","-T","-o","ExitOnForwardFailure=yes","-o","ServerAliveInterval=15",
"-o","ServerAliveCountMax=3","-o","BatchMode=yes","-R","127.0.0.1:0:pbs:8007", …])` — then extend Dockerfile.server
with `openssh-client`.

---

## 3. Part A — outbound WebSocket (a 1:1 port from DIM)

### A1 `shared/`
- `constants.ts`: extend `WS_EVENTS` with `REGISTRATION_REQUEST`, `REGISTRATION_SUCCESS`, `REGISTRATION_FAILURE` as
  well as `TUNNEL_ACQUIRE`, `TUNNEL_ACQUIRE_RESULT`, `TUNNEL_RELEASE` (§B4).
- `schemas.ts`: extend `ClientSchema` with `connectionMode` and `outboundTargetAddress`;
  `RegistrationRequestSchema { secret, authToken }`; extend `BackupJobSchema`/`RestoreJobSchema` with the optional
  field `tunnel: { required: boolean }` (§B6); schemas for the three tunnel events.
- `types.ts`: `export type ConnectionMode = "inbound" | "outbound";`, `ProtocolMap` entries for the tunnel events.
- Then `npm run build -w shared`, without exception.

### A2 Backend DB — new migration `04_connection_mode.ts`
Analogous to DIM migration 06 (create a new table and copy, since this is SQLite):
`connection_mode TEXT NOT NULL DEFAULT 'inbound'`, `inbound_registered_ip` (from `allowed_ip`/`ip_address`),
`outbound_target_address`. Existing clients are migrated as `inbound` — no behavioural break.
`down()` restores `allowed_ip`/`ip_address`.

### A3 `ClientRepository`
New: `findOutboundClients()`, `createOutbound(id, hostname, targetAddress, authToken)`,
`updateAuthSuccess(id, version)` without an IP argument for outbound (split the signature rather than overloading it),
`findById(id)`.

### A4 `server/backend/src/services/ClientConnector.ts` (new)
Taken from DIM, adapted to PBCM names (`@pbcm/shared`, `ProxyService`):
`connectAll()` at start-up, `firstConnect()` (registration + AUTH, DB write only on success via `onPersist`),
`connectWithToken()`, `scheduleReconnect()` with backoff, `cancelReconnect(id)`, `disconnect(id)`.
`connectAll()` is called in `server/backend/src/index.ts` after the migrations.

### A5 `WebSocketController.handleOutboundAgentConnection(...)`
Ported from DIM: ping/pong 30s, AUTH timeout 5s, `AuthPayloadSchema` validation, `onPersist(version)`,
`ProxyService.registerClient`, `AUTH_SUCCESS` including `lastSyncTime` (PBCM sends the real value here, not `null`),
`close` → `unregisterClient` + `broadcastClientUpdate` + `onClose()`. **No** IP check.
The existing `handleAgentConnection` stays unchanged (inbound).

### A6 `ClientController` + routes
- `POST /api/v1/clients/outbound` — creates the client **and** the tunnel in one operation (see §B4):
  `{ hostname?, outboundTargetAddress, registrationSecret, tunnel: { sshHost, sshPort?, sshUser, privateKey,
  passphrase?, hostKeySha256 } }` → tunnel test, then `firstConnect`. `hostKeySha256` is the fingerprint confirmed
  in the wizard (not a mere confirmation flag): the server verifies that the host key actually encountered during
  creation matches it, and only then pins. No port field (dynamic, §B6), no password (key auth only, §B2), no target
  repository — neither as a stored value nor as a test parameter (§B3).
- `POST /api/v1/clients/:clientId/reconnect` — an immediate reconnect attempt (only for `connection_mode='outbound'`).
- `DELETE /api/v1/clients/:clientId` — additionally `ClientConnector.cancelReconnect/disconnect`
  **and** `TunnelService.closeClient(clientId)` (part B).

### A7 Client agent
- `client/src/web/server.ts`: register `@fastify/websocket`; `/ws/register` (only without an `authToken` and with a
  `registrationSecret` set; check the secret → `persistAuthToken` + `deleteRegistrationSecret`) and
  `/ws/agent` (token comparison → `Connection.handleIncoming(socket)`).
- `client/src/core/Connection.ts`: `handleIncoming(socket)` — the same message routing loop as for the outgoing
  socket (handlers), set `wsInstance`, send AUTH actively, heartbeat.
  Refactoring note: pull the message handling into a private `attach(ws)` used by both paths.
- `client/src/core/Config.ts`: `registrationSecret`, `enableRegisterPage`, `enableStatusPage`,
  `tunnelAcquireJitterSeconds` (default 30, §B4), `persistAuthToken()`, `deleteRegistrationSecret()`;
  `serverUrl` becomes optional in outbound mode.
- `isWebServerNeeded()` logic as in DIM.

### A8 Frontend
An "inbound/outbound" badge in `ClientList`, a "Connect now" button for offline outbound clients. The creation
dialog itself is built together with the tunnel configuration (§B10), because for outbound both have to be captured
and checked in a single operation.

---

## 4. Part B — SSH reverse tunnel (on demand, requested by the client)

**Guiding principle:** the tunnel is *not* permanent. It is established right before a backup or restore run and
torn down when that run ends. It is requested by the **client over the existing WebSocket**, and established, as
before, exclusively by the **server** (`ssh -R` towards the client host).

> **Security rule number one for this design:** the client **never names a target**. It names only the `jobId` it
> needs the tunnel for. The server checks that this job belongs to **this** client, looks up the associated
> repository itself, and derives target host and target port from it. Neither host, port nor bind address may ever
> come from the client's message. Otherwise the feature turns into a pivot: a compromised client could have the
> server forward it arbitrary internal targets.
>
> The ownership check (the job belongs to the requesting client) is **not optional** — without it a client could
> open a forward to a repository it has no permission for, by way of a foreign `jobId`.

### B1 Server config (`server/config.yaml`, `AppConfig.ts`)
```yaml
tunnel:
  enabled: true                      # kill switch, see below (not per client — §2.1)
  remoteBindHost: 127.0.0.1          # never 0.0.0.0 (that would need GatewayPorts)
  connectTimeoutMs: 10000            # SSH handshake + forwardIn
  keepaliveIntervalMs: 15000
  idleGraceMs: 60000                 # linger after the last release
  maxLeaseMs: 86400000               # kill switch against stuck leases (24 h)
  acquireTimeoutMs: 20000            # must be > connectTimeoutMs, also covers queueing
  maxConcurrentTunnels: 20           # server-wide limit, queued beyond it
  retryDelaysMs: [2000, 5000, 10000] # re-establishing while leases exist
  minRequestIntervalMs: 3000         # rate limit per client
  keySecret: <auto-generated>        # its own key for encrypting the secrets (§B8)
```

Two clarifications:

- **`enabled: false` is a kill switch, not an operating mode.** It prevents any tunnel from being established; all
  `acquire` requests are answered with `granted: false`, and consequently **every** outbound client stops backing
  up (§2.1). The switch exists for incidents, not for everyday use — the UI has to make that unmistakable.
- **No `hostKeyPolicy`:** since the fingerprint has to be confirmed and pinned at creation time (§B3), there is no
  runtime "pin on first use" left. The check is always strict.

### B2 Migration `05_client_tunnels.ts`
```sql
CREATE TABLE client_tunnels (
  client_id        TEXT PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  ssh_host         TEXT NOT NULL,           -- client host (sshd)
  ssh_port         INTEGER NOT NULL DEFAULT 22,
  ssh_user         TEXT NOT NULL,
  private_key      TEXT NOT NULL,           -- encrypted at rest, key auth only
  passphrase       TEXT,                    -- encrypted at rest
  host_key_sha256  TEXT NOT NULL,           -- pinning, confirmed at creation
  remote_bind_host TEXT NOT NULL DEFAULT '127.0.0.1',
  last_used_at     DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```
`down()` is trivial here (`DROP TABLE client_tunnels`), since the table is new and carries over no legacy data.

There is deliberately **no** `enabled` flag (§2.1): a row in `client_tunnels` exists exactly when the associated
client has `connection_mode = 'outbound'` — it is mandatory for outbound clients and not permitted for inbound
ones. That is enforced in `ClientController` (§B3), not by an SQL constraint, since SQLite cannot do CHECKs across
tables.

What deliberately is **not** in the table:

- **No `remote_bind_port`:** the port is assigned dynamically by the client host's sshd on every forward (§B6) and
  exists only for the lifetime of the lease.
- **No tunnel target:** the target follows per job from its repository (§B5) — a client can have jobs against
  several repositories. Nor a target "for tests", because the tunnel test works without a PBS (§B3).
- **No `status`:** in on-demand operation the state changes constantly and is kept in memory only. Only
  `last_used_at` is persisted. After a server restart there is therefore neither a tunnel nor a lease nor a
  contradictory status value.
- **No `last_error`** (dropped again in `06_drop_tunnel_last_error.ts`): the last error belongs to a connect
  attempt, not to the client, and a persisted copy outlives the attempt that produced it — after a restart it
  described a tunnel that no longer existed. It lives in the `TunnelService` entry alongside `status`, and both
  vanish together.
- **No password authentication:** key auth only. That saves a secret at rest, a UI branch, and a case distinction
  in `TunnelService`.

Active leases are likewise held in memory only — a running client simply requests again when it needs to after a
server restart.

### B3 Creating an outbound client (an atomic operation)

`ClientController.createOutbound` performs both checks before anything is written to the DB:

1. `TunnelService.testConnection(params)` — SSH connect, capture the host key, open
   `forwardIn(remote_bind_host, 0)`, close everything again. On failure → 400 with the concrete cause (auth, host
   key, `administratively prohibited` when `AllowTcpForwarding` is missing).
   **No PBS connect in the test:** whether the server reaches a PBS is not a property of this client but of the
   repository — and is already answered by the existing repository status check
   (`RepositoryController`, `/api2/json/admin/datastore/<ds>/status`). The test therefore needs no target repository
   as a parameter, which would be out of place at creation time anyway: the new client has no jobs yet.
   The **host key fingerprint that was determined is returned and has to be confirmed actively in the wizard**
   before anything proceeds — otherwise "pin on first use" would be blind trust at precisely the moment one can
   deliberately get it right once.
2. `ClientConnector.firstConnect(...)` — registration + AUTH as in part A.
3. Only once **both** have succeeded: write the `clients` row (`connection_mode='outbound'`) and the
   `client_tunnels` row in **one** SQLite transaction, adopting the host key from step 1 as the pin.

If step 2 fails after step 1 succeeded, the DB is left untouched — which matches the existing `firstConnect`
semantics from DIM ("write nothing on failure") exactly, and prevents half-created, inoperable clients.

### B4 Protocol: requesting a tunnel over the WebSocket

New events in `shared/src/constants.ts` + `ProtocolMap` + schemas:

| Event | Direction | Payload |
|---|---|---|
| `TUNNEL_ACQUIRE` | client → server | `{ requestId, jobId, runId }` — `jobId` determines the target through the server-side lookup, `runId` serves only the audit trail. **No** host/port |
| `TUNNEL_ACQUIRE_RESULT` | server → client | `{ requestId, granted: true, leaseId, bindHost, bindPort }` \| `{ requestId, granted: false, error }` |
| `TUNNEL_RELEASE` | client → server | `{ leaseId }` — fire and forget |

**The server assigns the `leaseId`**, not the client. A duplicated or wrong `runId` therefore cannot upset the
refcount, and a `RELEASE` only acts on a lease the server itself issued.

Anatomy of a run:

```
Client (executor)                        Server (TunnelService)
      │  (jitter 0–n s)
      │  TUNNEL_ACQUIRE {jobId,runId} ───────►  check the job → client mapping
      │                                         resolve the job's repository = target
      │                                         SSH connection open? ──no──► connect
      │                                         forward for this target open? ──no──► forwardIn(host,0)
      │                                         create lease (leaseId, refcount++)
      │  ◄──── TUNNEL_ACQUIRE_RESULT {leaseId, bindPort}
      │  TCP preflight against 127.0.0.1:bindPort
      │  spawn proxmox-backup-client …
      │  … job runs …
      │  TUNNEL_RELEASE {leaseId} ───────────►  refcount--
      │                                         0 ► idleGraceMs ► close forwards + SSH
```

- **On the client side**, `Connection` needs a request/response helper in the opposite direction (the counterpart to
  `ProxyService.sendRequest`): `Connection.request(type, payload)` with `requestId` correlation, a pending map and
  its own timeout. That timeout **must be larger than the server-side `acquireTimeoutMs`** (say 25 s against 20 s),
  or the client aborts a request that is still legitimately queued (§B5) — and the server then issues a lease that
  nobody releases.
- **`Executor`**: `acquireTunnel(jobId, runId)` before the spawn returns `{ leaseId, bindHost, bindPort }`,
  `releaseTunnel(leaseId)` in a `finally` — without exception, including on abort, error and timeout. A forgotten
  release otherwise holds the tunnel open until `maxLeaseMs`.
- No WS, or the server unreachable → the run ends immediately with `status=failed`,
  `stderr="SSH tunnel unavailable: no server connection"`. `proxmox-backup-client` is not started at all.
- **Jitter before the `acquire`:** a new client config `tunnelAcquireJitterSeconds` (default 30, `0` disables it).
  The client waits a random span from `[0, n]` before requesting. The reason: all clients typically share the same
  schedule ("daily at 02:00") and would otherwise ask in the very same second. The jitter merely spreads them out —
  the actual limit is server-side, via `maxConcurrentTunnels` (§B5).

### B5 `TunnelService` (`server/backend/src/services/TunnelService.ts`)
- No `startAll()` at boot. Public API: `acquire(clientId, jobId)` → `{ leaseId, bindHost, bindPort }`,
  `release(clientId, leaseId)`, `closeClient(clientId)` (drop all leases and close the connection — when a client is
  deleted, §A6), `getStatus(clientId)`, `testConnection(sshParams)` (checks SSH + `forwardIn` only, with no DB access
  and no PBS involvement — for §B3 and the "Test connection" button), `shutdown()`.
- Lease management:
  `Map<clientId, { ssh, connectPromise, forwards: Map<targetKey, {port, leases: Set<leaseId>}>, idleTimer, retryState }>`.
  One SSH connection per client, holding **one forward per target repository** — which also makes clients with jobs
  against several PBS instances work. `targetKey` is `host:port` of the resolved repository.
  `idleGraceMs` prevents setup/teardown churn between jobs that follow one another closely, `maxLeaseMs` is the kill
  switch against leases that got stuck.
- **Concurrent `acquire` calls share the setup.** If two jobs of the same client start at once, the second caller
  attaches to the running `connectPromise` or the running `forwardIn` instead of opening a second SSH connection.
  Without that bracket, duplicate connections and duplicate forwards appear — the most likely implementation mistake
  at this point.
- **Limit and queue:** `maxConcurrentTunnels` caps the simultaneously open SSH connections server-wide. Once the
  limit is reached, an `acquire` is **queued** rather than rejected; it only fails when `acquireTimeoutMs` expires.
  A further `acquire` for an already open tunnel always goes through immediately — the limit applies to new setups
  only.
- Setup: `ssh2.Client.connect({host, port, username, privateKey, passphrase, keepaliveInterval, readyTimeout,
  hostVerifier})` → `ready` → `forwardIn(remote_bind_host, 0)` → the port returned is the authoritative value and
  goes into every `TUNNEL_ACQUIRE_RESULT` → the `'tcp connection'` event:
  `net.connect(targetPort, targetHost)` against the PBS, wire the streams both ways (`pipe` there and back, clean up
  errors and `end` on both sides — socket leaks are the classic bug here).
- Teardown: a forward is closed as soon as its last lease is gone; the SSH connection as soon as the last forward is
  gone (each after `idleGraceMs`). Additionally on lease timeout, on the client's WS disconnect
  (`ProxyService.unregisterClient` → drop all leases of that client), when the client is deleted, and at server
  shutdown (SIGTERM hook).
- A connection drop **while** leases exist → re-establish with `retryDelaysMs`. Careful: the new tunnel gets a
  **different** port. `proxmox-backup-client` processes already running would then point at nothing and fail anyway;
  the associated leases are therefore dropped rather than silently redirected to the new port. The client learns
  about it through the failed run, not through an event of its own.
- Rate limit: `minRequestIntervalMs` per client; requests that come too often are rejected with `granted: false` and
  logged (an anomaly signal).
- Report a `forwardIn` rejection (`administratively prohibited`) cleanly → point at `AllowTcpForwarding`.
- Status is kept **in memory** and distributed via
  `ProxyService.broadcastToDashboard({ type: "TUNNEL_UPDATE", payload })`; only `last_used_at` goes into the DB.

### B6 Dynamic port + runtime substitution (the core of it)

The bind port is **not** configured but assigned by the client host's sshd on every tunnel setup:
`forwardIn(remote_bind_host, 0)` returns the port actually taken (the equivalent of `ssh -R 0:pbs:8007`). That
leaves no port management, no collision with a locally running PBS, and no port value that could go stale anywhere.

Because the port is only known at lease time, the repository URL is **no longer** rewritten at push time. Instead:

- The pushed job config contains the **real PBS URL** — truthful, readable, independent of the tunnel state.
- Alongside it comes the marker `tunnel: { required: true }` (a new optional field in
  `BackupJobSchema`/`RestoreJobSchema`), set for every client with `connection_mode = 'outbound'`. It is the only
  thing the server has to contribute.
- When building `PBS_REPOSITORY`, the `Executor` replaces **only host and port** with `bindHost:bindPort` from the
  `TUNNEL_ACQUIRE_RESULT` — that is, with the forward the server opened for exactly *this* job's repository.
  `fingerprint`, `username`, `tokenname`, `secret` and `datastore` stay unchanged.
  Result: `user!token@127.0.0.1:<port>:datastore`.

Consequences:

- **Fail closed:** if the substitution does not take effect, the real PBS URL ends up in the command — and that is
  unreachable for an outbound client. The run fails instead of accidentally working around the protection.
- **No repush, no invalidation.** `applyTunnelRewrite`, `repushAllJobs` and the whole invalidation path disappear
  without replacement. The only server-side intervention at push time is setting the marker.
- **Autonomous cron runs** work unchanged: they request the lease themselves and get the port that way.
- **The restore path** is covered automatically, because the substitution sits in the `Executor` and not in the
  push — the previous `RUN_RESTORE` special case disappears with it.
- **Client-side counter-check:** the agent knows its own mode. If a job with `tunnel.required = true` arrives on an
  inbound client (or a job without the marker on an outbound one), it is rejected with a clear message instead of
  executed — which catches, for instance, a client config copied from host to host.
- **Prerequisite:** `PBS_REPOSITORY` thereby always has the three-part form `host:port:datastore`. The
  `proxmox-backup-client` version in use must support the port in the repository spec — document a minimum version.
- TLS: with `PBS_FINGERPRINT` set, `proxmox-backup-client` checks against the fingerprint; the hostname mismatch
  (`127.0.0.1` vs. the PBS certificate) is therefore harmless. **→ verify in practice before implementing** (see §9).

### B7 Visibility
- Runtime state **in memory only** (`idle|connecting|up|error`, open forwards per target repository, active lease
  count, waiters in the queue, the last error) → a `TUNNEL_UPDATE` broadcast to the dashboard. Only `last_used_at`
  is persisted (§B2).
- A separate health probe event is unnecessary: the `Executor`'s TCP preflight after `TUNNEL_ACQUIRE_RESULT` is the
  proof of function, and it runs exactly when it is needed.
- One log line per lease (`clientId`, `jobId`, `runId`, `leaseId`, target repository, duration, connections carried)
  — the basis for a tunnel request outside a scheduled window being noticeable at all.

### B8 Secrets and SSH hardening
- **Key auth only**, no SSH passwords (§B2).
- Private key and passphrase encrypted at rest: AES-256-GCM with a key derived from `tunnel.keySecret`
  (`crypto.hkdfSync`). Deliberately **not** derived from `jwtSecret`: rotating the JWT would otherwise render every
  SSH key unreadable. `keySecret` is generated automatically on first start and written into `config.yaml` — the way
  `jwtSecret` is today. Never in cleartext in the DB, never in API responses (a write-only field, displayed only as
  "set / not set").
- Recommended setup path for the client host (to be documented in `docs/`):
  ```
  # ~/.ssh/authorized_keys on the client host
  restrict,port-forwarding,permitlisten="127.0.0.1:*" ssh-ed25519 AAAA... pbcm-server
  ```
  `restrict` disables shell/PTY/agent/X11, `permitlisten` limits the reverse forward to loopback. The port wildcard
  `*` is required because the port is assigned dynamically (§B6) — per `man sshd`, `*` matches any port. The
  restriction to `127.0.0.1` is unaffected by that and is the essential part: the key cannot open a listener
  reachable from outside.
  `AllowTcpForwarding yes` (the default) has to be set on the client host. `GatewayPorts` is **not** required.
- Optional convenience: on request the server generates an ed25519 key pair and shows the public key for copying.
- Host key pinning: the fingerprint is determined at creation, **shown to the operator for confirmation** (§B3) and
  then pinned; strict checking from then on. A mismatch → `error` with a clear message, and no lease.
- **On the PBS side** (a recommendation independent of the tunnel): one API token per client with `Datastore.Backup`
  on its own namespace and **without** `Datastore.Modify`/`Prune` — otherwise a compromised client can delete
  exactly the backups it is supposed to protect. That limits the damage more than any tunnel timing.

### B9 API
- `GET /api/v1/clients/:clientId/tunnel` (without secrets, including status and active leases)
- `PUT /api/v1/clients/:clientId/tunnel` — changes **only** the SSH credentials. No port field, no tunnel target, no
  enabling or disabling, no mode switch.
- `POST /api/v1/tunnel/test` — a test with **submitted** SSH parameters, without DB access. For the creation wizard,
  where the credentials are not yet stored anywhere. The response contains the host key fingerprint for confirmation.
- `POST /api/v1/clients/:clientId/tunnel/test` — the same test against the **stored** credentials, without the key
  having to leave the backend for it. For the "Test connection" button in `ClientEditor`.
- Dashboard WS: the `TUNNEL_UPDATE` broadcast.
- **Deliberately omitted:** `POST /clients/:id/tunnel` (creation runs exclusively through `POST /clients/outbound`),
  `DELETE /clients/:id/tunnel` (deletable only together with the client) and `tunnel/restart` (there is no permanent
  state).

### B10 Frontend
- **Creation wizard** (`ManagedClients`): step 1, choose the connection mode (inbound/outbound, immutable
  afterwards — with a corresponding note), step 2, for outbound additionally SSH host/port/user and the private key.
  "Test connection" is **mandatory** before submitting, because that is when the host key fingerprint is shown and
  has to be confirmed actively (§B3). No field for the local port, no password option, no repository selection.
- `ClientEditor`: the connection mode is only **displayed**, not edited. The "SSH reverse tunnel" section appears
  for outbound clients only and there permits nothing but maintaining the SSH credentials. "Test connection" works
  without parameters against the stored SSH details. The currently open forwards (target repository → port) are
  shown as status information for as long as leases exist.
- Status badge in `ClientList`/`ClientOverview`: `idle` (ready) / `up (n active)` / `error` + the in-memory
  `lastError` +
  "last used", fed from `TUNNEL_UPDATE` through a new slice in `useClientStore`.
- A note in the job editor that the repository for this client goes through the on-demand tunnel.

---

## 5. Files affected (overview)

| Area | New | Changed |
|---|---|---|
| shared | – | `constants.ts`, `schemas.ts`, `types.ts` |
| Backend DB | `migrations/04_connection_mode.ts`, `05_client_tunnels.ts` | `core/Database.ts` (migration list) |
| Backend services | `ClientConnector.ts`, `TunnelService.ts`, `services/crypto.ts` | `ProxyService.ts` |
| Backend repos | `ClientTunnelRepository.ts` | `ClientRepository.ts` |
| Backend controllers | `TunnelController.ts` | `WebSocketController.ts`, `ClientController.ts`, `JobController.ts`, `routes/api.ts`, `config/AppConfig.ts`, `index.ts` |
| Client | – | `web/server.ts`, `core/Connection.ts`, `core/Config.ts`, `features/Executor.ts`, `features/Handlers.ts` |
| Frontend | `components/ClientTunnelSettings.tsx` | `ClientEditor.tsx`, `ClientList.tsx`, `ManagedClients.tsx`, `useClientStore.ts` |
| Docs | `docs/tunnel.md` (including the test protocol §8) | `docs/api.md`, `docs/backend.md`, `docs/client.md`, `docs/install.md`, `CLAUDE.md` |

## 6. Order of implementation

1. **Phase 1 – shared + migrations** (small, isolated): WS events and schemas (A1), migration 04 (A2) and 05 (B2),
   `ClientRepository`/`ClientTunnelRepository`. Then `npm run build -w shared`.
2. **Phase 2 – outbound WS transport** (A1–A5, A7): `ClientConnector`, `handleOutboundAgentConnection`,
   client-side `/ws/register` + `/ws/agent`. Still **without** the public creation endpoint — in this phase test
   clients are created via SQL or a script.
3. **Phase 3 – TunnelService, setup/teardown** (B1, B5) including both `tunnel/test` endpoints — testable over REST,
   without a client and without the frontend.
4. **Phase 4 – atomic creation** (A6, B3): `POST /clients/outbound` in its final form — only here do the tunnel test
   and `firstConnect` interlock. It requires phases 2 **and** 3, hence its position.
5. **Phase 5 – lease protocol** (B4): WS events, `Connection.request()` in the client, `acquire`/`release` in the
   `Executor` including the `finally` release.
6. **Phase 6 – runtime substitution** (B6): the marker at push time, host/port replacement in the `Executor`, the
   client-side mode counter-check — from here a real backup runs through the tunnel.
7. **Phase 7 – frontend** (A8, B10): creation wizard and status badges.
8. **Phase 8 – visibility/logging (B7), hardening (B8), docs including the test protocol (§8).**

There is a sensible commit and review point after phase 2 and after phase 6. The order follows the constraint from
§2.1: because an outbound client without a tunnel is invalid, the creation endpoint may only exist once
`TunnelService` can back it up.

## 7. New dependency

`ssh2` + `@types/ssh2` in `server/backend`. No change to `Dockerfile.server` needed (only the "system ssh" fallback
would add `openssh-client`).

## 8. Manual test protocol (`docs/tunnel.md`)

The project has no test framework — this checklist is the only safety net and belongs with the implementation. The
first four items cover failures that otherwise stay **silent**:

1. **Lease leak after a client crash:** kill the client hard during a run (`kill -9`) → the WS disconnect must drop
   all leases of that client, the tunnel closes after `idleGraceMs`.
2. **Port change after reconnect:** interrupt the SSH connection during a run (a firewall rule) → the lease is
   dropped, the run fails with a clear message, no access to a dead port.
3. **Atomic creation with a failure:** create with valid SSH details but the wrong registration secret → no row in
   `clients` and none in `client_tunnels`; the error message names the consumed secret (risk 11).
4. **Parallel jobs:** start two jobs of the same client at once → exactly **one** SSH connection, one forward per
   target repository, both runs succeed, the tunnel closes only after the second release.
5. **Multiple repositories:** two jobs of one client against two different PBS instances → two forwards, two
   different ports, both backups land in the right datastore.
6. **Foreign `jobId`:** a tampered `TUNNEL_ACQUIRE` carrying another client's `jobId` → rejected, with a log entry.
7. **Upper limit:** set `maxConcurrentTunnels` to 1 for the test, start two clients at once → the second waits and
   then runs through, rather than failing.
8. **Inbound untouched:** an existing inbound client backs up directly to the PBS after the migration, unchanged.

## 9. Open points / risks

1. **Minimum `proxmox-backup-client` version:** because of the dynamic port, `PBS_REPOSITORY` always has the form
   `user!token@127.0.0.1:<port>:datastore`. The port in the repository spec is taken as given (decided so); the
   concrete minimum version has to be determined and documented in `docs/install.md`.
2. **Fingerprint vs. hostname:** the assumption is that `PBS_FINGERPRINT` replaces the hostname check. Test this
   once by hand against a real PBS — whether the substitution to `127.0.0.1` holds up at all depends on it.
3. **Outbound clients do not back up without the server** (§2.1): no WS connection means no lease, no lease means no
   tunnel, and there is deliberately no fallback to a direct connection. Scheduled backups fail immediately and with
   a clear message. The server has to be running at backup time — that belongs prominently in the operations
   documentation, not in a footnote.
4. **`allowed_ip` semantics:** migration 04 renames it; all read sites (`findByToken`, `handleAgentConnection`,
   `networkUtils`) have to follow, or existing inbound clients break.
5. **Secret encryption hangs off `tunnel.keySecret`** (§B8): if the value is lost or replaced, the stored SSH keys
   can no longer be decrypted. Decoupling it from `jwtSecret` means this is no longer a side effect of a JWT
   rotation, but it remains a backup-relevant value in `config.yaml`.
   → document it, error message "Cannot decrypt tunnel credentials — store them again".
6. **Port change when the tunnel is re-established:** every new setup assigns a new port. Leases must therefore not
   count as valid across a reconnect — otherwise a run works against a port that no longer exists (§B5).
7. **Leases that are never released:** a client crashing mid-run leaves the lease standing. Three safeguards: the
   `finally` release in the `Executor`, dropping all leases on WS disconnect, and `maxLeaseMs` as the kill switch.
   These three paths are the most important test case of the implementation.
8. **Timing/race at job start:** between `TUNNEL_ACQUIRE_RESULT` and the first TCP connect of
   `proxmox-backup-client` lies the reverse forward setup. The TCP preflight in the `Executor` is therefore
   mandatory, not optional — otherwise the first run after an idle period fails sporadically.
9. **A new control path client → server:** `TUNNEL_ACQUIRE` must carry no target, the `jobId` has to be checked
   against the requesting client (the box in §4), and the request has to be rate limited — otherwise the feature
   turns into a pivot, or a DoS vector against the SSH connections.
10. **No mode switch = loss of history when converting:** anyone wanting to move an existing inbound client to
    tunnel operation has to delete and re-create it; the `job_history` entries hanging off the client ID are lost in
    the process. Decided deliberately — make it clear in `docs/` and in the frontend's delete confirmation.
11. **Partially created clients:** the atomic creation (§B3) has two outward effects that a DB transaction does not
    roll back — after `firstConnect` the client has already persisted an `authToken`, and the registration secret is
    consumed there. If the DB write fails afterwards, the operator has to set a new secret on the client host. Word
    the error message accordingly.
