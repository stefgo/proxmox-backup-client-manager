# 🤖 Client Agent Architecture

This documentation details the architecture of the Node.js client agent (`client/`), which runs on the machines that are being backed up.

## 💻 Platform Support

The client agent supports multiple architectures:

- **x86_64 (amd64)**: Standard Docker image `pbcm-client`.
- **ARM64 (aarch64)**: Dedicated Docker image `pbcm-client-arm64`, optimized for devices like Raspberry Pi.

## 📂 Project Structure

The client is a lightweight, headless Node.js process designed to run as a daemon (either via systemd or Docker).

```
client/src/
├── core/                   # Base services: config, data files, WebSocket, process-wide helpers
│   ├── CappedLog.ts        # Head-and-tail bounded capture of a run's output
│   ├── Config.ts           # config.yaml, validated once and frozen
│   ├── ConfigFile.ts       # The YAML document itself, edited with the operator's comments kept
│   ├── Connection.ts       # WebSocket client with auto-reconnect
│   ├── DataStore.ts        # Data directory, atomic JSON writes, setting damaged files aside
│   ├── Identity.ts         # clientId + authToken in identity.json, and their move out of config.yaml
│   ├── ServerHttp.ts       # Requests to the PBCM server, certificate check decided per call
│   ├── LegacyImport.ts     # One-time import of jobs from an older client.db
│   ├── Lifecycle.ts        # The single gate between "running" and "working"
│   ├── LogStream.ts        # Batched LOG_UPDATE frames (250 ms / 8 KB)
│   ├── RegistrationState.ts # serverUrl and registration secret as a registration changes them; agent mode
│   ├── SetupPin.ts         # In-memory PIN guarding registration, local and outbound
│   └── Version.ts          # Agent version, read from dist/VERSION
├── features/               # Business logic
│   ├── Executor.ts         # Run orchestration and the concurrency queue
│   ├── Handlers.ts         # WebSocket message routing
│   ├── Scheduler.ts        # Minute loop that starts jobs whose next run is due
│   ├── SchedulePlan.ts     # What that loop decides about one job, as pure functions
│   ├── TunnelClient.ts     # Requests a tunnel lease and rewrites PBS_REPOSITORY
│   └── execution/          # The steps of a single run
│       ├── CommandBuilder.ts
│       ├── ProcessRunner.ts
│       ├── RunPreparation.ts
│       └── SnapshotQuery.ts    # Reads back the snapshot a backup created
├── repositories/           # Data access layer
│   ├── JobRepository.ts
│   ├── JobHistoryRepository.ts
│   └── JobScheduleStateRepository.ts
├── web/
│   ├── server.ts           # Local Fastify web server (status & registration)
│   └── public/             # Status and registration pages
└── index.ts                # Application entry point
```

Logging is not in this tree: `logger` comes from `@pbcm/shared/node`, the same instance the
server uses, so `LOG_LEVEL` and `LOG_FORMAT` behave identically on both sides.

## 🏗 Core Components

### 0. Lifecycle Gate (`src/core/Lifecycle.ts`)

`startAgentActivity()` is the single gate between "the process is running" and "the agent is
working". Scheduler, the recovery of interrupted runs and the outgoing server
connection all start there, and only for a **registered** agent.

Everything the agent does happens under its identity — a backup is filed in PBS under
`--backup-id`, a status update names a client the server has to recognise, a history row is
synced to that client. An unregistered agent has no identity to do any of it under, so it
starts none of it: it serves its Web UI and waits. The gate is one function rather than a
check at each starting point because two paths lead to it — a registered agent starting up,
and a registration completing while the process runs. The second is why the call cannot live
in `index.ts` alone: an agent registered through its Web UI has to start working without a
restart. `Executor.executeBackup` and `executeRestore` check the same condition again as a
backstop.

### 1. Core Connection (`src/core/Connection.ts`)

The `Connection` class manages the persistent WebSocket connection to the central server.

