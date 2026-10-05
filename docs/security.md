# Security

An agent reads every file it is given and holds the keys to the backups of its host, and the
server holds the secrets of every repository. This page lists what protects that chain and
what you have to set up yourself.

## Checklist

- The password of the first `admin` account is changed.
- The server is reachable only through a reverse proxy with TLS, and that proxy is listed in
  `security.trusted_proxies` ([below](#reverse-proxy)).
- Outbound agents that the server dials outside a trusted network serve TLS
  ([below](#tls-to-an-outbound-agent)).
- `server-config.yaml` is backed up apart from the data volume — it holds `secretKey`
  ([below](#what-is-stored-where)).
- The agents' data volumes are readable only by root — they hold each agent's auth token.
- The agent container runs with the restrictions of the shipped `compose.yaml`
  ([below](#what-the-agent-container-may-do)), and each agent mounts only what it backs up.

## Sign-in

- Local accounts (bcrypt) and [OIDC](setup.md#authentication), side by side.
- The session is an httpOnly cookie that expires after `jwtExpiresIn` (default 12 h). The
  dashboard knows when and signs out at that moment, also while it is only being watched.
- Changing a user's password or auth methods ends all of that user's sessions at once, open
  dashboards included.
- `POST /api/login` accepts at most **10 attempts per 15 minutes** per client address.

## Reverse proxy

The server speaks plain HTTP. Put it behind a terminating reverse proxy (Caddy, nginx,
Traefik) for anything that leaves the host, and make sure the proxy forwards WebSocket
upgrades — the dashboard has no polling fallback, so a proxy that drops `Upgrade`
produces a UI that loads and then never updates.

**List the proxy in `security.trusted_proxies`** (or `PBCM_TRUSTED_PROXIES`). The server
believes `X-Forwarded-For` and `X-Forwarded-Proto` only from the addresses listed there.
Without the entry two things go wrong quietly:

- Every request appears to come from the proxy. The login rate limit then counts all users
  together, and `security.allowed_networks` and a client's allowed IP are checked against
  the proxy's address instead of the agent's.
- The session cookie loses its `Secure` flag, because the server sees the plain-HTTP
  connection from the proxy rather than the browser's HTTPS one.

```yaml title="server-config.yaml"
security:
    # A proxy on the same host:
    trusted_proxies: ["loopback"]
    # A proxy container on a Docker network (its address is assigned by Docker):
    # trusted_proxies: ["uniquelocal"]
```

Port 3000 can stay published directly — agents connect to it — because without an entry
the forwarding headers are ignored rather than trusted.

Once TLS is in front of it you can switch on `security.hsts` in the config.

!!! warning "`hsts` is hard to take back"

    The header tells browsers to refuse `http://` for this host, they remember it for
    months, and turning the header off again does not undo it. On an installation that
    is still on plain HTTP it locks your users out. Only switch it on behind TLS.

## Agent registration

- A registration token is valid once. The server keeps its SHA-256 hash, not the token.
- Every registration additionally needs the agent's **setup PIN** from its log, or its
  `PBCM_REGISTRATION_SECRET` — someone who can reach the agent's port cannot point it at a
  server of their own. See [Client identity](setup.md#client-identity).
- The server issues the client id and a permanent auth token. The agent presents both on
  every connection, and the server admits it only if the two name the same client.
- An agent that holds an identity refuses to register again; see
  [Re-registering a host](operations.md#re-registering-a-host).

## Address checks for agent connections

Three settings decide where an agent connection may come from, and they answer different
questions:

| Setting | Scope | Question |
| :------ | :---- | :------- |
| `security.allowed_networks` (server) | all agents | May *any* agent connect from this network? |
| `clients.inbound_allowed_ip` (per client, set with the registration token and editable in the client editor) | one client | Does this address belong to *this* token? |
| `allowedNetworks` (client) | one agent's listener | May the server dial this agent from this network? |

The address the two server-side checks look at is the connection's peer — or, when that
peer is listed in `security.trusted_proxies`, the address the proxy forwarded. A forwarded
address from anyone else is ignored, so it cannot be used to slip past either check.

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

## TLS to an outbound agent

An outbound agent is dialled by the server, and the agent's auth token travels in the
`/ws/agent` query string. Over plain `ws://` that token is readable by anything on the path.
The SSH reverse tunnel does not cover this — it carries backup traffic to the PBS, is asked
for per run and released afterwards, while the agent session stands beside it.

Two settings, one on each side:

1. The agent serves TLS — a `tls` block naming a certificate and key in its `config.yaml`
   (see [Configuration](setup.md#client)), or a reverse proxy terminating TLS in front of it.
2. The client's **target address** says so: `wss://host:port` instead of `host:port`, set in
   the client editor or when the client is added.

They have to agree. An address written `wss://` against an agent serving plain HTTP fails to
connect, and so does a bare address against an agent serving TLS. Addresses stored before
this existed keep working unchanged — a bare `host:port` still means `ws://`.

By default the server verifies the agent's certificate. An agent on a home network usually
carries a self-signed one, and running a CA for a handful of hosts is more than that warrants:

```yaml
security:
    allow_self_signed_agent_certificates: true
```

It applies to every outbound agent alike and only where the address is `wss://`. The PBS
certificate is a different matter and stays pinned by its fingerprint.

An inbound agent needs none of this: give it an `https://` server URL and its `wss://`
connection follows. It verifies the server's certificate; for a self-signed one set
`allowSelfSignedCertificates: true` in the agent's `config.yaml`.

## What is stored where

| Secret | Stored in |
| :----- | :-------- |
| User passwords (bcrypt), registration tokens (SHA-256), inbound clients' auth tokens (SHA-256) | the server's SQLite database (`server-data` volume) — hashes only, the server just has to recognise the value |
| Outbound clients' auth tokens, the PBS token secrets of the repositories, the SSH keys of the tunnels | the server's SQLite database, encrypted (AES-256-GCM) with `secretKey` — the server has to read them back |
| Session signing key (`jwtSecret`), encryption key (`secretKey`), OIDC client secret | the server's `config.yaml` |
| The agent's client id and auth token | `identity.json` in the agent's `client-data` volume |
| A job's PBS token secret and its encryption key | `jobs.json` in the agent's `client-data` volume — the agent runs its jobs without the server |

The database and `config.yaml` are kept apart on purpose — a volume and a bind-mounted file —
so a copy of the volume alone contains no usable repository secret. Back them up separately;
what losing `secretKey` costs is described under [Stored secrets](setup.md#stored-secrets).

No secret travels to a browser: the API answers a repository without its `secret` and a job
without its encryption key, and saving either keeps the stored value.

## Container users

The server runs as the unprivileged user `node` (UID 1000); its entrypoint is root only long
enough to hand over the data volume and the mounted config file. See
[Installing the Server](install-server.md#2-write-the-compose-file) for what that means for
the file's owner on the host and for `user:` in Compose.

The agent stays root on purpose: a backup has to read files whatever their owner, and a
restore sets owners and modes back. What limits it are its mounts and the capabilities
below.

## What the agent container may do

Root in a container still holds a set of Linux capabilities, and Docker's default set
includes several a backup agent has no use for. The Compose file in [Installing a Client Agent](install-client.md#2-write-the-compose-file) drops all of them and
adds back only what `proxmox-backup-client` needs:

| Capability | Needed for | Without it |
| :-- | :-- | :-- |
| `DAC_READ_SEARCH` | Backup: reading files and directories of every owner. | Files the agent may not read are **left out of the snapshot**; the log says `access denied`, the run still succeeds. |
| `DAC_OVERRIDE` | Restore: writing into directories of other users. | The restore fails with `Permission denied`. |
| `CHOWN` | Restore: putting owners back. | The restore fails at the first file that is not root's (`failed to set ownership`). |
| `FOWNER` | Restore: setting the mode of a file that belongs to someone else. | The restore fails (`failed to change file mode`). |
| `FSETID` | Restore: keeping a setgid bit. | The restore succeeds and the bit is silently gone. |
| `MKNOD` | Restore: creating device nodes. | The restore fails at the first device node. |
| `SETFCAP` | Restore: putting file capabilities back. | Not measured; the kernel refuses to write the `security.capability` attribute without it. |

All rows but the last were measured with a backup and a restore against a Proxmox Backup
Server. **An agent that only ever backs up needs `DAC_READ_SEARCH` alone** — remove the
other six from `cap_add`, and add them again before a restore.

What is gone compared to Docker's default: `NET_RAW`, `NET_BIND_SERVICE`, `SETUID`, `SETGID`,
`SETPCAP`, `SYS_CHROOT`, `KILL` and `AUDIT_WRITE`. The tunnel of an outbound client needs
none of them: on the agent's side it is a plain TCP connection, not an `ssh` process.

The other three settings:

- **`no-new-privileges`** stops setuid binaries from raising privileges again.
- **`read_only`** leaves the agent `config.yaml`, its data volume and whatever you mounted
  writable for a restore. Nothing else in the image can be changed.
- **`tmpfs: /tmp`** is where a run's encryption keyfile lives for the length of the run. In
  memory, it never reaches a disk.

!!! note "Hook scripts run under the same limits"

    A job's pre- and post-scripts are started by the agent and inherit its capabilities and
    its read-only file system. A script that needs more — mounting a snapshot, say — needs
    the capability added to `cap_add`, and a script that writes needs a mounted path or
    `/tmp` to write to.
