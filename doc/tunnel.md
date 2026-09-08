# SSH Reverse Tunnel

How to back up clients that cannot reach the Proxmox Backup Server themselves.

## Overview

Three separate questions, deliberately kept apart:

| | Question | Where | Changeable |
|---|---|---|---|
| `clients.connection_mode` | Who dials the WebSocket? | client | **No** — fixed when the client is created |
| `client_tunnels` (row present) | Is a tunnel *available* to this client? | client | Yes — set up or removed at any time |
| `job.tunnel.required` | Does *this backup* take it? | job | Yes — per job |
| `tunnel.required` on a restore | Does *this restore* take it? | restore request | Yes — per restore |

The mode says nothing about the route. It used to — outbound meant "always tunnelled" — and
the coupling was a design error twice over: it made the tunnel unavailable to exactly the
inbound clients that need one, and it tied a reversible decision to an irreversible one.

The route is not a client-wide property either. One client can back up to a PBS on its own
segment directly and to a second one only through the detour, so the choice belongs to the
run, next to the repository it is made for — per job for a backup, and asked again in the
form for a restore. The client only supplies the credentials that make the choice possible;
a job that asks for a tunnel the client has none for is rejected when it is saved, not when
it next runs, and a restore likewise when it is triggered.

```
            ssh (server is the SSH client)       client host (sshd)
 ┌───────────────┐  ──────────────────────────►  ┌──────────────────────┐
 │  PBCM server  │                               │  pbcm-client         │
 │               │  ws  ─────────────────────►   │  :3001 /ws/agent     │
 │               │                               │                      │
 │               │  ◄── reverse forward ────────  │ 127.0.0.1:<dyn>      │  ← proxmox-backup-client
 └──────┬────────┘    (-R 127.0.0.1:0:pbs:8007)  └──────────────────────┘
        │ https
        ▼
   ┌──────────┐
   │   PBS    │   (reachable from the server only)
   └──────────┘
```

For a tunnelled job the client host needs no route to the PBS. The tunnel is **not
permanent**: the client requests it right before such a run and releases it afterwards, and a
job configured without it never asks. The picture shows the outbound case; with an inbound
client only the WebSocket arrow turns around — the SSH connection is opened by the server
either way.

## Setup

### 1. Prepare the client host

Whether the key is generated for you or pasted in, the client host needs the public half in
`authorized_keys` **before** a connection test can succeed. The tunnel editor (step 3) offers
both paths under **Key** — *Generate a key*, an ed25519 key without a passphrase because the
server uses it unattended, or *Paste your own key* — and below that the optional collapsed
section **Client host setup** with a copyable block of commands. The private key is only
stored, never handed back out; to replace it, generate a new one in the same editor.

Done by hand, this is the following entry on the client host:

```
# ~/.ssh/authorized_keys
restrict,port-forwarding,permitlisten="127.0.0.1:*" ssh-ed25519 AAAA... pbcm-server
```

- `restrict` disables shell, PTY, agent and X11 forwarding.
- `permitlisten="127.0.0.1:*"` permits reverse forwards on loopback only. The port wildcard is
  required because the port is assigned dynamically.
- `sshd_config` needs `AllowTcpForwarding yes`, which is the default. `GatewayPorts` is
  **not** required.

### 2. Configure the agent

Set a one-time secret in the agent's `config.yaml` and leave `serverUrl` **unset**:

```yaml
registrationSecret: "<random secret>"
tunnelAcquireJitterSeconds: 30   # 0 disables the delay
```

From this the agent infers outbound mode: it does not dial the server, and instead serves
`/ws/register` and `/ws/agent` on port 3001. The secret is removed from the configuration once
registration succeeds.

The registration handshake hands the agent its identity — `clientId` and `authToken`, both
issued by the server — and the agent writes them to its `config.yaml` together. Every session
the server then opens presents both (`/ws/agent?clientId=…&token=…`), and the agent checks the
id against its own: the server has to be dialling the client it thinks it is, or a target
address pointed at the wrong host would hand that host somebody else's jobs. An agent that
already holds an identity answers a new registration with `4003 Already registered`.

> **Agent in a container:** the reverse forward terminates in the sshd's network namespace,
> that is, on the host. A container on a bridge network has its own `127.0.0.1` and cannot
> reach the forward — the run then fails with `SSH tunnel not reachable … ECONNREFUSED`.
> Use `network_mode: host` for this reason (see `compose.yaml`). If port 3001 is taken on the
> host, pick a free one via `listenPort` or `PBCM_CLIENT_PORT` and enter that same port in the
> client's target address.

