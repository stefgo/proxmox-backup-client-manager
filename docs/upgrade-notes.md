# Upgrade Notes

What changed in behaviour or configuration between releases, and what to do about it when
upgrading. **Newest first.** The general procedure is in
[Operations](operations.md#upgrading); the release history is in
[CHANGELOG.md](https://github.com/stefgo/proxmox-backup-client-manager/blob/main/CHANGELOG.md).

Server and agent speak one protocol version, so **update the agents in the same window as
the server** whatever the release.

## After 1.6.0

Not yet part of a release; in the `main` and `dev` images.

### The agent container is restricted, and its image has a new base

The shipped `compose.yaml` now starts the agent with `cap_drop: ALL`, seven capabilities
added back, `no-new-privileges`, a read-only root file system and `/tmp` in memory. Both
agent images are built on the Node image (`node:22-bookworm-slim`, `node:22-trixie-slim` for
ARM64) instead of Debian with Node from NodeSource, and no longer contain `wget`, `curl`,
`gnupg` or `lsb-release`.

- **Nothing changes for a running agent**: it keeps the settings of its own Compose file. To
  adopt the restrictions, copy `cap_drop`, `cap_add`, `security_opt`, `read_only` and `tmpfs`
  from [the Compose file](install-client.md#2-write-the-compose-file) into yours and run
  `docker compose up -d`.
- **If your jobs call hook scripts, read
  [What the agent container may do](security.md#what-the-agent-container-may-do) first.** A
  script inherits the agent's capabilities and its read-only file system.
- If you `docker exec` one of the removed tools in the agent container, or a hook script
  calls one, it is gone.

### The pages of the dashboard have new addresses

`/client/:clientId/...` and `/repository/:repoId/...` are now `/clients/:clientId/...` and
`/repositories/:repoId/...`.

- **The old addresses are not redirected.** A bookmark to one shows the not-found page;
  update bookmarks and links in runbooks.
- The API is not affected by this: its paths have not changed.

### The history endpoint answers in pages

`GET /api/v1/history` answers `{ "items": [...], "total": n }` instead of
`{ success, count, data }`, one page at a time (`limit`, `offset`). `total`
counts every run the filter matches, across all pages. `GET /api/v1/history/latest` answers a
bare array. Both report a failure as `{ error }`, like every other endpoint.

- A script that reads `.data` has to read `.items` (or, for `latest`, the response itself).
- Nothing to do for the dashboard.

### The dashboard signs out when the session ends

The session cookie now lives exactly as long as the token it carries (`jwtExpiresIn`,
default 12 h), and the dashboard signs out at that moment instead of at the next request that
comes back `401`. Nothing to configure; a dashboard left open on a wall display has to be
signed in again after that time, as before.

### A schedule that was missed is a run of its own

A scheduled run that starts more than five minutes late is written to the history with the
status `missed` before the catch-up run starts, and the server sends the new webhook event
`job.missed` for it.

- Whether a webhook reports it is decided by its event kinds. Check them in the webhook
  editor if a target should, or should not, hear about missed runs; see
  [Webhooks](webhooks.md#when-a-webhook-fires).

## 1.6.0

### Forwarding headers count only from listed proxies

The server used to believe `X-Forwarded-For` and `X-Forwarded-Proto` from anyone who reached
its port, which let a caller choose the address the login rate limit, `allowed_networks` and
a client's allowed address were checked against. It now believes them only from the proxies
listed in `security.trusted_proxies` (or `PBCM_TRUSTED_PROXIES`), and the list is empty by
default.

- **Behind a reverse proxy, list it** — see [Security](security.md#reverse-proxy). Without
  the entry the installation keeps working, but every request appears to come from the proxy
  and the session cookie loses its `Secure` flag.
- The startup log says which proxies are trusted, or that none are.

### Stored secrets are encrypted with `secretKey`

Repository token secrets and the auth tokens of outbound clients are now encrypted in the
database, and inbound clients' tokens are stored as hashes. The key is `secretKey` in the
server's `config.yaml`, generated on the first start. It replaces `tunnel.keySecret`.

- **Enter the tunnel credentials of every client that has them again.** They were encrypted
  with `tunnel.keySecret` and can no longer be read; until then, backups through the tunnel
  fail. A `tunnel.keySecret` left in `config.yaml` is ignored and can be removed.
- **`config.yaml` has to be writable on the first start after the update.** The server refuses
  to encrypt with a key it could not write back, and stops the start instead.
- **Back up `config.yaml`.** Losing `secretKey` now also loses the repository secrets and the
  outbound clients' tokens; see [Stored secrets](setup.md#stored-secrets).
- Agents keep their token and connect as before.

### The API no longer returns secrets

`GET /api/v1/repositories` answers without `secret`; a job comes back with
`repository.secret` as `""` and `encryption` without `keyContent`.
`PUT /api/v1/repositories` keeps the stored secret when `secret` is empty, and
`POST /api/v1/clients/:clientId/restore` takes a `repositoryId` instead of a `repository`
object.

- A script that read a secret from the API can no longer do so, and one that starts a restore
  has to send the id of a configured repository.
- Nothing to do for the dashboard.

### Webhooks report every client

A webhook can no longer be limited to some clients.

- **A webhook that was limited reports the events of all clients after the update.** Check
  what its target does with them. Its event kinds still decide which events it sends.
- Rolling the database migration back does not restore the selection.

## 1.5.0

### Agents check the server's certificate

An agent that registers with or connects to a PBCM server verifies its certificate.
Registration against a server with a self-signed certificate used to succeed without a word.

- For a self-signed server certificate set `allowSelfSignedCertificates: true` in the agent's
  `config.yaml`.

### An agent is registered with its setup PIN

`registrationSecret` in the agent's `config.yaml` is no longer read. An unregistered agent
prints a **setup PIN** to its log on every start, and a registration needs that PIN or the
value of `PBCM_REGISTRATION_SECRET`; see [Client identity](setup.md#client-identity).

- Agents that are already registered are not affected.
- An agent that still has `registrationSecret` logs a warning. Remove the key; for an
  unattended rollout set `PBCM_REGISTRATION_SECRET` (or `PBCM_REGISTRATION_SECRET_FILE`).

### The retention settings were renamed

`retention_invalid_tokens_days` became `token_retention_days`, and
`retention_invalid_tokens_count` was dropped. The new `token_cleanup_interval_hours` and
`job_history_cleanup_interval_hours` default to 24; the fixed nightly run at midnight is gone.

- **The old value is not carried over.** An installation that had
  `retention_invalid_tokens_days: "0"` gets `30` and has to set `token_retention_days: "0"`
  again, on the settings page or in `config.yaml`.

### Registration tokens are listed by their hash

`GET /api/v1/tokens` returns `tokenHash` instead of `token`, and
`DELETE /api/v1/tokens/:tokenHash` takes the hash. A script that deleted a token by its value
has to use the hash from the list.

## Earlier releases

### The agent's identity moved out of `config.yaml`

An agent that still has its `clientId` and `authToken` in `client-config.yaml` moves them
into `identity.json` in its data volume on the first start, and removes the two keys and
their comments from the file only once the new one is written.

- **The agent needs a persistent, writable data volume.** If it is not writable, the identity
  stays where it is and the log says so.
- Back up the volume instead of the config file to keep the identity.

### The agent keeps its jobs in files

An agent that still keeps its jobs in the SQLite database of an older version (`client.db`
in the data volume) imports them into the data files on its first start and renames the
database to `client.db.migrated`.

- Only the jobs and their schedule state are taken over, not the run history: whatever the
  server had not received by then stays behind, and the log says how many runs that were.
  **Let the agent sync with the server once before the update.**
- Should the import fail, the agent does not start and says why in the log — it would
  otherwise come up without its jobs.

### The dashboard session is an httpOnly cookie

The dashboard signs in with a cookie instead of a bearer token kept in the browser. A session
that had no expiry now ends after `jwtExpiresIn` (default 12 h).

- Everyone is signed out once by the update.
- A script may keep sending `Authorization: Bearer <token>`.
