# Operations

Running PBCM once it is installed: which image to pull, how to upgrade, what to back up, and
how to tell that it is healthy.

## Images and tags

| Image | Platforms |
| :---- | :-------- |
| `ghcr.io/stefgo/pbcm-server` | `linux/amd64` and `linux/arm64`, one multi-arch image |
| `ghcr.io/stefgo/pbcm-client` | `linux/amd64` |
| `ghcr.io/stefgo/pbcm-client-arm64` | `linux/arm64` — a separate image name, see [Pick the right image](install-client.md#pick-the-right-image) |

| Tag | What it is |
| :-- | :--------- |
| `latest` | The last release. **Use this one** unless you have a reason not to. |
| `1.6.0` | One release. Pin it to make an upgrade a decision rather than a side effect of `docker compose pull`. |
| `1.6` | The newest patch release of that minor version. |
| `main` | The current `main` branch — not a release, can be ahead of `latest`. |
| `dev` | Development state. Expect it to break. |
| `sha-<short>` | The build of one commit on `main` or `dev`. |

An image is tagged only after CI has started it and it passed its health check.

## Upgrading

```bash
docker compose pull
docker compose up -d
```

- **Read the [upgrade notes](upgrade-notes.md) first.** They say what a release changes and
  what an existing installation has to do about it.
- **Update the agents in the same window as the server.** The two speak one protocol
  version; an agent older than the server is refused at `/ws/agent` with close code `4001`.
- The database schema is migrated automatically: the server applies its migrations to
  `server.db` before it accepts connections.
- An agent keeps running its jobs on schedule while the server is down for the upgrade.

## Backup

| What | Where | Why |
| :--- | :---- | :-- |
| Server database | `server-data` volume (`/app/server/backend/data`) | Users, clients, repositories, tokens, job history, webhooks |
| Server config | `server-config.yaml` | Session key, OIDC, settings, and the `secretKey` that encrypts the repository secrets, the tunnel keys and the outbound clients' tokens — without it all of them have to be entered again |
| Agent state | `client-data` volume on each host | Its identity and its jobs — lose the identity and the agent has to be registered again, under a new `clientId` |

The two paths from the Compose file are the whole state:

```bash
docker compose stop pbcm-server
docker run --rm -v pbcm_server-data:/data -v "$PWD":/backup debian:bookworm-slim \
    tar czf /backup/pbcm-server-data.tar.gz -C /data .
cp server-config.yaml pbcm-server-config.yaml.bak
docker compose start pbcm-server
```

Stopping first matters: SQLite in WAL mode has state in `-wal` and `-shm` files, and a
tar of a running database can capture a torn moment between them.

The backups themselves are not PBCM's to back up: they are in the Proxmox Backup Server.

## Health

### Server

The image carries a `HEALTHCHECK`, so `docker ps` shows a state next to the container
without you adding anything to the Compose file:

```
STATUS
Up 4 minutes (healthy)
```

It calls `GET /api/health`, which answers `200` when the process serves requests and its
database is reachable, and `503` when it does not. You can call it yourself — it needs no
login:

```bash
curl -fsS http://localhost:3000/api/health
```

**Docker does not restart an unhealthy container.** Restart policies such as
`restart: unless-stopped` react to a process *exiting*; a process that is still running
but no longer answering stays where it is, marked `unhealthy`. What the healthcheck gives
you is a state your monitoring can read, and something `depends_on: condition:
service_healthy` can wait for. If you want an unhealthy container restarted, that takes
an extra watchdog alongside Docker.

To change the timings, or to make the check visible in the file you maintain, declare a
`healthcheck:` block on the service — it overrides the one from the image. The
[`compose.yaml`](https://github.com/stefgo/proxmox-backup-client-manager/blob/main/compose.yaml)
in the repository does exactly that, and is a working example to copy from.

The check does not read `PBCM_SERVER_PORT` or `config.yaml` itself. Once the server listens,
it writes the address it serves to `/tmp/pbcm-health.json` inside the container, and the
check asks that address — so a port moved in either place is followed without anything else
to set. Without that file the check has nothing to ask and reports `unhealthy`: during
start-up, which `start_period` covers, and when the repository's `compose.yaml` runs an image
from before the file existed. A `healthcheck:` block of your own should read the same file.

### Agent

Both agent images carry a `HEALTHCHECK`, so `docker ps` shows `(healthy)` next to the
container without you adding anything to the Compose file. It calls `GET /api/health` on
the agent's own web UI port (`3001` by default), which needs no login.

The route exists for that check alone: it is served only in the container image and answers
only requests from loopback, which is where Docker runs the check. From the host you ask it
inside the container:

```bash
docker compose exec pbcm-client node -e "fetch('http://127.0.0.1:3001/api/health').then(r => r.text()).then(console.log)"
```

It is there whatever `config.yaml` disables — with both pages off and no outbound mode, the
agent still starts its web server for it, bound to `127.0.0.1`.

The check follows the port and scheme the agent actually listens on, whether they come from
`config.yaml` (`listenPort`, `tls`) or from `PBCM_CLIENT_PORT` — see
[Health check](client.md#health-check). The command above assumes the defaults; with a moved
port or TLS, adjust its URL.

**It reports on the agent, not on the connection to the server.** An agent that cannot
reach the server is still healthy: it keeps its jobs in its own data files and runs them on
schedule regardless. Whether it is connected is a different question, answered on the
agent's status page and by `GET /api/status/connection`.

Two consequences worth knowing:

- `curl http://localhost:3001/api/health` from the host gets a `404`. That is the
  loopback rule above, not a broken agent.
- **Docker does not restart an unhealthy container.** `restart: unless-stopped` reacts to
  a process *exiting*, not to its health. An agent that hangs without exiting stays up and
  marked `unhealthy`, which your monitoring can see but Docker will not act on.

## Logs

```bash
docker compose logs -f pbcm-server
```

`LOG_LEVEL` and `LOG_FORMAT` change verbosity and shape; see
[Configuration](setup.md#logging). In `production` the default is structured JSON, which
is what you want if the logs go into a collector and not into your terminal.

```bash
docker compose logs -f pbcm-client
```

Live job output also streams to every open dashboard over the WebSocket, so the container
log is mainly for the things that happen before a job does — connection state, the setup
PIN, scheduler decisions.

## Re-registering a host

An agent that already holds an identity refuses to register again — its register page is
closed (`404`), and `/ws/register` closes with `4003 Already registered` in outbound mode. That guard is deliberate; to
move a host on purpose:

1. Stop the container.
2. Delete `identity.json` from the data volume, e.g.
   `docker run --rm -v pbcm-client_client-data:/data alpine rm /data/identity.json`
   (the volume name depends on your Compose project).
3. Start it again — a new setup PIN is printed — and register as in
   [Register the agent](install-client.md#3-register-the-agent).
4. Delete the old client row in the dashboard.

!!! warning "The `clientId` is the PBS `--backup-id`"

    It decides which snapshots the UI groups under this client. A new id starts a new
    snapshot group in PBS and orphans everything backed up so far. Never edit it by hand,
    and re-register only when you mean to.
