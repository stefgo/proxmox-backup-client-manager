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
| `JobController.ts`          | Job CRUD, manual backup/restore triggers, encryption key generation.        |
| `RepositoryController.ts`   | PBS repository CRUD, status check, snapshot listing, certificate probe, fingerprint distribution. |
| `TokenController.ts`        | Registration token management, public client registration endpoint.         |
| `UserController.ts`         | User CRUD.                                                                  |
| `SettingsController.ts`     | Cleanup settings read/write and manual maintenance trigger.                 |
| `HistoryController.ts`      | Global job history across all clients.                                      |
| `TunnelController.ts`       | SSH tunnel credentials per client (CRUD), key pair generation, connection tests against form values and against stored credentials. |
| `WebSocketController.ts`    | Entry point for WebSocket connections (agents and dashboards).               |

### 2. Services (`src/services/`)

Services contain the heavy business logic of the application. They are designed as singletons or static classes that multiple controllers can rely on.

- **`ProxyService.ts`**: The central communication hub. It manages active agent and dashboard connections, handles request/response correlation for agent commands, and maintains an in-memory job configuration cache.
- **`AuthService.ts`**: Handles user authentication, OIDC flows, and JWT generation.
- **`SessionCookie.ts`**: The browser session, as two cookies — `pbcm_session` (the JWT, `HttpOnly`) and `pbcm_auth` (a flag with no secret, readable so the UI knows whether to show the login form). Both are set from one place so the local login and the OIDC return cannot drift apart. `Secure` follows `request.protocol` rather than being hardcoded: set unconditionally it would make a plain-HTTP installation discard the cookie, and the login would look successful while every following request came back `401` — a failure that never shows on localhost, which counts as a secure context.
- **`SettingsService.ts`**: Manages global application settings and persistence.
- **`FingerprintObservations.ts`**: In-memory record of fingerprints reported by agents (`FINGERPRINT_OBSERVED`). Deliberately never written into the repository config — a single compromised client must not be able to set the value every other client then trusts.
- **`CleanupService.ts`**: Periodic tasks to prune old history logs (job history), inactive tokens, or old registration tokens. Supports retention by age and minimum count.
- **`ClientConnector.ts`**: Dials outbound clients — registration through the agent's `/ws/register`, then a session over `/ws/agent`. Its `RECONNECT_DELAYS` ladder is the same one the agent uses in the other direction, because the two ends of one link should not behave differently.
- **`TunnelService.ts`**: Establishes and tears down the SSH reverse tunnel on a client's request. See [tunnel.md](tunnel.md).
- **`SecretCrypto.ts`**: Encrypts the stored SSH private keys at rest (AES-256-GCM). The key is derived via HKDF from `tunnel.keySecret` and deliberately **not** from `jwtSecret` — rotating the secret that signs sessions must not make every stored SSH key unreadable. Configuring a tunnel therefore requires `tunnel.keySecret`; without it the service refuses rather than storing a key in the clear.

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

All protected routes require a valid JWT. The browser sends it as the `pbcm_session` cookie; the `Authorization: Bearer <token>` header keeps working for scripted clients, and `@fastify/jwt` accepts either. Outside of auth, two routes are public: `POST /v1/register` (client self-registration) and `GET /v1/ping` (health check).

`POST /login` carries a rate limit of ten attempts per fifteen minutes. The limiter is registered with `global: false` on purpose — a blanket limit would also count the agent handshakes and the dashboard's own traffic, where a larger fleet legitimately produces bursts.

### 4. WebSocket Controller & ProxyService

Real-time communication is handled via WebSockets (using `@fastify/websocket`).
The `WebSocketController` acts as the entry point, while `ProxyService` manages the lifecycle of these connections.

`WebSocketController.ts` holds only the entry points its callers use — the two handshakes for `index.ts`, `handleOutboundAgentConnection` for `ClientConnector`. The rest sits under `controllers/websocket/`:

| Module                  | Responsibility                                                                 |
| :---------------------- | :----------------------------------------------------------------------------- |
| `Heartbeat.ts`          | `attachHeartbeat(socket, onTimeout?)` — the 30-second ping/pong. Existed three times over, once per connection kind; the copies differed only in whether they logged the drop. |
| `AgentMessageRouter.ts` | A `type → handler` table for everything an authenticated agent sends. Was an `if` chain of seven branches, so each message was compared against all seven. Same shape as `INBOUND_SCHEMAS` in the agent's `core/Connection.ts`. |
| `TunnelLease.ts`        | Lease authorisation and the fingerprint handling. Together because that is where the tunnel's security property lives: the requesting client never names a host, the server derives the target from the job it pushed out. `repositoryTarget` lives here too, and `JobController` imports it from here. |

- **Authentication**: Incoming agent connections are validated against tokens and IP restrictions. Dashboard connections authenticate with the `pbcm_session` cookie, which the browser attaches to the handshake itself — there is no token in the URL.
- **Connection Management**: `ProxyService` tracks online agents and active dashboard sessions.
- **Request correlation**: Requests to agents are tracked in one `pending` map keyed by `requestId`, and `handleAgentMessage` routes every incoming message through `resolvePending`. This replaced a per-request `message` listener on the agent's socket: that shape tripped Node's `MaxListenersExceededWarning` at eleven concurrent requests and re-parsed every arriving message once per attached listener. It mirrors `Connection.request` in the agent, which has always worked this way. A closing socket rejects the client's outstanding requests immediately instead of leaving each to its own timeout.
- **Per-event timeouts**: `WS_REQUEST_TIMEOUT_MS` in `shared/src/constants.ts` sets how long the server waits per event, with a 5 s default. `FS_LIST` and `GENERATE_KEY_CONFIG` get 30 s — both are slow by nature, and under the old flat 5 s their answers arrived for a request nobody was waiting for any more.
- **Job Caching**: When an agent connects, `ProxyService` automatically refreshes its local job cache to ensure high-speed retrieval of job configurations.
- **Repository id backfill**: During that refresh, jobs whose embedded repository copy predates `repositoryId` are resolved by base URL plus datastore and stamped with the id (`backfillRepositoryIds`). Ambiguous or unmatched jobs are skipped with a warning rather than guessed. Without the id nothing can tell which managed repository a job belongs to, which is what fingerprint distribution needs.
- **Broadcasting**: `ProxyService` multicasts events (like job progress or log updates) from agents to all connected dashboards.

## 🗄 Database Management

The backend relies on **SQLite3** wrapped with `better-sqlite3` for fast, synchronous database operations.

- The `core/` directory handles initializing the DB file location and running schema migrations via **Umzug**.
- It stores: User credentials, client tokens, registered clients, PBS repository configurations, job configurations (cache), and complete job histories.

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
`resolveTunnelTarget` returns nothing for a job not configured for the tunnel, and a restore
target is pre-authorised per `runId` only when its request asked for the tunnel.

Credentials are attached only through `/clients/:clientId/tunnel`. `POST /clients/outbound`
creates the connection alone, so the irreversible decision (the mode) and the revisable one
(the route) never travel in one request.
`connection_mode` is only consulted where the WebSocket direction genuinely matters (dialling
and reconnecting, IP pinning, the target address). Details, setup and test protocol:
[tunnel.md](tunnel.md).
