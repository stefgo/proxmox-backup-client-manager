# ⚙️ Backend Architecture

This documentation details the architecture of the server backend (`server/backend`), which serves as the control plane for the Proxmox Backup Client Manager.

## 📂 Project Structure

The backend is built using **Fastify** as the core framework, written in **TypeScript**. It follows a standard **Model-View-Controller (MVC)**-like architecture combined with centralized services for external integrations.

```
server/backend/src/
├── config/        # Environment and app configuration loading
├── controllers/   # Route handlers (HTTP incoming requests)
├── core/          # Core server instances (Database initialization, migrations)
├── repositories/  # Data access layer (one module per SQLite table)
├── routes/        # Fastify route definitions (Plugin registrations)
├── services/      # Business logic and external API integrations
├── types/         # Fastify type augmentation
├── utils/         # Helper functions
└── index.ts       # Application entry point
```

## 🏗 Core Components

### 1. Controllers (`src/controllers/`)

Controllers handle HTTP requests and responses. They enforce input parsing, delegate business logic to `services`, and format Fastify replies.

| Controller                  | Responsibility                                                             |
| :-------------------------- | :------------------------------------------------------------------------- |
| `AuthController.ts`         | Local login, OIDC flow (login, callback, config endpoint).                 |
| `ClientController.ts`       | Client list, update, delete, file system browsing, version, history.       |
| `JobController.ts`          | Job CRUD, manual backup/restore triggers, aborting a run, encryption key generation. |
| `RepositoryController.ts`   | PBS repository CRUD, status check, snapshot listing, certificate probe, fingerprint distribution. |
| `TokenController.ts`        | Registration token management, public client registration endpoint.         |
| `UserController.ts`         | User CRUD.                                                                  |
| `SettingsController.ts`     | Cleanup settings read/write, manual cleanup runs, scheduler status.         |
| `HistoryController.ts`      | Global job history across all clients; what each user has marked as seen. |
| `TunnelController.ts`       | SSH tunnel credentials per client (CRUD), key pair generation, connection tests against form values and against stored credentials. |
| `WebSocketController.ts`    | Entry point for WebSocket connections (agents and dashboards).               |

### 2. Services (`src/services/`)

Services contain the heavy business logic of the application. They are designed as singletons or static classes that multiple controllers can rely on.

- **`ProxyService.ts`**: The central communication hub. It manages active agent and dashboard connections, handles request/response correlation for agent commands, and maintains an in-memory job configuration cache.
- **`AuthService.ts`**: Handles user authentication, OIDC flows, and JWT generation.
- **`SessionCookie.ts`**: The browser session, as two cookies — `pbcm_session` (the JWT, `HttpOnly`) and `pbcm_auth` (a flag with no secret, readable so the UI knows whether to show the login form). Both are set from one place so the local login and the OIDC return cannot drift apart. `Secure` follows `request.protocol` rather than being hardcoded: set unconditionally it would make a plain-HTTP installation discard the cookie, and the login would look successful while every following request came back `401` — a failure that never shows on localhost, which counts as a secure context.
- **`SettingsService.ts`**: Manages global application settings and persistence.
- **`FingerprintObservations.ts`**: In-memory record of fingerprints reported by agents (`FINGERPRINT_OBSERVED`). Deliberately never written into the repository config — a single compromised client must not be able to set the value every other client then trusts.
- **`ScheduledJob.ts`**: The timer, the bookkeeping and the status of one server scheduler. Every run — the timer's and a manual one — goes through `run()`, which keeps the scheduler's row in `scheduler_state` and pushes `SCHEDULER_STATUS_UPDATE` to the dashboards. A run that throws is recorded as `failed` with its error and logged; there is no activity list to report it to. The timer is a chain of timeouts rather than an interval, so the first run after a restart can be placed one interval after the last run started (at once if overdue) instead of one after startup; a scheduler that has never run keeps the run it had planned (`next_run_at`, capped at one interval from now), so restarting more often than the interval does not keep pushing its first run away; with none planned, it is one interval after startup. Waits longer than `setTimeout` allows (~24.8 days) are taken in steps.
- **`TokenCleanupService.ts`**: Scheduler `token-cleanup`. Removes registration tokens that have been invalid (used or expired) for longer than `token_retention_days`, every `token_cleanup_interval_hours` (`0` switches the timer off).
- **`JobHistoryCleanupService.ts`**: Scheduler `job-history-cleanup`. Removes job history older than `retention_job_history_days`, always keeping the newest `retention_job_history_count` entries per client (at least one); `0` days means no age limit. Runs every `job_history_cleanup_interval_hours`.

  Both are started in `index.ts` after `SchedulerStateRepository.markInterrupted()` and stopped on `SIGINT`/`SIGTERM` and on an uncaught exception. After a signal the server closes its connections and exits with code 0; one that does not finish closing is given `SHUTDOWN_TIMEOUT_MS` (5 s), so the process ends before Docker's 10 s grace period would kill it, and a second signal changes nothing. `SettingsService.updateSettings` restarts the one whose keys changed.
