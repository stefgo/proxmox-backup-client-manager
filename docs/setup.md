# Configuration

Both the server and the agent are configured through a `config.yaml` and a handful of
environment variables. This page is the reference for both; the installation itself is on
[Installing the Server](install-server.md) and
[Installing a Client Agent](install-client.md).

`config.yaml` is validated against a schema at startup, and an invalid value aborts the
start with a message naming the field — a configuration error is not something to discover
on the first tunnel lease hours later. Keys the schema does not know are preserved, so
anything you add by hand survives the next save. The file is created with defaults on
first start; `jwtSecret` and `tunnel.keySecret` are generated before the check runs.

## Environment variables

### Logging

| Variable     | Values                             | Default       | Description |
| :----------- | :--------------------------------- | :------------ | :---------- |
| `LOG_LEVEL`  | `debug`, `info`, `warn`, `error`   | `info`        | Verbosity of the logs. |
| `LOG_FORMAT` | `pretty`, `one-line`, `json`       | _auto_        | `pretty` for single-line, coloured logs (the default in development). `json` for structured output (the default in production). `one-line` is an accepted alias of `pretty` — the transport always sets `singleLine`, so there is no separate multi-line mode for it to switch off. |
| `NODE_ENV`   | `development`, `production`        | `development` | Controls general behaviour such as the logging defaults. |

In Compose these go into the service's `environment:` block:

```yaml
environment:
    - NODE_ENV=production
    - LOG_LEVEL=debug
    - LOG_FORMAT=json
```

### Client-only overrides

| Variable            | Description |
| :------------------ | :---------- |
| `PBCM_CLIENT_PORT`  | Overrides `listenPort` from `config.yaml`. Needed with `network_mode: host` when 3001 is taken — the same port must then appear in the client's target address on the server. |
| `PBCM_CLIENT_CONFIG` | Path of the agent's `config.yaml` (default: `client/config.yaml`). |
| `PBCM_CLIENT_DATA_DIR` | Where the agent keeps its jobs, schedule state and run history (default: `client/data`, the `client-data` volume in the image), and its `identity.json`. For an agent that runs outside the container. |
| `PBCM_REGISTRATION_SECRET` | Outbound mode: a secret the dashboard's outbound wizard accepts in place of the setup PIN from the agent's log, for a rollout where nobody reads that log. Remove it once the agent is registered. |
| `PBCM_REGISTRATION_SECRET_FILE` | The same, read from a file (e.g. `/run/secrets/…`). Setting both variables, or a file that cannot be read or is empty, ends the start. |

### Server-only overrides

| Variable            | Description |
| :------------------ | :---------- |
| `PBCM_SERVER_PORT`  | Overrides `port` from `config.yaml`. An unusable value ends the start. The container's health check reads it too, so the probe follows a moved port; a port set only in `config.yaml` needs this variable as well or the probe keeps asking 3000. |

## Server

