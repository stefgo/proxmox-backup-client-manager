# 🤖 Client Agent Architecture

This documentation details the architecture of the Node.js client agent (`client/`), which runs on the machines that are being backed up.

## 📂 Project Structure

The client is a lightweight, headless Node.js process designed to run as a daemon (either via systemd or Docker).

```
client/src/
├── core/          # Core utilities: SQLite DB, Websocket Connection, Logger, Config
├── features/      # Business logic: Job Scheduling, Command Execution, WS Handlers
└── index.ts       # Application entry point
```

## 🏗 Core Components

### 1. Core Connection (`src/core/Connection.ts`)

The `Connection` class manages the persistent WebSocket connection to the central server.

- **Features**: Automatic reconnection with exponential backoff, ping/pong health checks, and secure transmission of all payload data.
- **Registration Flow**: If the client is unauthenticated, the user must provide a temporary registration `token`. The client POSTs this to the server, exchanges it for a permanent client configuration, and saves it locally.

### 2. Job Executor (`src/features/Executor.ts`)

The Executor acts as a wrapper around the actual `proxmox-backup-client` CLI binaries.

- It translates abstract JSON job configurations from the server into CLI arguments (e.g., `--include-dev`, `--repository`).
- It spawns a child process (`child_process.spawn`) for the backup run.
- It captures `stdout` and `stderr` streams, forwarding them in real-time to the server via the WebSocket connection so users can view live logs in the dashboard.

### 3. Scheduler (`src/features/Scheduler.ts`)

To ensure backups run even if the server connection temporarily drops, the client maintains its own scheduling mechanism.

- It evaluates cron strings associated with jobs.
- It maintains the Next Run Time in a local SQLite database table (`job_schedule_state`).
- Upon reaching the scheduled time, it triggers the `Executor` autonomously and attempts to upload the result to the server immediately (or buffers it if offline).

### 4. Event Handlers (`src/features/Handlers.ts`)

Incoming WebSocket messages from the server (e.g., manual trigger requests from the dashboard) are routed to these handlers.

## 🗄 Database Management

The client uses a minimal **SQLite3** configuration to persist its identity, the jobs downloaded from the server, and local scheduling states. This ensures the client can function and evaluate scheduled backups completely offline.

_(Note: Database migrations using `umzug` are planned/implemented to handle schema updates over time.)_