- **`ClientConnector.ts`**: Dials outbound clients — registration through the agent's `/ws/register`, then a session over `/ws/agent`. Its `RECONNECT_DELAYS` ladder is the same one the agent uses in the other direction, because the two ends of one link should not behave differently.
- **`TunnelService.ts`**: Establishes and tears down the SSH reverse tunnel on a client's request. See [tunnel.md](tunnel.md).
- **`WebhookService.ts`**: Sends the webhooks — the server is the only sender. `dispatch(clientId, events)` hands events to every enabled webhook whose filters they pass; one queue per webhook keeps a target's events in order, with retries after 1 s and 5 s on no answer, 5xx and 429, and at most 100 waiting. The outcome goes into the webhook's `last_*` columns (migration 15) and `WEBHOOKS_UPDATE` to the dashboards. Runs come from `AgentMessageRouter`: `JobHistoryRepository.upsertStatus` and `upsertHistoryBatch` answer the runs a write gave a final state they did not have before, so a run is reported once whether it arrives live, with the history sync, or both. See [webhooks.md](webhooks.md).
- **`ClientConnectionWatch.ts`**: `client.disconnected` once an agent's connection has stayed closed for 120 s, `client.reconnected` when it is back after that was reported. Fed by `AgentSession` — a close counts only when `ProxyService.unregisterClient` removed the current socket, not one a newer connection replaced. In memory only: a server restart forgets who was away.
- **`SecretCrypto.ts`**: Encrypts every secret the server has to read back at rest (AES-256-GCM): the SSH private keys of the tunnels, the PBS token secrets of the repositories and the auth tokens of outbound clients (migration 18). The key is derived via HKDF from `secretKey` in `config.yaml` and deliberately **not** from `jwtSecret` — rotating the secret that signs sessions must not make every stored secret unreadable. `encryptSecret` refuses while that key was generated on this start and could not be written to `config.yaml`: it would be gone after the restart, and everything encrypted with it. Inbound clients' auth tokens are not encrypted but hashed (SHA-256, `hashToken`), like the registration tokens: the server only has to recognise them.
- **`JobSecrets.ts`**: Keeps a job's two secrets — the repository's token secret and the encryption key — between server and agent. `redactJob` strips them from every job that goes to a browser (`GET /v1/jobs`, `GET /v1/clients/:id/jobs`, `JOBS_UPDATE`); `completeJobSecrets` fills them back in on a save, from the managed repository and from the job the agent stores. The job cache in `ProxyService` keeps them, because the backfill and the repository distribution send whole jobs back to the agent.

**Certificate probing lives in `shared/`, not here.** `probeCertificate` in `shared/src/node/certProbe.ts` measures the TLS certificate of a PBS
instance. The endpoint comes from `parseRepositoryEndpoint` in `shared/`, the single place
that maps a repository URL to host and port — an explicit port wins, otherwise the protocol
default (443/80) applies and the PBS API port is never assumed. It reports `caValid` —
whether the certificate passed regular validation against the real hostname. That flag is
what decides whether a measured fingerprint may be adopted automatically: it is evidence
from a CA, a source independent of the fingerprint itself.

Backend and client agent import the *same* function. `shared` has to stay importable from
the browser and `node:tls` is not, which is why this cannot sit in the package root — so
`shared/package.json` carries a second export condition, `@pbcm/shared/node`, for the parts
only a Node process may load (the certificate probe and the Pino logger). Before that
subpath existed the file was duplicated on both sides.

### 3. Routes (`src/routes/`)