### 3. Create the client, then add the tunnel

These are two separate actions, and deliberately so — the wizard settles who dials whom, which
is fixed for good, and nothing else.

**+ Add Client** in the clients area opens the wizard. Its first step is the connection mode, because
it cannot be changed afterwards. **Inbound** then takes a display name and an optional allowed
IP and issues a registration token; the client exists once its agent redeems it. **Outbound**
takes the agent's target address, the registration secret and a display name, and **Create**
dials the agent and registers it.

The tunnel comes afterwards, from the client list's row action — **Add SSH Tunnel**, or **Edit
SSH Tunnel** for a client that already has one, the same form either way. It is offered for
every client in either connection mode. Host, user and key go in; **Test & Set Up** opens the
connection and stores the credentials only if it stands.

The host key that test is offered is what gets pinned, and every later connection is checked
strictly against it. The two halves run back to back on purpose — the server verifies the
fingerprint again against the key it is actually presented, so a host that changes its key in
between fails the setup instead of being pinned. Nobody confirms the fingerprint by hand any
more; it is trusted on first use. On failure the form stays put and reports what went wrong.

Attaching a tunnel is not atomic with anything and does not need to be: the test runs first,
and a failure costs nothing beyond the error message. **Remove** deletes the credentials with
the stored key; the client and its history stay.

### 4. Switch the runs over

Storing credentials changes no backup by itself. Each job carries its own **SSH Reverse
Tunnel** switch in the job editor, below the encryption settings; it is disabled while the
client has no credentials. The setting is pushed to the agent with the job and lives in the
agent's own job config — which is what lets a scheduled run take the chosen route even while
the server is unreachable.

A restore is asked the same question in its own form, next to the client it restores to:
**Restore through the SSH reverse tunnel**, shown only for a client that has credentials and
defaulted to on. A restore has no stored config, so the answer travels with the request that
triggers it.

### 5. Server-side settings (optional)

```yaml
tunnel:
  enabled: true                # kill switch: false blocks EVERY tunnel
  remoteBindHost: 127.0.0.1
  connectTimeoutMs: 10000
  keepaliveIntervalMs: 15000
  idleGraceMs: 60000           # linger after the last release
  maxLeaseMs: 86400000         # kill switch against stuck leases
  acquireTimeoutMs: 20000
  maxConcurrentTunnels: 20     # queued beyond this
  retryDelaysMs: [2000, 5000, 10000]
  minRequestIntervalMs: 3000   # rate limit per client
  keySecret: <auto-generated>  # encrypts the SSH keys
```

## Anatomy of a run

```
Client (executor)                        Server (TunnelService)
      │  (jitter 0–n s)
      │  TUNNEL_ACQUIRE {jobId,runId} ───────►  check the job → client mapping
      │                                         resolve the job's repository = target
      │                                         ssh2.connect + forwardIn(host, 0) if needed
      │                                         measure the PBS certificate → fingerprint
      │  ◄──── TUNNEL_ACQUIRE_RESULT {leaseId, bindPort, fingerprint}
      │  TCP preflight against 127.0.0.1:bindPort
      │  spawn proxmox-backup-client …
      │  TUNNEL_RELEASE {leaseId} ───────────►  refcount--
      │                                         0 ► idleGraceMs ► close forwards + SSH
```

The client **never names a target** — only the `jobId`. The server verifies that the job belongs
to this client and derives host and port from its repository. For restores, which have no
`jobId`, the server authorises the target up front when the restore is triggered.

The job configuration on the client still holds the **real PBS URL** plus the marker
`tunnel: { required: true }`. Only at start-up does the agent replace host and port with the
lease's loopback endpoint. If that substitution does not take effect the run fails — it does not
accidentally back up past the tunnel.

## Operations

- **The server has to be running at backup time.** No WebSocket means no lease, and no lease
  means no tunnel; there is deliberately no fallback to a direct connection. Scheduled backups
  fail immediately with a clear message.
- **The target address can be changed, the connection mode cannot.** Host and port of the agent
  can be adjusted in the client editor; the server then drops the open agent connection and
  dials the new address right away.
