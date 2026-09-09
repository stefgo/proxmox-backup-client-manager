# Proxmox Backup Client Manager (PBCM)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v22+-green.svg)](https://nodejs.org/) ![Build Workflow](https://github.com/stefgo/proxmox-backup-client-manager/actions/workflows/build.yml/badge.svg)

The **Proxmox Backup Client Manager** (PBCM) is a centralized management system for controlling multiple `proxmox-backup-client` instances across your infrastructure. It consists of a lightweight Node.js agent running on your clients and a central Fastify/React-based server providing a dashboard and API.

## 🚀 Features

- **Centralized Management:** View and manage all your backup clients from a single web dashboard.
- **Job Scheduling & Execution:** Configure remote backup jobs, define schedules (cron-like), and trigger immediate backups or restores.
- **Global History & Sync:** Centralized job execution history synchronized from all clients for a unified overview.
- **Real-time Monitoring:** View live log streams and status updates of ongoing backup and restore runs via WebSockets.
- **File Browser:** Browse the remote file system of your clients directly from the web interface for selective backups or restores.
- **Secure Communication:** Use secure WebSocket connections between clients and the server, authenticated via short-lived registration tokens.
- **Daily Maintenance:** Automated cleanup of old job histories and schedule states to keep the local database lean.
- **Authentication:** Supports local admin authentication and OIDC (OpenID Connect) for Single Sign-On.

## 🏗 Architecture

The project is structured as a monorepo containing four main components:

1.  **Server Backend (`server/backend`):** A Fastify API server acting as the control plane. It holds the SQLite database for configurations and job histories.
2.  **Server Frontend (`server/frontend`):** A modern React SPA (Single Page Application) built with Vite and Tailwind CSS.
3.  **Client Agent (`client`):** A lightweight Node.js daemon that wraps the `proxmox-backup-client` CLI, listens for commands, executes scheduled jobs, and reports back via WebSockets.
4.  **Shared Library (`shared`):** Single source of truth for TypeScript types, Zod validation schemas, and constants used by all components.

## 📚 Documentation

The full documentation is published at
**[stefgo.github.io/proxmox-backup-client-manager](https://stefgo.github.io/proxmox-backup-client-manager/)**
and its sources live in the [`docs/`](./docs) directory:

- [Installation & Setup](docs/install.md) - Detailed guide on how to build and run the project locally.
- [API Documentation](docs/api.md) - Full specification of the REST and WebSocket APIs.
- [Frontend Architecture](docs/frontend.md) - Overview of the React application structure, state management, and design system.
- [Backend Architecture](docs/backend.md) - Controllers, services, WebSocket protocol, and database schema.
- [Client Agent](docs/client.md) - Agent lifecycle, scheduler, executor, and offline operation.
- [Development Guide](docs/development.md) - Local development setup and contribution guidelines.

## 🐳 Quick Start (Docker Compose)

### Server

The easiest way to get the server running is using Docker Compose. A production-ready example `compose.yaml` could look like this:

```yaml
services:
    pbcm-server:
        container_name: pbcm-server
        # The image is multi-platform and supports both x86_64 and ARM64
        image: ghcr.io/stefgo/pbcm-server:latest
        ports:
            - "3000:3000"
        volumes:
            - ./server-data:/app/server/backend/data
            - ./server-config.yaml:/app/server/config.yaml
        restart: unless-stopped
        environment:
            - NODE_ENV=production
```

1. Copy `server/config.example.yaml` to `server-config.yaml` and configure your settings (like OIDC).
2. Run `docker compose up -d`
3. Access the dashboard at `http://localhost:3000` (Default credentials: `admin` / `admin`).

### Client

For the client agent, you also need to pass the host's files that you wish to backup, as well as the configuration.

```yaml
services:
    pbcm-client:
        container_name: pbcm-client
        # Use pbcm-client:latest for x86_64 or pbcm-client-arm64:latest for ARM64 (e.g. Raspberry Pi)
        image: ghcr.io/stefgo/pbcm-client:latest
        volumes:
            - ./client-config.yaml:/app/client/config.yaml
            - ./client-data:/app/client/data
            # Mount the host root to allow backing up host files
            - /:/mnt/host:ro
        restart: unless-stopped
        environment:
            - NODE_ENV=production
```

1. Copy `client/config.example.yaml` to `client-config.yaml`.
2. Provide the Server URL and a newly generated registration token (obtained from the web dashboard).
3. Run `docker compose up -d`.

## 🔧 Development

### Prerequisites

- **Node.js v22** — pinned in [`.nvmrc`](.nvmrc) and matching the `node:22` base image used by the Dockerfiles.
- **npm v11** — Node 22 ships npm 10, which is _not_ enough: the lockfile is written with npm 11, and the two disagree about the optional peers of `@commitlint/read`, so `npm ci` fails under npm 10. The exact version lives in `packageManager` in `package.json`; install it with

    ```bash
    npm i -g "npm@$(node -p "require('./package.json').packageManager.split('@')[1]")"
    ```

- **A GitHub Packages token** — the UI library `@stefgo/react-ui-components` is published to GitHub Packages, and the root [`.npmrc`](.npmrc) reads the credential from `NPM_TOKEN`. Without it `npm install` fails with `401 Unauthorized` on the `@stefgo` scope. A classic PAT with `read:packages` scope is sufficient.

### Local Setup

1. Clone the repository: `git clone https://github.com/stefgo/proxmox-backup-client-manager`
2. Export the registry token: `export NPM_TOKEN=ghp_…` — it has to be in the environment; npm expands `${NPM_TOKEN}` from there, not from a `.env` file (that one is for the Compose builds)
3. Install dependencies: `npm install`
4. Build the shared library: `npm run build -w shared`
5. Start the backend: `npm run dev:server` — API and dashboard on `http://localhost:3000`
6. Start the frontend dev server: `npm run dev:frontend` — hot reload on `http://localhost:5173`, proxying `/api` and `/ws` to the backend
7. Start a test client: `npm run dev:client`

Steps 5 and 6 are separate processes. Only the Vite dev server gives you hot module
replacement; the backend serves the _built_ frontend from `server/dist/public`, so for
a production-like check `npm run build` followed by step 5 alone is enough.

See [Installation & Setup](docs/install.md) for the full guide.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## 🚫 Disclaimer

This is an unofficial, community-driven project. It is not affiliated with, endorsed by, or associated with Proxmox Server Solutions GmbH. "Proxmox" is a registered trademark of Proxmox Server Solutions GmbH.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