- **Features**: Automatic reconnection, ping/pong health checks, and secure transmission of all payload data.
- **Reconnect**: The delay steps through `5s → 10s → 30s → 60s` and then stays there, with up to 3s of jitter added each time. The same ladder as `ClientConnector.RECONNECT_DELAYS` on the server, which dials outbound agents — the two directions of one link should not behave differently. Before this it was a flat 5s with no jitter, so a fleet of agents and one server restart meant all of them knocking on the same beat. The counter resets on `AUTH_SUCCESS`, not when the socket opens: a connection that dies before the handshake is not a working one. All reconnects go through a single timer, and a connect that times out closes its socket — leaving it open used to let a later `connect()` close it, whose close handler then scheduled a second reconnect alongside the attempt already running.
- **Registration Flow**: If the client is unregistered, the user must provide a temporary registration `token`. The client POSTs this to the server and receives its identity in return — `clientId` and a permanent auth token, both issued by the **server** — which it saves together to `identity.json` in its data directory. The agent never picks an id for itself: the same value is the PBS `--backup-id`, so the side that decides which client a snapshot belongs to is the side that keeps the client list.
- **Identity on connect**: Every session presents both halves (`/ws/agent?clientId=…&token=…`) and the server checks that they name the same client. An agent that already holds an identity refuses to register a second time — registering again would issue a new id and leave the old row, jobs and history included, behind on the server. To move a client to a fresh identity, delete `identity.json` from its data directory first.

### 2. Job Scheduler (`src/features/Scheduler.ts`)

The Scheduler is responsible for evaluating and triggering scheduled backup jobs locally, independent of server connectivity.

- It reads job configurations from the agent's own `jobs.json`.
- Once a minute it checks every job with an active schedule against its stored next run time.
- Upon reaching the scheduled time, it triggers the `Executor` autonomously.
- Days and weeks are stepped by calendar date in the agent's time zone (`TZ`), not by 24-hour
  blocks, so a job keeps its time of day across daylight saving changes. The time of day comes
  from the start entered in the dashboard, which `schedule.json` keeps as `anchor`: a run that
  had to move because its time did not exist that night does not shift every run after it.
  Hours, minutes and seconds stay fixed intervals. Weekdays are checked in the same zone.
- After execution, it records the last and next run times in `schedule.json`, and emits a `JOB_NEXT_RUN_UPDATE` event to the server (if connected).
- **A run that starts late is reported as missed.** When the scheduler finds a run more than
  five minutes past its time (`MISSED_AFTER_MS` in `shared/src/schedule.ts`) -- the agent was
  stopped, the machine asleep -- it first writes a history entry with the status `missed`
  and then starts the one catch-up run as before. The entry says when the run was due, how
  late it started and how many scheduled runs the catch-up stands for:
  `Scheduled for 2026-10-03T02:00:00.000Z, started 7 h 12 min late. 3 scheduled runs were due; they are caught up by one.`
  It is a run like any other: kept under `history/` until the server has acknowledged it,
  reported as the webhook event `job.missed`, and listed on the dashboard until a user marks
  it as seen. Up to a minute of delay is the scheduler's own; the rest of the five lets an
  agent be restarted or updated across a scheduled time without a warning.
- **A time that had already passed when the schedule was saved is not a missed one.** A start
  entered in the past means "run at once", and a schedule switched back on finds the time it
  was switched off at. `schedule.json` keeps when the schedule was last saved as `enteredAt`
  for this; the rule is `isMissedRun` in `shared`, tested there.

### 3. Job Executor (`src/features/Executor.ts`)

`Executor` keeps the four entry points its callers use, the concurrency queue, and the orchestration. The steps of a run live under `features/execution/`:

