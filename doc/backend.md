# ⚙️ Backend Architecture

This documentation details the architecture of the server backend (`server/backend`), which serves as the control plane for the Proxmox Backup Client Manager.

## 📂 Project Structure

The backend is built using **Fastify** as the core framework, written in **TypeScript**. It follows a standard **Model-View-Controller (MVC)**-like architecture combined with centralized services for external integrations.

```
server/backend/src/
├── config/        # Environment and app configuration loading
├── controllers/   # Route handlers (HTTP incoming requests)
├── core/          # Core server instances (Database initialization, migrations)
├── routes/        # Fastify route definitions (Plugin registrations)
├── services/      # Business logic and external API integrations
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
| `RepositoryController.ts`   | PBS repository CRUD, status check, snapshot listing.                        |
| `TokenController.ts`        | Registration token management, public client registration endpoint.         |
| `UserController.ts`         | User CRUD.                                                                  |
| `SettingsController.ts`     | Cleanup settings read/write and manual maintenance trigger.                 |
| `HistoryController.ts`      | Global job history across all clients.                                      |
| `WebSocketController.ts`    | Entry point for WebSocket connections (agents and dashboards).               |

### 2. Services (`src/services/`)

Services contain the heavy business logic of the application. They are designed as singletons or static classes that multiple controllers can rely on.

- **`ProxyService.ts`**: The central communication hub. It manages active agent and dashboard connections, handles request/response correlation for agent commands, and maintains an in-memory job configuration cache.
- **`AuthService.ts`**: Handles user authentication, OIDC flows, and JWT generation.
- **`SettingsService.ts`**: Manages global application settings and persistence.
- **`CleanupService.ts`**: Periodic tasks to prune old history logs (job history), inactive tokens, or old registration tokens. Supports retention by age and minimum count.

### 3. Routes (`src/routes/`)

Routes are Fastify plugins. They map HTTP verbs (GET, POST, PUT, DELETE) to specific methods in the Controllers and handle generic middleware (e.g., verifying JWT tokens).

All protected routes require a valid JWT in the `Authorization` header (`Bearer <token>`). The single public API route outside of auth is `POST /v1/register` (client self-registration).

### 4. WebSocket Controller & ProxyService

Real-time communication is handled via WebSockets (using `@fastify/websocket`).
The `WebSocketController` acts as the entry point, while `ProxyService` manages the lifecycle of these connections.

- **Authentication**: Incoming agent connections are validated against tokens and IP restrictions.
- **Connection Management**: `ProxyService` tracks online agents and active dashboard sessions.
- **Job Caching**: When an agent connects, `ProxyService` automatically refreshes its local job cache to ensure high-speed retrieval of job configurations.
- **Broadcasting**: `ProxyService` multicasts events (like job progress or log updates) from agents to all connected dashboards.

## 🗄 Database Management

The backend relies on **SQLite3** wrapped with `better-sqlite3` for fast, synchronous database operations.

- The `core/` directory handles initializing the DB file location and running schema migrations via **Umzug**.
- It stores: User credentials, client tokens, registered clients, PBS repository configurations, job configurations (cache), and complete job histories.

## 🔐 Authentication Flow

- **Local Login**: Standard username/password validation against bcrypt-hashed passwords in SQLite.
- **OIDC Login**: OpenID Connect flow supported out of the box. Redirects to Provider and exchanges the callback code for a local JWT session.
- **Agent Auth**: Agents authenticate via WebSockets using tokens generated on the dashboard.