Routes are Fastify plugins. They map HTTP verbs (GET, POST, PUT, DELETE) to specific methods in the Controllers and handle generic middleware (e.g., verifying JWT tokens).

All protected routes require a valid JWT. The browser sends it as the `pbcm_session` cookie; the `Authorization: Bearer <token>` header keeps working for scripted clients, and `@fastify/jwt` accepts either. A valid signature is not enough on its own: the hook, and the dashboard handshake in `WebSocketController`, also ask `AuthService.isSessionCurrent`, which compares the token's `tv` with `users.token_version` (migration 17). `UserRepository` raises that counter on a password change and on changed auth methods; `UserController` then closes the user's dashboard sockets through `ProxyService.closeDashboardSessions` — with `4001`, or `4002` plus a fresh cookie when the user changed their own password. Outside of auth, three routes are public: `POST /v1/register` (client self-registration), `GET /v1/ping` (reachability — "is there a PBCM server at this URL", asked by an agent's status page) and `GET /health` at `/api/health` (liveness — "can this instance serve requests", which also checks the database, and is what the container's `HEALTHCHECK` calls). The last two look alike and are not: `ping` must stay free of dependency checks, or a server with a broken database would tell an operator that the address is wrong.

`POST /login` carries a rate limit of ten attempts per fifteen minutes. The limiter is registered with `global: false` on purpose — a blanket limit would also count the agent handshakes and the dashboard's own traffic, where a larger fleet legitimately produces bursts.

### 4. WebSocket Controller & ProxyService

Real-time communication is handled via WebSockets (using `@fastify/websocket`).
The `WebSocketController` acts as the entry point, while `ProxyService` manages the lifecycle of these connections.

`ProxyService.broadcastToDashboard(message: DashboardMessage)` is the only way a message reaches a dashboard, and its parameter type is the contract: `DashboardMessage` is the union in `shared/src/dashboardMessages.ts`, so a shape that is not a member does not compile. Nothing is parsed here at runtime -- the server is the sender; the dashboard parses against the same schema. A new message type is added to that union first, and the dashboard's build then fails until it handles it.

The same holds for REST, more loosely: the response schemas in `shared/src/responses.ts` are what the frontend parses, and a controller that returns one of those shapes says so (`satisfies CertificateCheck`). `ProxyService.getClientsWithStatus()` returns `Client[]`, which feeds both `GET /clients` and `CLIENTS_UPDATE`.

`WebSocketController.ts` holds only the entry points its callers use — the two handshakes for `index.ts`, `handleOutboundAgentConnection` for `ClientConnector`. The rest sits under `controllers/websocket/`:

| Module                  | Responsibility                                                                 |
| :---------------------- | :----------------------------------------------------------------------------- |
| `Heartbeat.ts`          | `attachHeartbeat(socket, onTimeout?)` — the 30-second ping/pong. Existed three times over, once per connection kind; the copies differed only in whether they logged the drop. |
| `AgentMessageRouter.ts` | A `type → handler` table for everything an authenticated agent sends. Was an `if` chain of seven branches, so each message was compared against all seven. Same shape as `INBOUND_SCHEMAS` in the agent's `core/Connection.ts`. |
| `AgentSession.ts`       | `attachAgentSession(options)` — an agent connection from the `AUTH` handshake to the close. Stood once per direction, and the two copies had drifted apart at the point where each decides whom to let in. What differs is a parameter: `ip` decides both whether the address is recorded and which row update runs, since an outbound connection must not write `ip_address`. The heartbeat stays outside, because the inbound route attaches it before its credential checks. |
| `TunnelLease.ts`        | Lease authorisation and the fingerprint handling. Together because that is where the tunnel's security property lives: the requesting client never names a host, and the target is the repository configured on the server that the job points at — the job's own URL only selects it (`configuredTarget`). `configuredTarget` and `repositoryTarget` live here too, and `JobController` imports them from here for restores. |