| Module               | Responsibility                                                                    |
| :------------------- | :-------------------------------------------------------------------------------- |
| `RunPreparation.ts`  | Everything both kinds of run need before the spawn: the temporary keyfile, the repository environment (`PBS_REPOSITORY`, `PBS_PASSWORD_FD`, `PBS_FINGERPRINT`), and the fingerprint resolution. Backup and restore each kept their own copy of this — the arrangement in which the keyfile cleanup already went missing once. The keyfile is created exclusively (`0600`), and keyfiles a killed process left in the temp directory are removed at startup. |
| `CommandBuilder.ts`  | `buildBackupArgs` / `buildRestoreArgs` / `buildSnapshotListArgs`. Pure functions with no I/O, and therefore the first part of the agent that can be checked without a running process. A job's `excludes` become one `--exclude` each, applied by the CLI to every archive of the run. `backupParams` must not contain `--backup-time` — the agent sets it itself (below) — and a run with it is refused. |
| `ProcessRunner.ts`   | `runProxmoxClient`, `runScript`, `finishFailedRun` — everything that starts a child process and reports what became of it. Takes an `onSlotRelease` callback rather than knowing about the queue. |
| `SnapshotQuery.ts`   | `querySnapshot`: `proxmox-backup-client snapshot list host/<clientId> --output-format json`, with the environment of the backup it follows. Never throws; every failure ends in an error text. |

The Executor acts as a wrapper around the actual `proxmox-backup-client` CLI binaries.

- It translates abstract JSON job configurations into CLI arguments for `proxmox-backup-client backup` or `proxmox-backup-client restore`.
- It spawns a child process and captures real-time `stdout`/`stderr` streams, forwarding them as `LOG_UPDATE` events over the WebSocket.
- **Bounded output** (`core/CappedLog.ts`): each channel keeps at most `logCapBytes` (default 256 KB), holding the **head and the tail** with an explicit marker where the middle was dropped. Not a ring buffer: the invocation and the first errors are at the top and the reason a run failed is at the bottom, and a ring buffer keeps only the second half. The cap matters because the captured output is paid for three times — held in memory for the whole run, written to the run's history file, and synced to the server from there.
- **Batched log frames** (`core/LogStream.ts`): `LOG_UPDATE` events are collected and sent every 250 ms or once 8 KB accumulate, rather than one frame per chunk from the pipe. Safe because these frames are display-only; what must not slip is their order against the run's final `STATUS_UPDATE`, so the stream is flushed before that and in the spawn-error path.
- **The snapshot of a backup**: `backup` has no JSON output — it reports only text on stderr — so a run learns what it created in two steps:
  1. **The agent names the snapshot.** Right before the spawn, after the queue and the tunnel lease, it appends `--backup-time <epoch>` and records `host/<clientId>/<time>` in the run's history file. Not earlier: the PBS refuses a time that is not after the newest snapshot of the group. The same principle as `--backup-id`: the side that holds the identity sets it.
  2. **It reads the snapshot back** once the CLI has exited with 0: `snapshot list` with `--output-format json` asks the same PBS endpoint the server's snapshot view does. The run stays `running` meanwhile and says so with `phase: "snapshot"` in a `STATUS_UPDATE`; the tunnel lease is released only afterwards, since a tunnel job reaches the PBS for the query the same way. A snapshot counts only when it has its manifest (`index.json.blob`), which the CLI uploads last. The size, the files with their crypt mode, the key fingerprint and the owner are stored with the run as `snapshotDetails` and sent with the final `STATUS_UPDATE` (`phase: null`) and the history sync. If the query fails — timeout after 30 s, PBS unreachable, snapshot missing — the run stays a `success`, and the reason is stored as `snapshotError`.
  Restores and failed backups skip the query. The PBS's verify state is not read: a verify job sets it hours later.
