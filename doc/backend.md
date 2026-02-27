# ⚙️ Backend Architecture

This documentation details the architecture of the server backend (`server/backend`), which serves as the control plane for the Proxmox Backup Client Manager.

## 📂 Project Structure

The backend is built using **Fastify** as the core framework, written in **TypeScript**. It follows a standard **Model-View-Controller (MVC)**-like architecture combined with centralized services for external integrations.

```
server/backend/src/
├── config/        # Environment and app configuration loading
├── controllers/   # Route handlers (HTTP incoming requests)
├── core/          # Core server instances (e.g., Database initialization)
├── routes/        # Fastify route definitions (Plugin registrations)
├── services/      # Business logic and external API integrations
├── utils/         # Helper functions
└── index.ts       # Application entry point
```

## 🏗 Core Components

### 1. Controllers (`src/controllers/`)

Controllers handle HTTP requests and responses. They enforce input parsing, delegate business logic to `services`, and format Fastify replies.

- **Example**: `ClientController.ts` handles REST operations like fetching, deleting clients, or triggering backups.

### 2. Services (`src/services/`)

Services contain the heavy business logic of the application. They are designed as singletons or static classes that multiple controllers can rely on.

- **Example**: `ProxyService.ts` handles proxying requests to the actual Proxmox Backup Server. `CleanupService.ts` ensures old history logs or inactive tokens are pruned.

### 3. Routes (`src/routes/`)

Routes are Fastify plugins. They map HTTP verbs (GET, POST, PUT, DELETE) to specific methods in the Controllers and handle generic middleware (e.g., verifying JWT tokens).

### 4. WebSocket Manager

Real-time communication with the client agents is handled via WebSockets (using `@fastify/websocket`).
The `WebSocketController` is responsible for:

- Authenticating incoming WebSocket connections from clients using short-lived registration tokens or connection tokens.
- Keeping track of connected clients in memory.
- Forwarding job trigger events from the REST API to the active WebSocket connection.
- Receiving live log streams or status updates from clients and saving them to the database.

## 🗄 Database Management

The backend relies on **SQLite3** wrapped with `better-sqlite3` for fast, synchronous database operations.

- The `core/` directory handles initializing the DB file location and running schemas.
- It stores: User credentials, Client tokens, Registered Clients, PBS Configurations, and complete Job Histories.

_(Note: Database migrations using `umzug` are planned/implemented to handle schema updates.)_

## 🔐 Authentication Flow

- **Local Login**: Standard username/password validation against bcrypt-hashed passwords in SQLite.
- **OIDC Login**: OpenID Connect flow supported out of the box. Redirects to Provider and exchanges the callback code for a local JWT session.
- **Agent Auth**: Agents authenticate via WebSockets using tokens generated on the dashboard.
