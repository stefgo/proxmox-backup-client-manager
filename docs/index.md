# Proxmox Backup Client Manager

**PBCM** is a centralized management system for `proxmox-backup-client` instances. A
lightweight Node.js agent runs on each machine you back up; a central Fastify/React
server gives you one dashboard and one API for all of them.

!!! warning "Unofficial project"

    PBCM is community-driven. It is not affiliated with, endorsed by, or associated
    with Proxmox Server Solutions GmbH. "Proxmox" is a registered trademark of
    Proxmox Server Solutions GmbH.

<div class="grid cards" markdown>

-   :material-rocket-launch: **Install it**

    ---

    Prerequisites, Docker Compose, bare-metal setup and the first login.

    [:octicons-arrow-right-24: Installation & Setup](install.md)

-   :material-sitemap: **Understand it**

    ---

    How the control plane, the dashboard and the agent fit together.

    [:octicons-arrow-right-24: Backend](backend.md) ·
    [:octicons-arrow-right-24: Frontend](frontend.md) ·
    [:octicons-arrow-right-24: Client Agent](client.md)

-   :material-api: **Integrate with it**

    ---

    Every REST endpoint and both WebSocket protocols, request and response shapes
    included.

    [:octicons-arrow-right-24: API Reference](api.md)

-   :material-source-branch: **Contribute to it**

    ---

    Local environment, the Conventional Commits the release is derived from, and the
    build pipeline.

    [:octicons-arrow-right-24: Development Guide](development.md)

</div>

## What it does

- **Centralized management** — view and manage every backup client from one dashboard.
- **Job scheduling & execution** — configure remote backup jobs with cron-like
  schedules, or trigger a backup or restore right now.
- **Global history & sync** — execution history from all clients, collected into one view.
- **Real-time monitoring** — live log streams and status updates over WebSockets.
- **File browser** — browse a client's remote file system for selective backups and restores.
- **Secure communication** — agents authenticate with short-lived registration tokens;
  clients that cannot reach the Proxmox Backup Server themselves go through an
  [SSH reverse tunnel](tunnel.md).
- **Authentication** — local admin accounts and OIDC single sign-on.
- **Daily maintenance** — automatic cleanup of old histories and schedule state.

## How the pieces fit together

```
Browser ──REST /api/v1/*──► Backend (Fastify)
        ──WS /ws/dashboard──►         │
                                      │
Agent ────WS /ws/agent────────────────┘
```

The repository is an npm monorepo with four workspaces:

| Workspace | What it is |
|---|---|
| [`server/backend`](backend.md) | Fastify API server — the control plane and the WebSocket hub, holding the SQLite database of configurations and job histories. |
| [`server/frontend`](frontend.md) | React SPA (Vite, Tailwind, Zustand), served by the backend from `server/dist/public`. |
| [`client`](client.md) | Lightweight Node.js daemon wrapping the `proxmox-backup-client` CLI. It keeps its own SQLite copy of the job configs and runs them on schedule **even while the server is unreachable**. |
| `shared` | Single source of truth for the TypeScript types, Zod schemas and constants the other three agree on. |

The central piece on the server side is the `ProxyService`: it owns the live agent
connections, caches job state and fans updates out to every connected dashboard. The
frontend never polls.

## Getting started in one minute

```bash
# Server
docker run -d --name pbcm-server -p 3000:3000 \
    -v ./server-data:/app/server/backend/data \
    -v ./server-config.yaml:/app/server/config.yaml \
    ghcr.io/stefgo/pbcm-server:latest
```

Then open <http://localhost:3000> and log in with `admin` / `admin`. The full
Compose files, the client agent and the configuration reference are in
[Installation & Setup](install.md).