- **Runs interrupted by a restart** (`Executor.cleanupRunningJobs`): on startup, before the server is connected, every run still `running` is settled. A backup that recorded its snapshot is looked up on the PBS first — it may well have finished, if the process ended during the query or before the status was written. Found and finished, it becomes `success` with its details and a note in stderr; not finished, `abort`; not answerable (job deleted, PBS unreachable), `abort` with the reason as `snapshotError`. A **tunnel** backup cannot be looked up then, since the lease needs the server: it stays `running` and is checked once the server has authenticated the agent (`Connection.onAuthenticated`). Never a provisional `abort` — that would be a second final status, and a second webhook. Every other run still `running` becomes `abort`, as before.
- **Runs aborted on request** (`Executor.abortRun`, `ProcessRunner.abort`): the server's `ABORT_RUN` names a run. `ProcessRunner` keeps every run it has accepted in a map until its CLI has exited, and an abort is a flag on that entry plus a signal — `SIGTERM`, and `SIGKILL` ten seconds later for a process stuck in a read on a dead link. The run is **not** ended by the abort: it ends in the same `close` handler as every other run, so the keyfile, the tunnel lease and the job's slot are given back by the same code, and the post-script runs as after a failure. `runEndStatus(code, abortRequested)` picks the status — `abort`, unless the CLI still exited with 0, in which case the work is done and the run a success.
  - *Before the CLI exists* — during the pre-script, or while the tunnel is opened — the flag is kept and read before the spawn; the run ends as `abort` without starting.
  - *Queued* behind another run of its job, the run is the `Executor`'s: it is taken out of the queue and settled there.
  - *Reading back its snapshot*, a run is no longer in the map and the request is refused: the backup is in the repository.
  - Not reachable is a run taken out of the queue and waiting out `queueDelaySeconds`; it is answered as "not under way" and can be aborted once it has started.
- **History Synchronization** (`features/HistorySync.ts`): Every run is a file in the agent's `history/` directory, and every change to it is sent to the server via `SYNC_HISTORY` — within a second, and in batches of 50 runs. Delivery is at-least-once: each run carries a `revision` that `JobHistoryRepository` raises whenever a field the server stores changes, and it stays due until the server has acknowledged that revision with `HISTORY_ACK`. A batch without an ack is offered again after a minute, and everything still due goes out on every reconnect. This replaced a watermark (`lastSyncTime`, which the server still sends for agents of an older build) that compared the server's clock with the agent's: a run the server failed to store, one written in the same second, or one from an agent whose clock lagged fell below it and was never sent again. The agent no longer syncs with a server that does not acknowledge; server and agent are released together.
- **Certificate pinning**: `PBS_FINGERPRINT` is taken from the job's repository copy, which ages — nothing updates it when the PBS renews its certificate. Before a **direct** run the Executor therefore measures the certificate itself (`probeCertificate` from `@pbcm/shared/node`, called in `features/execution/RunPreparation.ts` — the same function the server uses) and adopts the measured value **only** if regular CA validation against the real hostname succeeded; that check is the independent evidence that makes adoption safe. Against a self-signed PBS no such evidence exists, so the stored value stands and a genuine mismatch is left to fail the run — which is the entire purpose of a pin. An adopted value is written back to the job config so the next offline run has it, and reported to the server via `FINGERPRINT_OBSERVED` (informational; the server does not adopt it). **Tunneled** runs skip all of this: they reach the PBS as `127.0.0.1`, where CA validation can never succeed, so the server measures and delivers the fingerprint with the tunnel lease instead (see `docs/tunnel.md`). Which of the two paths a run takes follows from the job's own `tunnel.required`.

### 4. Local Web Server (`src/web/server.ts`)

The client includes a micro-server (Fastify) for local management and initial setup.

Which routes it serves is settled at startup from `config.yaml` (`getWebRoutes()`):

| Routes | Served when |
| :----- | :---------- |
| `/status`, `/api/status/connection`, `POST /api/connect` | `enableStatusPage` (default `true`) |
| `/register`, `POST /api/register` | `enableRegisterPage` (default `true`); answer `404` once the agent is registered |
| `/`, `/api/status/server`, `/api/status/auth`, the static files | either page is enabled |
| `/ws/register`, `/ws/agent` | outbound mode: no `serverUrl` |
| `/api/health` | the agent runs in its container image (`PBCM_CONTAINER=true`); answers loopback only |

A `serverUrl` means inbound mode, which needs no route here — the agent dials the server.
Without one, an unregistered agent waits on `/ws/register` for the server to register it
with the setup PIN (or `PBCM_REGISTRATION_SECRET`), and a registered one needs `/ws/agent`.
`/ws/register` refuses every caller once the agent has an identity. Since the routes are
fixed at startup while the mode is not, `/ws/agent` also refuses a connection once the agent
has been registered inbound through its register page.