`server/config.yaml` — in the container at `/app/server/config.yaml`, bind-mounted from
`server-config.yaml` on the host. A copy to start from is
[`server/config.example.yaml`](https://github.com/stefgo/proxmox-backup-client-manager/blob/main/server/config.example.yaml).

### Listening

| Key | Description |
| :-- | :---------- |
| `port` | Port the server listens on (default: `3000`), overridden by `PBCM_SERVER_PORT`. The published port: `EXPOSE`, the compose port mapping and every agent's `serverUrl` have to follow it. |
| `logLevel` | pino log level, overridden by `LOG_LEVEL`. |

### Authentication

| Key | Sub-key | Description |
| :-- | :------ | :---------- |
| `oidc` | `enabled` | Enables/disables OIDC single sign-on (`true`/`false`). |
| | `issuer` | OIDC issuer URL. |
| | `client_id` | OIDC client ID. |
| | `client_secret` | OIDC client secret. |
| | `redirect_uri` | OIDC redirect URI. |
| `jwtSecret` | (root) | Signs the session tokens. Generated automatically if absent. **Losing it invalidates every session.** |
| `jwtExpiresIn` | (root) | How long a login stays valid, in any span `@fastify/jwt` accepts (default: `12h`). Before this had a default, a token signed without one never expired. |

### Retention

The `settings:` block below documents the defaults rather than changing them — these are
the same values the server falls back to when a key is missing.

| Key | Default | Description |
| :-- | :------ | :---------- |
| `settings.retention_invalid_tokens_days` | `30` | Days an invalid token stays in the database. |
| `settings.retention_invalid_tokens_count` | `10` | Keep at least this many invalid tokens, overriding the day limit. |
| `settings.retention_job_history_days` | `90` | Days a job history entry stays in the database. |
| `settings.retention_job_history_count` | `50` | Keep at least this many history entries per client. |

!!! warning "`0` is not `off`"

    Zero days puts the cutoff at the current moment, and zero kept entries means nothing is
    exempt from it. Together they delete everything eligible on the next cleanup run.

### Security

| Key | Description |
| :-- | :---------- |
| `security.allowed_networks` | CIDR networks an agent may connect to `/ws/agent` from. Empty (default) allows every address. See [Address checks](#address-checks-for-agent-connections). |
| `security.hsts` | Send `Strict-Transport-Security` (default: `false`). **Only switch this on behind TLS.** The header tells browsers to refuse `http://` for this host from then on, they remember it for months, and turning the header off again does not undo it — on a plain-HTTP installation it locks your users out. |

### Tunnel

The `tunnel:` section is written with its defaults on first start, which is why
`config.example.yaml` does not carry it. It must **not** be copied between installations:
`tunnel.keySecret` is generated per installation and encrypts the stored SSH keys, so
sharing the file would share one key across every installation that copied it. The
parameters are documented in [SSH Reverse Tunnel](tunnel.md#5-server-side-settings-optional).

## Client

`client/config.yaml` — in the container at `/app/client/config.yaml`, bind-mounted from
`client-config.yaml` on the host. A copy to start from is
[`client/config.example.yaml`](https://github.com/stefgo/proxmox-backup-client-manager/blob/main/client/config.example.yaml).

### Identity and connection

| Key | Description |
| :-- | :---------- |
| `serverUrl` | URL of the management server (e.g. `wss://backup-server:3000/ws`). **Leave unset for outbound mode** — its absence is what puts the agent into it. |
| `listenPort` | TCP port of the local Web UI and, in outbound mode, of the `/ws/register` and `/ws/agent` endpoints the server dials (default: `3001`). A changed port must also appear in the client's target address on the server. Overridden by `PBCM_CLIENT_PORT`. |
| `allowSelfSignedCertificates` | Accept a PBCM server certificate that does not validate (self-signed), for registration and the WebSocket connection (default: `false`). The PBS certificate is not affected; it is pinned by its fingerprint. |
| `allowedNetworks` | Outbound mode only: CIDR networks the **server** may dial this agent from, checked on `/ws/register` and `/ws/agent`. Empty (default) allows every address. The local Web UI on the same port is not restricted by it — it is guarded by the setup PIN instead. |
| `enableStatusPage` | Serve the status page at `/status` (default: `true`). |
| `enableRegisterPage` | Serve the register page at `/register` and `POST /api/register` behind it (default: `true`). Both close by themselves once the agent is registered; switch it off for an agent that should only ever be registered by the server (outbound). Without it, a setup PIN is printed only for outbound mode (no `serverUrl`, no `PBCM_REGISTRATION_SECRET`). |

### Job execution

| Key | Description |
| :-- | :---------- |
| `executable` | Path to the `proxmox-backup-client` executable (default: `proxmox-backup-client`). In the container image the CLI is already on `PATH`. |
| `backupParams` | Static arguments appended to every backup job, as a flat list of alternating flag and value (e.g. `["--all-file-systems", "true"]`). |
| `restoreParams` | The same for restore jobs. |
| `preScript` / `postScript` | Optional scripts run before and after a job. Arguments: `$1` = operation (`backup`/`restore`), `$2` = job name. **A non-zero exit from `preScript` aborts the operation.** The path is inside the container, so the script has to be mounted in. |
| `queueDelaySeconds` | Seconds to wait before restarting a queued job (default: `5`). |
| `tunnelAcquireJitterSeconds` | Random delay (0..N seconds) before requesting the SSH reverse tunnel, so that many jobs firing in the same minute do not hit the tunnel limit at once. Outbound clients only; `0` disables it (default: `30`). |

### Storage and logging

| Key | Description |
| :-- | :---------- |
| `logLevel` | Verbosity, overridden by `LOG_LEVEL` (default: `info`). |
| `logCapBytes` | Bytes of `stdout` and `stderr` kept per run, each channel separately (default: `262144`, i.e. 256 KB). Head and tail are kept with the middle dropped and marked. Values below 1024 are ignored. |

There is no setting for how long the history is kept. The agent keeps every run until the
server has acknowledged it, and of those the newest 50; see [Data Files](client.md) in
the client architecture. A `retentionTime` left over in an older `config.yaml` is ignored
with a warning.

## Network and identity

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
against an address at all — its token alone admits it, from anywhere the server-wide
`allowed_networks` permits.

The per-client check is switched on in the client editor ("Restrict connections to an IP or
network"); the field is required only while that box is ticked. A registration token may
carry the value instead, in which case the client starts out restricted. A token without
one leaves the column `NULL`: the address an agent happens to register from is not a
decision anyone made, and binding a client to it is how a container on a bridge network
locks itself out the next time its subnet changes.

Leave the check off for hosts whose address is assigned by their environment — containers,
DHCP without a reservation. Turn it on where the address is fixed and the token would
otherwise be usable from anywhere: it is the only check that ties an address to *one*
client rather than to all of them.

### Client identity

A client is identified by a pair: the `clientId` and the `authToken`. Both are issued by the
**server** during registration and stored together in `identity.json` in the agent's data
directory -- not in `config.yaml`, which holds only what the operator sets. The agent never
picks either for itself, and an older agent that still has them in `config.yaml` moves them
over on its next start. The file holds the token in plain text, so the data volume deserves
the same protection as the host's other secrets. Every agent connection presents both
(`/ws/agent?clientId=…&token=…`), and the server only admits it if the two name the same
client. Neither half is sufficient on its own — and the id in particular is not a secret,
since the same value is the PBS `--backup-id` and can be read from any snapshot name.

The `clientId` also decides which snapshots the UI shows under a client. It must therefore
never be edited by hand: a changed id starts a new snapshot group in PBS and orphans
everything backed up so far.

Registering the agent — through its Web UI or from the server in outbound mode — requires the
**setup PIN**. While the agent has no identity it prints one to its log on every start:

```
──────────────────────────────────────────────
  Setup PIN:  7K4M-9QX2
  Web UI:     http://<this-host>:3001/register
  Outbound:   enter it in the server's Add Client wizard
  The PIN is required to register this agent.
──────────────────────────────────────────────
```

Read it with `docker compose logs pbcm-client` and enter it alongside the server URL and
the registration token. Without it the endpoint answers `403` — otherwise anyone able to
reach `listenPort` could point an unregistered agent at a server of their own, since the
caller supplies both the URL and the token. The PIN is held in memory only, is rotated
after five failed attempts, and stops existing once the agent is registered. The `Web UI` line
appears only with the register page, the `Outbound` line only without a `serverUrl`.

In **outbound mode** enter the PIN in the dashboard's outbound wizard instead; the server
presents it when it dials the agent, and `allowedNetworks` restricts who may dial at all. For
an unattended rollout set `PBCM_REGISTRATION_SECRET` (or `PBCM_REGISTRATION_SECRET_FILE`) on
the agent and enter that value instead of the PIN; the agent then prints no PIN unless its
register page is enabled.

An agent that already holds an identity refuses to register again — its register page and
`POST /api/register` are closed (`404`), and `/ws/register` closes with `4003 Already
registered` in outbound mode. To re-register a host on
purpose, delete `identity.json` from its data directory first, and delete the client's old
row in the UI afterwards. A restarted agent prints a fresh setup PIN.