- **Authentication**: Incoming agent connections are validated against tokens and IP restrictions. Dashboard connections authenticate with the `pbcm_session` cookie, which the browser attaches to the handshake itself — there is no token in the URL.
- **Connection Management**: `ProxyService` tracks online agents and active dashboard sessions.
- **Request correlation**: Requests to agents are tracked in one `pending` map keyed by `requestId`, and `routeAgentMessage` routes every incoming message through `resolvePending`. This replaced a per-request `message` listener on the agent's socket: that shape tripped Node's `MaxListenersExceededWarning` at eleven concurrent requests and re-parsed every arriving message once per attached listener. It mirrors `Connection.request` in the agent, which has always worked this way. A closing socket rejects the client's outstanding requests immediately instead of leaving each to its own timeout.
- **Per-event timeouts**: `WS_REQUEST_TIMEOUT_MS` in `shared/src/constants.ts` sets how long the server waits per event, with a 5 s default. `FS_LIST` and `GENERATE_KEY_CONFIG` get 30 s — both are slow by nature, and under the old flat 5 s their answers arrived for a request nobody was waiting for any more.
- **Job Caching**: When an agent connects, `ProxyService` automatically refreshes its local job cache to ensure high-speed retrieval of job configurations.
- **Repository id backfill**: During that refresh, jobs whose embedded repository copy predates `repositoryId` are resolved by base URL plus datastore and stamped with the id (`backfillRepositoryIds`). Ambiguous or unmatched jobs are skipped with a warning rather than guessed. Without the id nothing can tell which managed repository a job belongs to, which is what fingerprint distribution needs.
- **Broadcasting**: `ProxyService` multicasts events (like job progress or log updates) from agents to all connected dashboards.

## Three Services in Detail

The list above names every service in a sentence. Three of them carry rules that the rest of
the backend relies on and that are easy to break from outside.

### ProxyService — connections, requests and the job cache

`ProxyService` is the only module that holds a socket. Everything else names a client by its
id and asks this service to reach it.

| State | Holds | Rule |
| :---- | :---- | :--- |
| `connectedClients` | one socket per `clientId` | A new connection replaces the old one. `unregisterClient(clientId, socket)` removes the entry only if `socket` is still the current one and answers whether it was — a socket closed *because* a newer one replaced it is not the agent going away, and `ClientConnectionWatch` must not count it. |
| `dashboardClients` | each dashboard socket and the user it was opened for | `closeDashboardSessions(userId)` ends that user's dashboards when their password or auth methods change. |
| `pending` | one entry per outstanding request, keyed by `requestId` | `sendRequest` writes it, `resolvePending` settles it, and a closing socket rejects all of its client's entries at once. |
| `jobCache` | each connected agent's jobs, **with their secrets** | Refreshed on connect (`refreshJobCache`). See [JobSecrets](#jobsecrets--what-a-browser-may-see-of-a-job). |

Three ways out, and no fourth:

- **`sendRequest(clientId, type, payload)`** — typed by `ProtocolMap` in `shared`, so the
  payload and the answer follow from the event. It waits `WS_REQUEST_TIMEOUT_MS` for that
  event and throws when the client is not connected.
- **`sendFireAndForget(clientId, type, payload)`** — for a trigger whose result arrives later
  as a message of its own, such as starting a backup.
- **`broadcastToDashboard(message)`** — the only way a message reaches a browser; its
  parameter type, `DashboardMessage`, is the contract.

The agents are the store of the jobs, not the server: there is no job table. A job list for a
browser is the cache, redacted; a job saved in the dashboard goes to the agent and comes back
into the cache with the next refresh. A client that is offline therefore has no jobs to show,
which the frontend says instead of calling the list empty.

### TunnelService — the SSH reverse tunnel

A client with no route to the PBS asks the server for one, per run. `TunnelService` opens an
SSH connection **from the server to the client host**, asks its `sshd` for a reverse forward,
and pipes what arrives there to the PBS. Setup and the protocol are in [tunnel.md](tunnel.md);
this is what the code guarantees.

- **The client never names a target.** `acquire(clientId, target, runId)` takes a target the
  caller resolved on the server: `TunnelLease.handleAcquire` reads it from the
  repository configured for the job, and only for a job with `tunnel.required`. A restore
  carries no job id, so `JobController.triggerRestore` pre-authorises its target per `runId`
  with `registerRunTarget`, valid for `tunnel.maxLeaseMs`. A compromised agent can therefore
  not turn the server into a forwarder to an address of its choosing.
- **One connection per client, one forward per target, any number of leases.** Concurrent
  `acquire` calls share `connectPromise` and `forwardPromises`, so two jobs starting together
  open one connection and one forward. A lease is what a run holds; `release` gives it back,
  and a lease that is never released ends after `tunnel.maxLeaseMs`.