The register page closes the same way, per request rather than at startup: once the agent
has an identity, `/register` redirects to `/status` (or answers `404` without a status page),
`register.html` is no longer served and `POST /api/register` answers `404`. There is nothing
left to do there — registering a second time would leave the client's old row behind on the
server — and the setup PIN that guarded it is gone with the registration. The status page
then shows how to start over instead of a link to the register page.

The static handler leaves out the HTML file of a disabled or closed page, so `/status.html` is not a
way around `enableStatusPage: false`. With neither page nor outbound mode the server binds
`127.0.0.1` for the health route alone; outside the container it then does not start at
all, and says so in the log. This replaces `DISABLE_WEB_UI`, which switched off the
outbound routes and the health route along with the pages.

None of the page endpoints asks for a login, so none of them takes a target from the
caller. `/api/status/server` checks the configured server and no other — it used to accept
any address as `?url=`, which let anyone who could reach the port have the agent probe its
own network. The register page needed that for one pre-check; `POST /api/register`, behind
the setup PIN, now reports it itself: every error carries `stage` — `input` (form or PIN,
nothing was sent), `server` (nothing answered at the URL) or `register` (a server answered
and refused). `POST /api/connect` dials the configured server as well; while a handshake is
under way, further calls wait for that one instead of starting over, so calling it in a loop
cannot keep a disconnected agent offline.

Plain HTTP unless `config.yaml` carries a `tls` block:

```yaml
tls:
    cert: /etc/pbcm/agent.crt
    key: /etc/pbcm/agent.key
```

