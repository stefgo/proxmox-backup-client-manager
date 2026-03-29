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
├── core/                   # Base services: SQLite DB, WebSocket Connection, Logger, Config
│   ├── Config.ts           # YAML config loader and writer
│   ├── Connection.ts       # WebSocket client with auto-reconnect
│   ├── Database.ts         # SQLite initialization and migration runner
│   ├── Logger.ts           # Pino-based logger
│   └── migrations/         # Database schema migrations (Umzug)
├── features/               # Business logic
│   ├── Scheduler.ts        # node-cron based job scheduling
│   ├── Executor.ts         # proxmox-backup-client CLI wrapper
│   ├── Handlers.ts         # WebSocket message routing
│   └── Cleanup.ts          # Daily DB maintenance
├── repositories/           # Data access layer
│   ├── JobRepository.ts
│   ├── JobHistoryRepository.ts
│   └── JobScheduleStateRepository.ts
├── web/
│   └── server.ts           # Local Fastify web server (status & registration)
└── index.ts                # Application entry point
```

## 🏗 Core Components

### 1. Core Connection (`src/core/Connection.ts`)

The `Connection` class manages the persistent WebSocket connection to the central server.

- **Features**: Automatic reconnection with exponential backoff, ping/pong health checks, and secure transmission of all payload data.
- **Registration Flow**: If the client is unauthenticated, the user must provide a temporary registration `token`. The client POSTs this to the server, exchanges it for a permanent client configuration (auth token + clientId), and saves it locally to `config.yaml`.

### 2. Job Scheduler (`src/features/Scheduler.ts`)

The Scheduler is responsible for evaluating and triggering scheduled backup jobs locally, independent of server connectivity.

- It reads job configurations from the local SQLite database (synchronized from the server).
- For each job with an active schedule, it uses `node-cron` to register a timer.
- Upon reaching the scheduled time, it triggers the `Executor` autonomously.
- After execution, it updates the `job_schedule_state` table with the last and next run times, and emits a `JOB_NEXT_RUN_UPDATE` event to the server (if connected).

### 3. Job Executor (`src/features/Executor.ts`)

The Executor acts as a wrapper around the actual `proxmox-backup-client` CLI binaries.

- It translates abstract JSON job configurations into CLI arguments for `proxmox-backup-client backup` or `proxmox-backup-client restore`.
- It spawns a child process and captures real-time `stdout`/`stderr` streams, forwarding them as `LOG_UPDATE` events over the WebSocket.
- **History Synchronization**: Upon completion, the job result is stored in the local SQLite database. The client then syncs this history with the central server via `SYNC_HISTORY`.

### 4. Local Web Server (`src/web/server.ts`)

The client includes a micro-server (Fastify) for local management and initial setup.

- **Status Page**: Provides a quick overview of the client's connectivity and scheduling state.
- **Registration**: Allows manual registration via the web interface by entering a registration token obtained from the dashboard.

### 5. Event Handlers (`src/features/Handlers.ts`)

Incoming WebSocket messages from the server (e.g., manual trigger requests from the dashboard) are routed to these handlers.

- `RUN_BACKUP` → triggers immediate job execution via `Executor`
- `RUN_RESTORE` → triggers restore via `Executor`
- `JOB_LIST_CONFIG` → returns all local job configs
- `JOB_SAVE_CONFIG` → persists a job config update locally and reschedules
- `JOB_DELETE_CONFIG` → removes a job and cancels its schedule
- `GENERATE_KEY_CONFIG` → generates a new encryption key
- `FS_LIST` → lists directories/files on the local file system
- `GET_VERSION` → returns the agent version
- `HISTORY` → returns local job history

### 6. Cleanup (`src/features/Cleanup.ts`)

To prevent the local SQLite database from growing indefinitely, the client performs daily maintenance tasks.

- **Scheduling**: Uses `node-cron` to run a cleanup job every day at 00:00.
- **Pruning**: Deletes old `job_history` entries and orphaned `job_schedule_state` records based on the configured `retentionTime` (default: 90 days).

## 🗄 Database Management

The client uses a minimal **SQLite3** configuration (via `better-sqlite3`) to persist its identity, the jobs downloaded from the server, and local scheduling states. This ensures the client can function and evaluate scheduled backups completely offline.

Schema migrations are managed via **Umzug** and run automatically on startup.

### Database Schema

| Table                  | Contents                                                              |
| :--------------------- | :-------------------------------------------------------------------- |
| `jobs`                 | Job configurations synchronized from the server.                     |
| `job_history`          | Execution records (status, output, timing) for each backup/restore run. |
| `job_schedule_state`   | Last and next run timestamps per job for schedule tracking.           |
