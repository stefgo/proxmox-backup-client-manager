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
| `SERVER_URL`        | Overrides `serverUrl` from `config.yaml`. |
| `PBCM_CLIENT_PORT`  | Overrides `listenPort` from `config.yaml`. Needed with `network_mode: host` when 3001 is taken — the same port must then appear in the client's target address on the server. |

## Server

`server/config.yaml` — in the container at `/app/server/config.yaml`, bind-mounted from
`server-config.yaml` on the host. A copy to start from is
[`server/config.example.yaml`](https://github.com/stefgo/proxmox-backup-client-manager/blob/main/server/config.example.yaml).

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
| `clientId` | Identity of the client. Issued by the server during registration and written together with `authToken` — never set or changed by hand. |
| `authToken` | The other half of the identity. Issued by the server; never set by hand. |
| `registrationSecret` | Outbound mode only: the one-time secret the server presents when it dials this agent to register it. Must match what you enter in the dashboard's outbound wizard. Removed from the file once registration succeeds. |
| `listenPort` | TCP port of the local Web UI and, in outbound mode, of the `/ws/register` and `/ws/agent` endpoints the server dials (default: `3001`). A changed port must also appear in the client's target address on the server. Overridden by `PBCM_CLIENT_PORT`. |
| `allowedNetworks` | Outbound mode only: CIDR networks the **server** may dial this agent from, checked on `/ws/register` and `/ws/agent`. Empty (default) allows every address. The local Web UI on the same port is not restricted by it — it is guarded by the setup PIN instead. |

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
| `retentionTime` | Days to keep job history and schedule state (default: `90`). |
| `logCapBytes` | Bytes of `stdout` and `stderr` kept per run, each channel separately (default: `262144`, i.e. 256 KB). Head and tail are kept with the middle dropped and marked. Values below 1024 are ignored. |

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

### Client identity

A client is identified by a pair: the `clientId` and the `authToken` in its `config.yaml`.
Both are issued by the **server** during registration and stored together; the agent never
picks either for itself. Every agent connection presents both
(`/ws/agent?clientId=…&token=…`), and the server only admits it if the two name the same
client. Neither half is sufficient on its own — and the id in particular is not a secret,
since the same value is the PBS `--backup-id` and can be read from any snapshot name.

The `clientId` also decides which snapshots the UI shows under a client. It must therefore
never be edited by hand: a changed id starts a new snapshot group in PBS and orphans
everything backed up so far.

Registering through the agent's Web UI additionally requires the **setup PIN**. While the
agent has no identity it prints one to its log on every start:

```
──────────────────────────────────────────────
  Setup PIN:  7K4M-9QX2
  Web UI:     http://<this-host>:3001/register
  The PIN is required to register this agent.
──────────────────────────────────────────────
```

Read it with `docker compose logs pbcm-client` and enter it alongside the server URL and
the registration token. Without it the endpoint answers `403` — otherwise anyone able to
reach `listenPort` could point an unregistered agent at a server of their own, since the
caller supplies both the URL and the token. The PIN is held in memory only, is rotated
after five failed attempts, and stops existing once the agent is registered. Registration
in **outbound mode** does not use it: there the server dials the agent and the handshake is
already protected by `registrationSecret` and `allowedNetworks`.

An agent that already holds an identity refuses to register again — `409` on the Web UI
path, close code `4003 Already registered` in outbound mode. To re-register a host on
purpose, remove `clientId` and `authToken` from its `config.yaml` first, and delete the
client's old row in the UI afterwards. A restarted agent prints a fresh setup PIN.

> **Upgrade note:** agents and server must be updated together. An older agent sends no
> `clientId` and is refused at `/ws/agent` with close code `4001`.
>
> **Inbound** clients need nothing beyond the agent update: their existing `clientId` is
> already the one the server has, so the pair matches on the first attempt.
>
> **Outbound** clients have to be set up once more. Their agent generated its own id, which
> was never the id the server stored for them, so the pair can never match. Per client: stop
> the agent, remove `clientId` and `authToken` from its `config.yaml`, set a new
> `registrationSecret`, start it again, then delete the old client in the UI and add it again
> through the wizard. Its `--backup-id` changes in the process — snapshots taken before the
> upgrade stay under the old id and are not shown under the new client. They were never
> attributed to it before either, because that mismatch is exactly what this change removes.
>
> The affected clients are all of them in this list:
>
> ```sql
> SELECT id, hostname, outbound_target_address FROM clients
> WHERE connection_mode = 'outbound';
> ```
