# Installation & Setup

## Prerequisites

- **Node.js**: v22 — pinned in `.nvmrc`, matching the `node:22` base image of the Dockerfiles.
- **npm**: v11 — the lockfile is written with npm 11. npm 10 (which Node 22 ships)
  disagrees with it about the optional peers of `@commitlint/read` and fails `npm ci`.
  `packageManager` in the root `package.json` is the single source for the exact version:

    ```bash
    npm i -g "npm@$(node -p "require('./package.json').packageManager.split('@')[1]")"
    ```

- **`NPM_TOKEN`**: a GitHub PAT with `read:packages`. The UI library
  `@stefgo/react-ui-components` comes from GitHub Packages, and the root `.npmrc` reads
  the credential from this variable. See
  [development.md](development.md#registry-authentication) for the CI and Docker variants.
- **Docker** & **Docker Compose** (optional, for container-based setup)

## Project Structure

The project is organized as a monorepo:

- `client`: The backup client (Node.js/TypeScript)
- `server/backend`: The API server (Fastify)
- `server/frontend`: The web dashboard (React/Vite)
- `shared`: Shared types and utilities

## Installation (Local)

1.  **Clone repository:**

    ```bash
    git clone https://github.com/stefgo/proxmox-backup-client-manager
    cd proxmox-backup-client-manager
    ```

2.  **Export the registry token:**
    `npm install` fails without it — see the prerequisites above.

    ```bash
    export NPM_TOKEN=ghp_…
    ```

3.  **Install dependencies:**
    Run this command in the root directory to install all dependencies for all workspaces:

    ```bash
    npm install
    ```

4.  **Build Shared Library:**
    Before the client or server can start, the shared library must be built:
    ```bash
    npm run build -w shared
    ```

## Starting (Development)

### Variant A: Local (without Docker)

You can start the client and server separately.

**Start Server (Backend):**

```bash
npm run dev:server
```

_The backend runs on <http://localhost:3000> by default._

**Start Frontend (Vite Dev Server):**

```bash
npm run dev:frontend
```

_The frontend dev server runs on <http://localhost:5173> with hot module replacement. Vite proxies `/api` and `/ws` requests to the backend._

**Start Client Agent:**

```bash
npm run dev:client
```

### Note on Platform Support (ARM64)

If you are running the client on an ARM64 platform (e.g., Raspberry Pi), we provide a dedicated Docker image and Dockerfile:

- **Docker Image**: `ghcr.io/stefgo/pbcm-client-arm64:latest`
- **Dockerfile**: `docker/Dockerfile.client.arm64`

The standard `pbcm-client` image is built for `linux/amd64`.

### Variant B: Docker Compose

For a complete development environment including isolation:

```bash
docker compose -f compose.dev.yaml up -d --build
```

- **Server**: <http://localhost:3000> (Supports both x86_64 and ARM64)
- View logs: `docker compose -f compose.dev.yaml logs -f`

## Configuration

The behavior of the client and server can be controlled via environment variables.

### Logging

| Variable     | Values                             | Default       | Description                                                                                              |
| :----------- | :--------------------------------- | :------------ | :------------------------------------------------------------------------------------------------------- |
| `LOG_LEVEL`  | `debug`, `info`, `warn`, `error`   | `info`        | Controls the verbosity of the logs.                                                                      |
| `LOG_FORMAT` | `pretty`, `one-line`, `json`       | _auto_        | `pretty` for single-line, colored logs (default in Dev). `json` for structured output (default in Prod). `one-line` is an accepted alias of `pretty` — the transport always sets `singleLine`, so there is no separate multi-line mode for it to switch off. |
| `SERVER_URL` | URL (e.g., `wss://localhost:3000`) | _from config_ | (Client only) Overrides the server URL from `config.yaml`.                                               |
| `NODE_ENV`   | `development`, `production`        | `development` | Controls general behavior like logging defaults.                                                         |

**Examples:**

```bash
# Force debug level and JSON output
LOG_LEVEL=debug LOG_FORMAT=json npm run dev -w server/backend
```

### Configuration Files (`config.yaml`)

In addition to environment variables, there are configuration files for specific settings.

#### Client Config (`client/config.yaml`)

This file is created automatically or can be created manually.

| Key             | Description                                                                        |
| :-------------- | :--------------------------------------------------------------------------------- |
| `serverUrl`     | URL to the management server (e.g., `wss://backup-server:3000/ws`).                |
| `clientId`      | Unique ID of the client (generated automatically).                                 |
| `executable`    | Path to the `proxmox-backup-client` executable (default: `proxmox-backup-client`). |
| `retentionTime` | Number of days to keep job history and schedule states (default: `90`).            |
| `allowedNetworks` | Outbound mode only: list of CIDR networks the **server** may dial this agent from, checked on `/ws/register` and `/ws/agent`. Empty (default) allows every address. The local Web UI on the same port is not restricted by it. |

#### Server Config (`server/config.yaml`)

This file contains advanced settings for the server, specifically for authentication.

| Key         | Sub-Key         | Description                             |
| :---------- | :-------------- | :-------------------------------------- |
| `oidc`      | `enabled`       | Enables/Disables (true/false) OIDC.     |
|             | `issuer`        | OIDC Issuer URL.                        |
|             | `client_id`     | OIDC Client ID.                         |
|             | `client_secret` | OIDC Client Secret.                     |
|             | `redirect_uri`  | OIDC Redirect URI.                      |
| `jwtSecret` | (Root)          | Generated automatically if not present. |
| `security`  | `allowed_networks` | List of CIDR networks an agent may connect to `/ws/agent` from. Empty (default) allows every address. |

### Address checks for agent connections

Three settings decide where an agent connection may come from, and they answer different
questions:

| Setting | Scope | Question |
| :------ | :---- | :------- |
| `security.allowed_networks` (server) | all agents | May *any* agent connect from this network? |
| `clients.inbound_allowed_ip` (per client, set with the registration token and editable in the client editor) | one client | Does this address belong to *this* token? |
| `allowedNetworks` (client) | one agent's listener | May the server dial this agent from this network? |

All three are opt-in and mean the same thing when unset: no restriction. An empty network
list allows every address, and a client whose `inbound_allowed_ip` is `NULL` is not checked
against an address at all -- its token alone admits it, from anywhere the server-wide
`allowed_networks` permits.

The per-client check is switched on in the client editor ("Restrict connections to an IP or
network"); the field is required only while that box is ticked. A registration token may
carry the value instead, in which case the client starts out restricted. A token without
one leaves the column `NULL`: the address an agent happens to register from is not a
decision anyone made, and binding a client to it is how a container on a bridge network
locks itself out the next time its subnet changes.

Leave the check off for hosts whose address is assigned by their environment -- containers,
DHCP without a reservation. Turn it on where the address is fixed and the token would
otherwise be usable from anywhere: it is the only check that ties an address to *one*
client rather than to all of them.

> **Upgrade note:** `security.trusted_networks` no longer exists. It used to skip the
> per-client address check for agents connecting from a listed network, which meant a
> client whose address had drifted (DHCP, for example) still connected. Such a client is
> now refused at its next reconnect. Before upgrading, compare each inbound client's last
> seen address with its allowed one, and either correct it in the client editor or untick
> the restriction there:
>
> ```sql
> SELECT id, hostname, ip_address, inbound_allowed_ip FROM clients
> WHERE connection_mode = 'inbound' AND ip_address IS NOT NULL;
> ```
>
> A leftover `trusted_networks:` key in an existing `config.yaml` is ignored.