- **Switching the connection mode is not supported.** Changing it means delete and re-create —
  and the job history, which hangs off the client ID, is lost in the process. **The tunnel is
  not like this**: credentials can be added and removed, and each job's route changed, at any
  time, with the client keeping its identity and history throughout.
- **A run's route is chosen per run.** A backup job stores it; a restore is asked in its form.
  Neither is derived from the client, because credentials say the detour is *possible*, not
  that this repository needs it.
- **A job's route reaches the agent with the job.** Changing the switch is an ordinary job
  save: the server pushes the config, the agent stores it, and the next run — scheduled or
  triggered — follows it. There is no second copy of the setting anywhere to fall out of step.
  A client that is offline at that moment does not get the change; its jobs keep running on
  the route they know until the save succeeds.
- **The server authorises the route, not the client.** A lease is granted only if the cached
  job the agent names is itself configured for the tunnel, so a tampered `TUNNEL_ACQUIRE`
  cannot obtain a forward for a job that was never meant to have one.
- **Removing the credentials does not rewrite the jobs.** Any job still set to use the tunnel
  then fails at the lease — deliberately loud, because quietly sending a backup out over a
  path the operator never chose is the worse outcome.
- **Restores have no job to read**, so the server cannot resolve the target from a `jobId` the
  way it does for a backup. It authorises the target up front instead, when the restore is
  triggered and only if that request asked for the tunnel; the client still never names a
  host itself.
- **A changed host key can be re-pinned.** The stored fingerprint is compared on every
  connection, so a reinstalled client host fails until its new key is accepted. `Test
  Connection` in the editor reports the fingerprint the host actually presented and offers
  **Trust this host key**, which writes it via `PUT /api/v1/clients/:id/tunnel`. Verify the
  fingerprint on the host itself first — the same symptom is what a hijacked address looks
  like.
- **Back up `tunnel.keySecret`.** If the value is lost, the stored SSH keys can no longer be
  decrypted and have to be entered again. Rotating the JWT secret is harmless: the key is
  deliberately decoupled from `jwtSecret`.
- **Limit PBS permissions.** One API token per client, with `Datastore.Backup` on its own
  namespace and without `Datastore.Modify`/`Prune` — otherwise a compromised client can delete
  exactly the backups it is supposed to protect.

## Manual test protocol

The project has no test framework; this checklist is the safety net. It is ordered by what
fails silently, not by what is easy to check: items 1-8 cover lease and lifecycle faults that
leave no trace, items 9-14 the interplay of client credentials and per-run routes, and items
15-18 the tunnel editor, where a wrong answer *looks* like a right one.

### Server and protocol

1. **Lease leak after a client crash** — kill the client hard during a run (`kill -9`).
   Expected: the WS disconnect drops all leases, the tunnel closes after `idleGraceMs`.
2. **Port change after reconnect** — interrupt the SSH connection during a run.
   Expected: the lease is dropped, the run fails with a clear message, no access to a dead port.
3. **Failed registration** — create an outbound client with a wrong registration secret.
   Expected: no row in `clients`; the message points at the consumed secret. The wizard asks
   for no SSH details at all, so there is nothing half-written to check for.
4. **Parallel jobs** — start two jobs of the same client at once.
   Expected: exactly **one** SSH connection, one forward per target repository, both runs
   succeed, the tunnel closes only after the second release.
5. **Multiple repositories** — two jobs of one client against two PBS instances.
   Expected: two forwards on different ports, both backups in the right datastore.
6. **Foreign `jobId`** — a tampered `TUNNEL_ACQUIRE` carrying another client's `jobId`.
   Expected: rejected, with a log entry.
7. **Upper limit** — set `maxConcurrentTunnels` to 1, start two clients at once.
   Expected: the second waits and then runs through, rather than failing.
8. **Inbound untouched** — an existing inbound client backs up directly to the PBS after the
   migration, unchanged.
9. **Inbound with a tunnel** — add credentials to an inbound client, switch one of its jobs
   over, run it. Expected: the agent asks for a lease over the connection *it* dialled, the
   server opens SSH to the client host, the run goes through `127.0.0.1:<port>`.
10. **Two jobs, two routes** — one client, one job with the tunnel and one without, against
    different repositories. Expected: both succeed, and only the first one takes a lease.
11. **Job asks, client cannot** — save a job with the tunnel switch on for a client without
    credentials (via the API; the UI disables the switch). Expected: `400` on save, no job
    written — not a job that fails on every run.