Relative paths resolve against the agent's directory. Both files are read and checked at startup, and **a `tls` block that cannot be read ends the start** rather than falling back to HTTP — an agent configured for TLS that quietly served plaintext would hand its auth token out on `/ws/register` while looking perfectly healthy. The log line after `listen()` names the scheme actually in use, as does the setup PIN block. The container's health check follows the scheme without being told (see [Health check](#health-check)).

This matters in outbound mode, where the server dials `/ws/agent` with the auth token in the query string. With TLS on, the client's target address on the server has to say so: `wss://host:port`. The two are set separately and have to agree. A reverse proxy terminating TLS in front of the agent works just as well — leave `tls` unset and point the proxy at the plain port. What the agent stores is the path you wrote, so saving its configuration does not rewrite a relative path into an absolute one.

It is unrelated to the SSH reverse tunnel, which carries backup traffic to the PBS rather than the agent session — see [Outbound mode and the tunnel](#outbound-mode-and-the-tunnel).

- **Status Page**: Provides a quick overview of the client's connectivity and scheduling state.
- **Registration**: Allows manual registration via the web interface by entering a registration token obtained from the dashboard. The PBCM server's certificate is verified for the registration request and for the WebSocket connection; for a server with a self-signed certificate set `allowSelfSignedCertificates: true`, which then applies to both. Only the reachability check tolerates any certificate, since it sends nothing and trusts nothing it receives. The decision is made per request (`core/ServerHttp.ts`, the WebSocket options) — previously this was a process-wide `NODE_TLS_REJECT_UNAUTHORIZED=0` that stayed switched off for the lifetime of the agent and would have defeated the certificate probe above, and later a tolerant registration followed by a strict WebSocket, so a self-signed server registered but never connected.
- **Setup PIN** (`core/SetupPin.ts`): `POST /api/register` and `/ws/register` require a PIN
  that the agent prints to its log on startup while it has no identity — when the register
  page is enabled, or when it has no `serverUrl` and no `PBCM_REGISTRATION_SECRET`
  (`docker logs`, `journalctl -u pbcm-client`). Without it, anyone who can route to `listenPort` could
  point an unregistered agent at a server of their choosing — the caller supplies both the
  server URL and the token. `allowedNetworks` cannot serve as that check (see below), so
  the guard is a shared secret instead of an address; whoever can read the machine's log
  already has the access that registering would grant.

  The PIN lives in memory only. It is regenerated on every start, dropped once an identity
  exists, and rotated after five failed attempts — which ends online guessing without
  locking the operator out, since they read the new value from the same place. It is
  checked **before** the `isRegistered()` gate, so the status code does not reveal whether
  the agent already has an identity.

  On `/ws/register` the server presents the same PIN, entered by the operator in the
  dashboard's outbound wizard. For an unattended rollout, `PBCM_REGISTRATION_SECRET` — or
  `PBCM_REGISTRATION_SECRET_FILE` naming a file that holds it — sets a secret that is accepted
  there instead; it is read from the environment only, and setting both variables, or a file
  that cannot be read or is empty, stops the agent. Once used it is dropped from memory and the
  log asks for it to be removed from the environment. A `registrationSecret` left in
  `config.yaml` by an earlier version is ignored with a warning. `allowedNetworks` still
  restricts who may dial `/ws/register` at all.
- **Port**: `listenPort` in `config.yaml` (default `3001`), overridden by the environment
  variable `PBCM_CLIENT_PORT`. In outbound mode the same server also serves `/ws/register`
  and `/ws/agent`, so a changed port must match the client's target address on the server —
  editable in the client editor.
- **Allowed networks**: `allowedNetworks` in `config.yaml` — a list of CIDR networks the
  server may dial `/ws/register` and `/ws/agent` from. Empty (the default) allows every
  address, which is what the agent did before the setting existed. It matters most for
  `/ws/register`: there the *caller* supplies the auth token the agent then stores, and the
  listener binds every interface the host has. The local Web UI on the same port is
  deliberately **not** restricted — it is the surface an operator registers the agent
  through, and a list holding only the server's address would shut them out of it; that surface is guarded by the setup PIN above instead. The address checked is the
  socket's peer (no `trustProxy`), so an agent behind a
  reverse proxy must allow the proxy's address, not the server's. A wrong value is only
  repairable locally on the client host: the connection one would fix it over is the one
  being refused.

#### Health check

The client images declare a `HEALTHCHECK` against `/api/health`. It reports on the agent —
whether its data directory is writable — not on the connection to the server: an agent that
cannot reach the server still runs its jobs.

The probe cannot read `config.yaml`, so the agent tells it where to ask: after `listen()` it
writes the address it actually serves to `/tmp/pbcm-health.json`
(`{"url":"https://127.0.0.1:4001/api/health"}`). A port or `tls` block set only in
`config.yaml` is therefore followed just like `PBCM_CLIENT_PORT`, and an edited
`config.yaml` does not move the probe before the agent has restarted onto it. The file lives
under `/tmp` rather than in the data volume, so an address from an earlier container does not
outlive it, and it is removed before each `listen()`, so a failed start leaves none behind.

Without the file — before the first `listen()`, or in an image from before it existed — the
probe asks `PBCM_CLIENT_PORT` (default `3001`), plain HTTP first and HTTPS only when the
connection fails. The certificate is not verified in either case: the request goes to
`127.0.0.1` inside the container, where no name in it would match, and sends nothing that
needs protecting.

### 5. Event Handlers (`src/features/Handlers.ts`)

Incoming WebSocket messages from the server (e.g., manual trigger requests from the dashboard) are routed to these handlers:

- `JOB_LIST_CONFIG` → returns all local job configs
- `JOB_SAVE_CONFIG` → persists a job config update locally and reschedules
- `JOB_DELETE_CONFIG` → removes a job and cancels its schedule
- `ABORT_RUN` → asks the `Executor` to end a run that is under way, and answers whether it could
- `GENERATE_KEY_CONFIG` → generates a new encryption key
- `FS_LIST` → lists directories/files on the local file system
- `GET_VERSION` → returns the agent version
- `HISTORY` → returns local job history

Three message types are dispatched in `core/Connection.ts` rather than here, because they
do not answer a request: `RUN_BACKUP` and `RUN_RESTORE` go straight to the `Executor`, and
`TUNNEL_ACQUIRE_RESULT` resolves the lease the `TunnelClient` is waiting on. The validation
table `INBOUND_SCHEMAS` in that file covers all of them, handled here or not.

## 🗄 Data Files

The agent keeps its state as JSON files in its data directory: `client/data`, or the path in
`PBCM_CLIENT_DATA_DIR`. In the container that is the `client-data` volume. This is what lets
the agent run its scheduled backups with no server in reach.

| File                  | Contents                                                              |
| :-------------------- | :-------------------------------------------------------------------- |
| `identity.json`       | `clientId` and `authToken`, issued by the server at registration. Without it the agent is unregistered. An older agent's pair is moved here out of `config.yaml` on the first start. |
| `jobs.json`           | The job configurations. The **only copy** there is: the server lists, saves and deletes jobs through the agent and keeps none of them. |
| `schedule.json`       | Last and next run time per job, plus the entered start (`anchor`) the time of day is taken from and when the schedule was last saved (`enteredAt`). Written on every scheduled run, so it is kept apart from `jobs.json`. |
| `history/<run>.json`  | One file per run: status, timing, exit code, output, the snapshot of a backup (`snapshot`, `snapshotDetails`, `snapshotError`), and the sync revisions. |

- **Atomic writes**: every file is written to a temporary file, synced, and renamed over the
  old one, so a power cut leaves either the old or the new version, never half of one.
- **Readable by the agent only**: the directory is `0700` (set again at every start) and every
  file `0600`. `jobs.json` holds the PBS encryption keys and the repository secrets in plain
  text.
- **Damaged files are set aside, not overwritten**: a `jobs.json` that does not parse is
  renamed to `jobs.json.corrupt-<timestamp>` and reported in the log; entries that do not
  parse are dropped and the original file is kept the same way. Restore from there by hand.
  An `identity.json` that does not parse, or is not the pair, is set aside likewise; the
  agent then starts unregistered.
- **Retention**: a run stays until the server has acknowledged it. Of the acknowledged
  ones, the newest 50 are kept — as many as the agent's own `HISTORY` answer returns — and
  the rest are deleted after each acknowledgement. Queued and running runs are always kept.
  An agent cut off from its server keeps what it has not delivered until it is back — **up
  to 500 runs**. Past that, each new run drops the oldest undelivered one, with a warning
  in the log (`History full, dropped the oldest unacknowledged runs`); those never reach
  the server. A run holds at most twice `logCapBytes` of output, so the limit bounds the
  history at about 256 MB with the defaults. At one run an hour that is about three weeks
  of outage, at one a day well over a year.
- **Import from SQLite**: an agent that still has the `client.db` of an older version
  imports its jobs and their schedule state on the first start and renames the database to
  `client.db.migrated`. The **history is not imported**; runs the server had not received
  by then do not reach it (the log says how many). The import uses `node:sqlite` and needs
  Node 22.13 or later; if it fails, the agent does not start, so that no job is lost.

## Outbound mode and the tunnel

Two separate things, and the agent treats them as such.

Without a `serverUrl`, the agent runs in **outbound mode**: it does not dial out itself but serves `/ws/register` and `/ws/agent`
instead. That is the whole of it — it says nothing about how the PBS is reached.

Whether a run goes **through the tunnel** is each job's own setting: `tunnel.required` arrives
with the job config, is stored with it, and is read back before the run. When it is set, the
agent requests a lease through `TunnelClient` and replaces host and port in `PBS_REPOSITORY`
with the loopback endpoint. Living in the job config is what makes a scheduled run offline
take the route the operator chose — and it is the only copy of the setting, so nothing can
fall out of step with it.

A **restore** carries the same `tunnel.required`, but in the `RUN_RESTORE` payload rather than
in a stored config: it is triggered from the dashboard, is never scheduled, and the operator
answers the question in the restore form. Absent means a direct connection.
Details: [tunnel.md](tunnel.md).

Neither of the two protects the agent session itself. The tunnel is asked for per run and
released afterwards; the WebSocket the server dials stands beside it and is plaintext unless
the agent serves TLS. That is what the `tls` block above is for.