- **`tunnel.maxConcurrentTunnels` is a queue, not a refusal.** Many clients share a cron
  schedule and would otherwise fail together instead of running a few seconds apart. The slot
  is reserved before the first `await` (`acquireSlot`), and `holdsSlot` on the entry makes
  every teardown path — failed connect, lost connection, idle teardown, `closeClient` — give
  it back exactly once. A waiting caller is handed the slot directly, so a third cannot slip
  in between.
- **A lost connection drops every lease.** The next connection gets other ports, so a running
  job would talk to one that no longer exists (`handleConnectionLost`). The same happens when
  the agent's WebSocket closes (`dropClientLeases`).
- **Idle teardown waits `tunnel.idleGraceMs`.** A forward without leases is closed after the
  grace period and the connection once no forward is left, which avoids opening a new
  connection for each of several jobs in a row.
- **The host key is pinned.** A connection whose host key does not match the stored
  fingerprint is refused. `testConnection` — behind both test endpoints — checks
  reachability, the credentials and that a reverse forward is permitted, and reports the key
  it saw. It deliberately touches no PBS: whether the server reaches a backup server is a
  property of the repository.

The private keys are stored through `SecretCrypto`. Every change of state goes to the
dashboards as `TUNNEL_UPDATE`, and `shutdown()` closes all connections when the server stops.

### JobSecrets — what a browser may see of a job

A job carries two secrets: the PBS token secret in its repository copy and the encryption
key. The agent needs both, because it runs its jobs from its own `jobs.json` while the server
is unreachable. Nobody else does, so they travel **server → agent only**.

| Direction | Function | Does |
| :-------- | :------- | :--- |
| job → browser | `redactJob` | Sets `repository.secret` to `""` (the schema requires the field) and reduces `encryption` to `{ enabled }`. Used by `GET /v1/jobs`, `GET /v1/clients/:id/jobs` and `JOBS_UPDATE`. |
| browser → agent | `completeJobSecrets` | Fills both back in before the job is sent to the agent, and answers `{ error }` when one cannot be found. |
| restore → agent | `restoreRepository` | Builds the repository from the configured one. The request only names its id. |

Where `completeJobSecrets` takes the values from:

- **The repository secret** comes from the managed repository the job names
  (`repositoryId`), so saving a job also brings it up to date with the repository. A job from
  before `repositoryId` keeps the secret the agent already stores — but only when base URL,
  datastore, user and token name are unchanged, so a job pointed elsewhere never takes a
  secret that belongs to another PBS.
- **The encryption key**: an empty key with encryption on means "keep the stored one". A new
  key is sent only right after it was generated.

Both lookups happen on the server and not on the agent, so they work with agents older than
the change. The job cache in `ProxyService` is the one place that holds unredacted jobs; a
new route that hands a job to a browser has to pass it through `redactJob`.

## 🗄 Database Management

The backend relies on **SQLite3** wrapped with `better-sqlite3` for fast, synchronous database operations.

- The `core/` directory handles initializing the DB file location and running schema migrations via **Umzug**.
- It stores: User credentials, client tokens, registered clients, PBS repository configurations, job configurations (cache), complete job histories, and the state of the server schedulers.

#### `scheduler_state`

One row per scheduler (`SchedulerStateRepository`), written over on every run — there is no
history.

| Column | Meaning |
| :----- | :------ |
| `scheduler` | Primary key: `token-cleanup`, `job-history-cleanup`. |
| `running_since`, `running_trigger` | Set while a run is in progress, cleared when it ends. Kept apart from `last_*` so the last run stays visible during a run. |
| `last_started_at`, `last_finished_at`, `last_trigger` | The last finished run; `last_finished_at` is `NULL` for an interrupted one. |
| `last_status` | `success`, `partial`, `failed` or `interrupted`. |
| `last_result`, `last_error` | JSON result (`{ removed }`) or the error message. |
| `state` | JSON the scheduler carries from one run to the next; unused by both cleanups. |
| `next_run_at` | The run the timer has planned (migration 13); `NULL` while the scheduler is off. Read at startup only while there is no last run. |

A row that still carries `running_since` at startup belongs to a run the previous process
did not finish: `markInterrupted()` turns it into the last run with status `interrupted`.

#### `job_history` — snapshot columns