12. **Credentials removed under a job** — delete the tunnel while a job is still set to use
    it. Expected: the next run of that job fails at the lease with a clear message; it does
    **not** fall back to a direct connection.
13. **Restore, both routes** — restore a snapshot to a tunnelled client twice, once with the
    form's tunnel box on and once off. Expected: the first goes through `127.0.0.1:<port>`,
    the second straight to the PBS. Neither is decided by the client's credentials alone.
14. **Restore asks, client cannot** — trigger a restore with `tunnel.required` for a client
    without credentials (via the API; the UI hides the box). Expected: `400`, and no restore
    started.

### The tunnel editor (`ClientTunnelEditor` / `ClientTunnelCard`)

These exist because the tunnel is set up long after the client is, on a surface that has to
handle what the wizard never faced: credentials may already be stored, the private key may be
one the operator never sees, and a failed action must leave the existing configuration intact.

The client's two resources have one surface each, both reached from the client list's row
actions: **Edit Client** opens `ClientEditor` / `ClientIdentityCard`, which owns
`PUT /clients/:id`; **Add / Edit SSH Tunnel** opens `ClientTunnelEditor` / `ClientTunnelCard`,
which owns the `/clients/:id/tunnel` endpoints — `POST` to store credentials, `PUT` to edit
them, `DELETE` to remove them. No form spans both, and the per-run route is in neither: it
lives with the job, and with the restore request.

`POST /clients/:id/tunnel/test` accepts `sshHost`, `sshPort` and `sshUser` overrides so the
test describes the fields on screen while the private key stays in the backend; a key entered
in the form goes through the parameterised `POST /tunnel/test` instead.

15. **Test after an edit** — open a tunnelled client's tunnel editor, change SSH host, user
    or key, then press **Test Connection**.
    Expected: the result refers to what is in the fields. A test that silently checks the
    *stored* credentials reports success for a configuration nobody is running.
16. **Leaving with unsaved changes** — edit an SSH field, then close the tunnel editor.
    Expected: the sticky bar warns before the click; closing discards, and the list's action
    for that client still reads what is actually stored.
17. **Setup snippet on the stored key** — open a tunnelled client (key mode *Keep stored key*)
    and expand the host setup snippet.
    Expected: a real public key, or no snippet at all — never a copyable `authorized_keys`
    line with an empty key in it.
18. **Host key after a client rebuild** — reinstall the client host, or replace its SSH host
    key, then let the server reconnect.
    Expected: the run fails with a clear fingerprint mismatch **and** the tunnel editor offers
    to pin the new key after showing it. Deleting and re-adding the client must not be the only way
    back, because that also drops its jobs and history.

## Prerequisite

Because of the dynamic port, `PBS_REPOSITORY` always has the form
`user!token@127.0.0.1:<port>:datastore` on tunnelled runs. The `proxmox-backup-client` version
in use must support the port in the repository spec.

The port of the tunnel target comes solely from the repository URL (`parseRepositoryEndpoint`
in `shared/`): an explicitly given port wins, otherwise the protocol default (443 or 80).
**A PBS on its own API port has to be entered as `https://pbs.example.com:8007`** — 8007 is
never assumed silently. For the same reason `PBS_REPOSITORY` always carries an explicit port on
direct runs too: otherwise `proxmox-backup-client` would assume 8007 itself and address a
different target than the server resolved.

The hostname check is covered by `PBS_FINGERPRINT`, which makes the mismatch between `127.0.0.1`
and the PBS certificate harmless.

`proxmox-backup-client` only evaluates the fingerprint **when the regular certificate check
fails** — so on tunnelled runs always, because the hostname can never match. The pin is
therefore the run's only basis of trust and has to be current: a value stored in the job goes
stale as soon as the PBS renews its certificate, and then breaks every tunnelled backup — while
directly connected clients keep running unnoticed, because the CA check covers them.

This is why **the server measures the fingerprint when granting the lease** and returns it in
`TUNNEL_ACQUIRE_RESULT`; the client cannot do this itself, since it only ever sees the PBS as
`127.0.0.1`. The measured value is adopted only if it passes the regular CA check against the
real hostname — otherwise the value stored with the repository, confirmed by hand, applies. If
the PBS is unreachable at the moment of measurement, the lease is granted anyway: a failed
measurement must not prevent a backup.
