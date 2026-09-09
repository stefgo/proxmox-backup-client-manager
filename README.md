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

## 📚 Documentation

The full documentation is published at
**[stefgo.github.io/proxmox-backup-client-manager](https://stefgo.github.io/proxmox-backup-client-manager/)**; its sources live in the [`docs/`](./docs) directory:

- [Installing the Server](https://stefgo.github.io/proxmox-backup-client-manager/install-server/) - Running the control plane with Docker Compose.
- [Installing a Client Agent](https://stefgo.github.io/proxmox-backup-client-manager/install-client/) - Running an agent on a machine you back up.
- [Configuration](https://stefgo.github.io/proxmox-backup-client-manager/setup/) - Every `config.yaml` key and environment variable.
- [API Documentation](https://stefgo.github.io/proxmox-backup-client-manager/api/) - Full specification of the REST and WebSocket APIs.
- [Frontend Architecture](https://stefgo.github.io/proxmox-backup-client-manager/frontend/) - Overview of the React application structure, state management, and design system.
- [Backend Architecture](https://stefgo.github.io/proxmox-backup-client-manager/backend/) - Controllers, services, WebSocket protocol, and database schema.
- [Client Agent](https://stefgo.github.io/proxmox-backup-client-manager/client/) - Agent lifecycle, scheduler, executor, and offline operation.
- [Development Guide](https://stefgo.github.io/proxmox-backup-client-manager/development/) - Local development setup and contribution guidelines.

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

1. Copy `server/config.example.yaml` to `server-config.yaml` — the file has to exist before the container starts, or Docker creates a directory in its place.
2. Run `docker compose up -d`
3. Access the dashboard at `http://localhost:3000` (default credentials: `admin` / `admin` — change the password).

Full walkthrough: [Installing the Server](https://stefgo.github.io/proxmox-backup-client-manager/install-server/).

### Client

For the client agent, you also need to pass the host's files that you wish to backup, as well as the configuration.

```yaml
services:
    pbcm-client:
        container_name: pbcm-client
        # Use pbcm-client:latest for x86_64 or pbcm-client-arm64:latest for ARM64 (e.g. Raspberry Pi)
        image: ghcr.io/stefgo/pbcm-client:latest
        ports:
            # The local Web UI, needed once to register the agent
            - "3001:3001"
        volumes:
            - ./client-config.yaml:/app/client/config.yaml
            - ./client-data:/app/client/data
            # Mount the host root to allow backing up host files
            - /:/mnt/host:ro
        restart: unless-stopped
        environment:
            - NODE_ENV=production
```

`proxmox-backup-client` is part of the image — the host needs no Proxmox packages.

1. Copy `client/config.example.yaml` to `client-config.yaml`. Leave `clientId` and `authToken` empty; the server issues both.
2. Run `docker compose up -d`, then read the setup PIN from `docker compose logs pbcm-client`.
3. Open `http://<this-host>:3001/register` and enter the server URL, a registration token from the dashboard, and the PIN.

Note that a job's source paths are **container** paths: with the mount above, `/etc` is configured as `/mnt/host/etc`.

Full walkthrough, including outbound mode: [Installing a Client Agent](https://stefgo.github.io/proxmox-backup-client-manager/install-client/).

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## 🚫 Disclaimer

This is an unofficial, community-driven project. It is not affiliated with, endorsed by, or associated with Proxmox Server Solutions GmbH. "Proxmox" is a registered trademark of Proxmox Server Solutions GmbH.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