A backup run carries the snapshot it created (migration 16), as the agent reported it — the
server never asks the PBS for it. Columns of the run rather than a table of their own, so
`JobHistoryCleanupService` takes them with the run.

| Column | Meaning |
| :----- | :------ |
| `snapshot` | `host/<clientId>/<time>`, fixed by the agent with `--backup-time` before the run started. |
| `snapshot_details` | JSON: what `snapshot list` reported for it right after the run — size, files with crypt mode, key fingerprint, owner. Survives a prune on the PBS. |
| `snapshot_error` | Why a successful backup has no details (query timed out, PBS unreachable, …). |

Both upserts write them with `COALESCE`, so a write that does not carry them — a post-script
that turns a success into a failure, an agent of an older build — keeps what is there.
Details that arrive clear an earlier error. The webhook for a run reads them back from the
row after the write, so it has them whichever write ended the run. A `STATUS_UPDATE` with
`phase: "snapshot"` (the run is still `running`) is only broadcast, like every running
update.

#### `history_seen` and `history_seen_runs`

What each user has marked as seen (`HistorySeenRepository`, migrations 14 and 20). Two
parts, because neither alone is enough: a timestamp per user answers "mark all" with one
row, and a row per run is what marking a single one needs.

A run is unseen for a user when its status is `failed` or `missed`, its `end_time` lies
after the user's `seen_at`, and it has no row in `history_seen_runs`. That is one SQL
expression in `JobHistoryRepository` (`UNSEEN`), used for the `unseen` column of a history
page, for the `unseen` filter and for `countUnseen()` -- so the list and the count cannot
describe different runs.

`history_seen`:

| Column | Meaning |
| :----- | :------ |
| `username` | Primary key: the `username` claim of the session. |
| `seen_at` | ISO 8601 timestamp up to which everything counts as seen. |

`history_seen_runs`:

| Column | Meaning |
| :----- | :------ |
| `username` | The user who marked the run. |
| `history_id` | The run, `job_history.id`, `ON DELETE CASCADE`: the history cleanup takes the marks along. |

- **Nothing raises `seen_at` by itself.** Only `PUT /api/v1/history/seen` ("mark all") does,
  and it deletes the user's rows in `history_seen_runs`, which then all lie below it. The
  table holds what was picked out since the last "mark all", not a row per run ever seen.
- **A new user starts at the moment they are created.** `UserRepository.create` writes the
  user and their `seen_at` in one transaction, so the failures from before their time are
  not new to them. Migration 20 gave every existing user without a row the same: their
  `users.created_at`.
- **Deleting a user deletes both**, so a user created under the same name later starts
  from their own moment.

A run an agent syncs late (after an offline stretch) counts by its own `end_time`, so it
is already seen if the user has marked everything since it ended.

## 🔐 Authentication Flow

- **Local Login**: Standard username/password validation against bcrypt-hashed passwords in SQLite.
- **OIDC Login**: OpenID Connect flow supported out of the box. Redirects to Provider and exchanges the callback code for a local JWT session.
- **Agent Auth**: Agents authenticate via WebSockets using tokens generated on the dashboard.

## SSH reverse tunnel and outbound clients

Two independent mechanisms, and the code keeps them apart. `ClientConnector` dials outbound
clients (registration through the agent's `/ws/register`, then a session over `/ws/agent`) —
that is the connection mode. `TunnelService` establishes and tears down the SSH reverse tunnel
on the client's request — that is the route to the PBS, optional and available in either mode.

Availability is `ClientTunnelRepository.isConfigured(clientId)` — credentials stored — and use
is `tunnel.required` per run: on the individual job for a backup, on the trigger request for a
restore. Availability is only ever a *check* on that answer, never the answer itself, and both
`JobController.save` and `JobController.triggerRestore` reject a run asking for a route the
client has no credentials for. The same `tunnel.required` authorises the lease:
`TunnelLease.resolveTarget` returns nothing for a job not configured for the tunnel, and a restore
target is pre-authorised per `runId` only when its request asked for the tunnel.

Credentials are attached only through `/clients/:clientId/tunnel`. `POST /clients/outbound`
creates the connection alone, so the irreversible decision (the mode) and the revisable one
(the route) never travel in one request.
`connection_mode` is only consulted where the WebSocket direction genuinely matters (dialling
and reconnecting, IP pinning, the target address). Details, setup and test protocol:
[tunnel.md](tunnel.md).
