# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Proxmox Backup Client Manager (PBCM)** is a centralized management system for `proxmox-backup-client` instances. It consists of three workspaces in an npm monorepo:

- **`server/backend`** – Fastify API server (control plane, WebSocket hub)
- **`server/frontend`** – React SPA (Vite + Tailwind + Zustand)
- **`client`** – Lightweight Node.js agent running on backed-up machines
- **`shared`** – Shared TypeScript types, Zod schemas, and constants used by all workspaces

## Commands

### Root-level
```bash
npm install          # Install all workspace dependencies
npm run build        # Build all workspaces (shared → rest)
npm run dev:server   # Backend in watch mode
npm run dev:frontend # Frontend Vite dev server (localhost:5173)
npm run dev:client   # Client agent in watch mode
npm run clean        # Remove all build artifacts
```

### Per-workspace
```bash
npm run lint -w server/frontend    # ESLint (frontend only)
npm run build -w shared            # Rebuild shared types after changes
```

### Testing

There are no automated tests in this project.

### Docker (development)
```bash
docker compose -f compose.dev.yml up --build
# server-dev on :3000, client-dev on :3001
```

## Architecture

### Communication Flow

```
Browser ──REST /api/v1/*──► Backend (Fastify)
        ──WS /ws/dashboard──►         │
                                      │
Agent ────WS /ws/agent────────────────┘
```

- The **`ProxyService`** in the backend is the central hub: it manages active agent WebSocket connections, caches job states, and broadcasts updates to dashboard clients.
- The **client agent** runs completely offline-capable: it stores downloaded job configs in its own SQLite DB and runs backups via `node-cron` independently of the server connection.
- Both server and client use **SQLite** (`better-sqlite3`) with **umzug** migrations. DB files live at `server/backend/data/pbcm.db` and `client/data/pbcm.db`.

### Frontend State Management

State is split across Zustand stores in `server/frontend/src/stores/`:
- `useUIStore` – sidebar, modals, filters, notifications
- `useClientStore` – client list and online/offline status (fed by WebSocket)
- `useClientDetailStore` – selected client data, history, jobs
- `useGlobalJobsStore` – centralized backup job configs
- `useRepositoryStore` / `useRepositorySnapshotStore` – PBS repository data

WebSocket updates from `/ws/dashboard` flow into these stores; the frontend does not poll.

### Shared Library

Any type, schema, or constant used across workspaces lives in `shared/`. After modifying `shared/src/`, run `npm run build -w shared` (or the root `npm run build`) before the other workspaces will pick up the changes.

### Backend Route Structure

- Unauthenticated: `POST /api/login`, `/api/auth/*` (OIDC)
- Protected (JWT required): `/api/v1/users`, `/api/v1/clients`, `/api/v1/repositories`, `/api/v1/tokens`, job/history/snapshot endpoints
- WebSocket: `/ws/dashboard` (browser), `/ws/agent` (client agent)

### Configuration

Both the backend and client are configured via a `config.yaml` file (auto-generated on first run). Key backend settings include `jwtSecret`, optional OIDC config, and retention policies. The client config stores `server_url`, `client_id`, and `client_secret` (set on first registration).

Environment variables of note:
- `LOG_LEVEL` / `LOG_FORMAT` (both)
- `NODE_ENV`
- `VITE_USE_LOCAL_UI` / `VITE_UI_COMPONENTS_PATH` (frontend, for local development with the UI component library)

## Code Style

- **Indentation**: 4 spaces for backend/client/shared, 2 spaces for frontend (enforced via `.editorconfig`)
- **TypeScript**: strict mode everywhere
- **Frontend linting**: ESLint with `react-hooks` and `react-refresh` plugins
- **UI components**: `@stefgo/react-ui-components` – custom external library; styles are resolved via `tailwind.config.js` using `VITE_UI_COMPONENTS_PATH`

## Key Docs

Detailed documentation lives in `/doc/`:
- `backend.md` – Controllers, services, WebSocket protocol
- `frontend.md` – Routing, stores, component conventions
- `client.md` – Agent lifecycle, scheduler, executor
- `api.md` – Full REST and WebSocket API spec
