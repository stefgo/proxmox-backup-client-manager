# 📚 API Documentation

**Base URL:** `/api/v1` (unless otherwise noted)

> **Note:** All API responses are generally JSON formatted.

## 📖 Table of Contents

- [Health](#-health)
- [Authentication](#-authentication)
    - [Login](#login)
    - [OIDC Configuration](#oidc-configuration)
    - [OIDC Login](#oidc-login)
    - [OIDC Callback](#oidc-callback)
- [Users](#-users)
    - [List Users](#list-users)
    - [Create User](#create-user)
    - [Update User](#update-user)
    - [Delete User](#delete-user)
- [Clients](#-clients)
    - [List Clients](#list-clients)
    - [Update Client](#update-client)
    - [Get Client History](#get-client-history)
    - [Get Client File System](#get-client-file-system)
    - [Get Client Version](#get-client-version)
    - [Generate Client Key](#generate-client-key)
    - [Delete Client](#delete-client)
- [Jobs](#-jobs)
    - [List Client Jobs](#list-client-jobs)
    - [Save Job](#save-job)
    - [Delete Job](#delete-job)
    - [Run Backup](#run-backup)
    - [Trigger Restore](#trigger-restore)
    - [Abort Run](#abort-run)
- [Global Data Views](#-global-data-views)
    - [List All Jobs](#list-all-jobs)
    - [Get Global History](#get-global-history)
    - [Get Latest History per Job](#get-latest-history-per-job)
    - [Get History Seen State](#get-history-seen-state)
    - [Mark History Seen](#mark-history-seen)
    - [Mark Run Seen](#mark-run-seen)
- [Repositories](#-repositories)
    - [List Repositories](#list-repositories)
    - [Get Repository Status](#get-repository-status)
    - [Create Repository](#create-repository)
    - [Update Repository](#update-repository)
    - [Delete Repository](#delete-repository)
    - [List Snapshots](#list-snapshots)
- [Registration Tokens](#-registration-tokens)
    - [List Tokens](#list-tokens)
    - [Create Token](#create-token)
    - [Delete Token](#delete-token)
    - [Register Client (Public)](#register-client-public)
- [Webhooks](#-webhooks)
    - [List Webhooks](#list-webhooks)
    - [Create Webhook](#create-webhook)
    - [Update Webhook](#update-webhook)
    - [Delete Webhook](#delete-webhook)
    - [Test Webhook](#test-webhook)
- [Settings & Maintenance](#-settings--maintenance)
    - [Get Cleanup Settings](#get-cleanup-settings)
    - [Update Cleanup Settings](#update-cleanup-settings)
    - [Run Maintenance](#run-maintenance)
    - [Clean Up Invalid Tokens](#clean-up-invalid-tokens)
    - [Clean Up Job History](#clean-up-job-history)
    - [Scheduler Status](#scheduler-status)
- [Reachability](#-reachability)
- [WebSockets](#-websockets)
    - [Dashboard Connection](#dashboard-connection)
    - [Agent Connection](#agent-connection)
        - [Client -> Server Events](#client---server-events)
        - [Server -> Client Events](#server---client-events)

---

## 🩺 Health

`GET /health` (Note: No `/v1` prefix, maps to `/api/health`)

**Description:** Liveness probe. Unauthenticated — a probe has no session, and the
answer discloses nothing. This is what the container's `HEALTHCHECK` calls, and what the
CI smoke test asks after starting a freshly built image.

The agent exposes the same endpoint on its own web UI port (`3001` by default), for its
container's `HEALTHCHECK` only: it is served only in the container image and answers only
requests from loopback. Everyone else gets `404`. Instead of the database it checks that its
data directory is writable.

#### Response

| Status | Body                  | Meaning                            |
| :----- | :-------------------- | :--------------------------------- |
| `200`  | `{"status":"ok"}`     | The process serves requests and its database is reachable |
| `503`  | `{"status":"error"}`  | The database could not be queried  |

**What it deliberately does not check.** The server does not consult its agent
connections: a single offline agent must not mark the control plane as broken. The agent
does not consult its server connection either — it runs its jobs from its own data files
whether or not the server can be reached, so a lost connection is not ill health. The
agent's connection state has its own endpoint on its web UI (`/api/status/connection`).

**Why `/api/health` and not `/health`.** The server answers every path outside `/api`
with the SPA's `index.html` and **HTTP 200**, so a probe pointed at `/health` would keep
reporting success even if the route were gone. Under `/api`, an unknown path returns
`404` as JSON.

**Not to be confused with [`/v1/ping`](#-reachability).** That one answers "is there a
PBCM server at this URL" for the agent's status page, and touches nothing. This one
answers "can this instance serve requests" and checks the database. Keeping them apart matters: if `ping` reported the database, a server with a
broken one would tell the operator that the address is wrong.

---

## 🔐 Authentication

Browser sessions are carried by a cookie, not by a token the page holds.

| Cookie         | Contents         | Flags                                              |
| :------------- | :--------------- | :------------------------------------------------- |
| `pbcm_session` | The JWT          | `HttpOnly`, `SameSite=Strict`, `Secure` over HTTPS |
| `pbcm_auth`    | `1`, no secret   | `SameSite=Strict` — readable, so the UI knows whether to render the login form |

`Max-Age` on both is what is left until the token's `exp`, so cookie and token end in the
same second. `Secure` is set only when the request arrived
over HTTPS: hardcoded, it would make the browser discard the cookie on a plain-HTTP
installation, and the login would appear to succeed while every following request came
back `401`.

The JWT never reaches JavaScript. It used to travel in the OIDC redirect's query string,
in `localStorage`, and in the dashboard WebSocket URL — the first and third of which are
written to proxy and server access logs.

**Scripted clients** can keep using `Authorization: Bearer <jwt>`; that path is unchanged,
and agents are unaffected either way. Since the browser sends the session automatically,
CSRF is kept out by `SameSite=Strict` together with the server's `origin: false` CORS
setting — every request in this application is same-origin.

**Revocation.** A valid signature is not enough. The JWT carries the user's
`token_version` as `tv`, and every protected request and every dashboard handshake
compares it with the user's row. Changing a user's password or auth methods raises that
counter, and deleting the user removes the row, so all of that user's sessions end at
once: the next request answers `401`, an open dashboard socket is closed with `4001`.
A user who changes their own password gets a fresh cookie in the same response; their
dashboard socket closes with `4002` and reconnects on it. Tokens issued before this
existed carry no `tv` and are refused — one login after the update.

### Login

`POST /login` (Note: No `/v1` prefix, maps to `/api/login`)

**Description:** Authenticates a user with local credentials and sets the session cookies.

#### Request Body

| Field      | Type   | Required | Description               |
| :--------- | :----- | :------- | :------------------------ |
| `username` | string | **Yes**  | The username of the user. |
| `password` | string | **Yes**  | The password of the user. |

**Example Request:**

```json
{
    "username": "admin",
    "password": "secretpassword"
}
```

#### Response

The session arrives as `Set-Cookie`. The body only reports that it worked — putting the
token in it would hand it back to JavaScript, which is what the cookie exists to avoid.

| Field     | Type    | Description               |
| :-------- | :------ | :------------------------ |
| `success` | boolean | `true` when authenticated |

**Example Response:**

```json
{
    "success": true
}
```

### Logout

`POST /auth/logout` (maps to `/api/auth/logout`)

**Description:** Clears both session cookies. Needed as an endpoint because `pbcm_session`
is `HttpOnly` and cannot be removed by the page. Unauthenticated on purpose — a caller
without a session loses nothing by it, and requiring a valid JWT would make an expired
session impossible to log out of.

```json
{
    "success": true
}
```

### Current User

`GET /v1/me`

**Description:** Who the session belongs to, and until when it is valid. The dashboard used
to base64-decode the JWT in the browser to get this; with the token in an `HttpOnly` cookie
it comes from the server that issued it instead.

| Field       | Type           | Description                                 |
| :---------- | :------------- | :------------------------------------------ |
| `username`  | string         | The signed-in user.                         |
| `id`        | number         | The user's id.                              |
| `expiresAt` | string \| null | ISO 8601 time at which the session expires. |

```json
{
    "username": "admin",
    "id": 1,
    "expiresAt": "2026-09-12T06:00:00.000Z"
}
```

### OIDC Configuration

`GET /auth/config`

**Description:** Returns the public OIDC configuration for the frontend to initiate login flows.

#### Response

| Field          | Type   | Description             |
| :------------- | :----- | :---------------------- |
| `authority`    | string | The OIDC authority URL. |
| `client_id`    | string | The OIDC client ID.     |
| `redirect_uri` | string | The OIDC redirect URI.  |

### OIDC Login

`GET /auth/login`

**Description:** Redirects the user's browser to the OIDC provider's login page.

#### Response

- **302 Redirect:** Redirects to the OIDC provider.

### OIDC Callback

`GET /auth/callback`

**Description:** Handling callback from OIDC provider.

#### Query Parameters

| Parameter | Type   | Required | Description                                           |
| :-------- | :----- | :------- | :---------------------------------------------------- |
| `code`    | string | Yes      | The authorization code returned by the OIDC provider. |
| `state`   | string | Yes      | The state parameter for CSRF protection.              |

#### Response

- **302 Redirect:** Redirects to the frontend application with a `token` query parameter on success.

---

## 👤 Users

### List Users

`GET /v1/users`

**Description:** Retrieves a list of all registered users.

#### Response (Array of User objects)

| Field          | Type   | Description                                             |
| :------------- | :----- | :------------------------------------------------------ |
| `id`           | number | The unique identifier of the user.                      |
| `username`     | string | The username.                                           |
| `auth_methods` | string | Comma-separated list of allowed authentication methods. |
| `created_at`   | string | ISO 8601 timestamp of creation.                         |
| `updated_at`   | string | ISO 8601 timestamp of last update.                      |

**Example Response:**

```json
[
    {
        "id": 1,
        "username": "admin",
        "auth_methods": "local",
        "created_at": "2023-10-27T10:00:00.000Z",
        "updated_at": "2023-10-27T10:00:00.000Z"
    }
]
```

### Create User

`POST /v1/users`

**Description:** Creates a new user.

#### Request Body

| Field          | Type   | Required      | Description                                               |
| :------------- | :----- | :------------ | :-------------------------------------------------------- |
| `username`     | string | **Yes**       | The desired username.                                     |
| `password`     | string | _Conditional_ | The password (required for "local" auth).                 |
| `auth_methods` | string | No            | Auth methods like `"local"`, `"oidc"`, or `"local,oidc"`. |

**Example Request:**

```json
{
    "username": "jdoe",
    "password": "password123",
    "auth_methods": "local,oidc"
}
```

#### Response

**Example Response:**

```json
{
    "status": "created"
}
```

### Update User

`PUT /v1/users/:userId`

**Description:** Updates an existing user's password or authentication methods.

#### Path Parameters

| Parameter | Type   | Required | Description                   |
| :-------- | :----- | :------- | :---------------------------- |
| `userId`  | string | **Yes**  | The ID of the user to update. |

#### Request Body

| Field          | Type   | Required | Description                                                     |
| :------------- | :----- | :------- | :-------------------------------------------------------------- |
| `password`     | string | No       | The new password. Only allowed if user has "local" auth method. |
| `auth_methods` | string | No       | Comma-separated list of new authentication methods.             |

#### Response

**Example Response:**

```json
{
    "status": "updated"
}
```

### Delete User

`DELETE /v1/users/:userId`

**Description:** Deletes a user. Note: You cannot delete yourself or the last remaining user.

#### Path Parameters

| Parameter | Type   | Required | Description                   |
| :-------- | :----- | :------- | :---------------------------- |
| `userId`  | string | **Yes**  | The ID of the user to delete. |

#### Response

**Example Response:**

```json
{
    "status": "deleted"
}
```

---

## 🖥 Clients

### List Clients

`GET /v1/clients`

**Description:** Retrieves a list of all registered clients with their connection status.

#### Response (Array of Client objects)

| Field         | Type   | Description                                        |
| :------------ | :----- | :------------------------------------------------- |
| `id`          | string | UUID of the client.                                |
| `hostname`    | string | Hostname of the client machine.                    |
| `displayName` | string | Optional custom display name for the client.       |
| `status`      | string | Connection status: `"online"` or `"offline"`.      |
| `lastSeen`    | string | ISO 8601 timestamp of the last connection.         |
| `version`     | string | Version of the client agent (if reported).         |
| `timezone`    | string \| null | IANA time zone the agent reported on its last connect: the clock it repeats job schedules on. `null` until it has connected, or for an agent that predates the field. |

**Example Response:**

```json
[
    {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "hostname": "backup-client-01",
        "displayName": "Production Server",
        "status": "online",
        "lastSeen": "2023-10-27T12:30:00.000Z",
        "version": "1.2.0",
        "timezone": "Europe/Berlin"
    }
]
```

### Update Client

`PUT /v1/clients/:clientId`

**Description:** Updates client metadata such as the display name, and — for outbound
clients — the address the server dials.

#### Path Parameters

| Parameter  | Type   | Required | Description             |
| :--------- | :----- | :------- | :---------------------- |
| `clientId` | string | **Yes**  | The UUID of the client. |

#### Request Body

| Field                   | Type   | Required | Description                                                                                              |
| :---------------------- | :----- | :------- | :------------------------------------------------------------------------------------------------------- |
| `displayName`           | string | No       | A custom display name for the client.                                                                      |
| `outboundTargetAddress` | string | No       | `host:port` of the agent. Outbound clients only (400 otherwise); the agent connection is rebuilt on change. |

**Example Request:**

```json
{
    "displayName": "Production Server",
    "outboundTargetAddress": "192.168.1.50:3101"
}
```

#### Response

**Example Response:**

```json
{
    "status": "updated"
}
```

### Get Client History

`GET /v1/clients/:clientId/history`

**Description:** Retrieves the execution history of jobs for a specific client.

#### Path Parameters

| Parameter  | Type   | Required | Description             |
| :--------- | :----- | :------- | :---------------------- |
| `clientId` | string | **Yes**  | The UUID of the client. |

#### Response (Array of HistoryEntry objects)

| Field         | Type   | Description                                               |
| :------------ | :----- | :-------------------------------------------------------- |
| `id`          | string | UUID of the history entry.                                |
| `jobConfigId` | string | UUID of the job configuration that was executed.          |
| `name`        | string | Name of the job.                                          |
| `type`        | string | Job type: `"backup"` or `"restore"`.                      |
| `status`      | string | Result: `"success"`, `"failed"`, or `"running"`.          |
| `startTime`   | string | ISO 8601 timestamp of job start.                          |
| `endTime`     | string | ISO 8601 timestamp of job end (null if still running).    |
| `exitCode`    | number | Process exit code (null if still running).                |
| `stdout`      | string | Standard output of the backup process.                    |
| `stderr`      | string | Standard error output (null if none).                     |
| `snapshot`    | string | Backups: the snapshot the run created, `host/<clientId>/<time>`. Null for restores and for runs of agents that predate the field. |
| `snapshotDetails` | object | Backups: what the PBS listed for that snapshot right after the run (see below); null if it could not be read. |
| `snapshotError` | string | Why a successful backup has no `snapshotDetails`; else null. |

`snapshotDetails` is a stored copy, so it stays after the snapshot is pruned on the PBS:

| Field         | Type    | Description                                               |
| :------------ | :------ | :-------------------------------------------------------- |
| `backupType`, `backupId`, `backupTime` | string, string, number | The snapshot's name; `backupTime` in epoch seconds. |
| `size`        | number  | Logical size in bytes — what a restore yields, not what was transferred. |
| `files`       | array   | `{ filename, size, cryptMode }` per file; `index.json.blob` is the manifest. |
| `fingerprint` | string  | Fingerprint of the encryption key, for an encrypted backup. |
| `owner`, `comment`, `protected` | | As the PBS reports them. |

The PBS's verify state is deliberately not part of it: a verify job sets it later.

**Example Response:**

```json
[
    {
        "id": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
        "jobConfigId": "job-uuid",
        "name": "Daily System Backup",
        "type": "backup",
        "status": "success",
        "startTime": "2023-10-26T02:00:00.000Z",
        "endTime": "2023-10-26T02:15:30.000Z",
        "exitCode": 0,
        "stdout": "Backup finished successfully...",
        "stderr": null,
        "snapshot": "host/client-uuid/2023-10-26T02:00:00Z",
        "snapshotDetails": {
            "backupType": "host",
            "backupId": "client-uuid",
            "backupTime": 1698285600,
            "size": 53687091200,
            "files": [
                { "filename": "root.pxar.didx", "size": 53687091200, "cryptMode": "none" },
                { "filename": "index.json.blob", "size": 612, "cryptMode": "none" }
            ],
            "owner": "backup@pbs!pbcm"
        },
        "snapshotError": null
    }
]
```

### Get Client File System

`GET /v1/clients/:clientId/fs`

**Description:** Lists files and directories on the client's file system.

#### Path Parameters

| Parameter  | Type   | Required | Description             |
| :--------- | :----- | :------- | :---------------------- |
| `clientId` | string | **Yes**  | The UUID of the client. |

#### Query Parameters

| Parameter | Type   | Required | Description                                                    |
| :-------- | :----- | :------- | :------------------------------------------------------------- |
| `path`    | string | No       | The absolute path to list (e.g., `/var/log`). Defaults to `/`. |

**Example Request URL:**
`GET /v1/clients/550e8400.../fs?path=/etc`

#### Response

**Example Response:**

```json
[
    {
        "name": "passwd",
        "isDirectory": false,
        "path": "/etc/passwd",
        "size": 1892
    },
    {
        "name": "nginx",
        "isDirectory": true,
        "path": "/etc/nginx",
        "size": 4096
    }
]
```

### Get Client Version

`GET /v1/clients/:clientId/version`

**Description:** Retrieves the version of the agent running on the client.

#### Path Parameters

| Parameter  | Type   | Required | Description             |
| :--------- | :----- | :------- | :---------------------- |
| `clientId` | string | **Yes**  | The UUID of the client. |

#### Response

**Example Response:**

```json
{
    "requestId": "req-uuid-123",
    "version": "1.0.0"
}
```

### Generate Client Key

`POST /v1/clients/:clientId/key`

**Description:** Triggers the generation of a new encryption key on the client agent.

#### Path Parameters

| Parameter  | Type   | Required | Description             |
| :--------- | :----- | :------- | :---------------------- |
| `clientId` | string | **Yes**  | The UUID of the client. |

#### Response

**Example Response:**

```json
{
    "status": "triggered",
    "requestId": "gen-key-uuid"
}
```

### Delete Client

`DELETE /v1/clients/:clientId`

**Description:** Removes a client registration. If the client is connected, it will be disconnected.
For outbound clients, pending reconnects are cancelled and the SSH tunnel is closed first.
Note that the connection mode cannot be changed — switching means deleting and re-creating
the client, which discards its job history.

#### Path Parameters

| Parameter  | Type   | Required | Description                       |
| :--------- | :----- | :------- | :-------------------------------- |
| `clientId` | string | **Yes**  | The UUID of the client to delete. |

#### Response

**Example Response:**

```json
{
    "status": "deleted"
}
```

---

### Create Outbound Client

`POST /v1/clients/outbound`

**Description:** Creates a client the **server** connects to — the connection and nothing else.
Nothing is persisted unless the registration handshake succeeds.

No SSH credentials are accepted here. The connection mode is fixed by this call and cannot be
changed later; the tunnel is a separate, revisable resource and is attached afterwards via
`POST /v1/clients/:clientId/tunnel`, in either connection mode. See `docs/tunnel.md`.

`outboundTargetAddress` is `host`, `host:port` or `wss://host:port`. Without a port, `:3001`
is appended. `wss://` dials the agent over TLS, which requires the agent to serve it (see
[client.md](client.md)); a bare address, or one written `ws://`, is dialled as plaintext. Any
other scheme, and a path, query or credentials, are refused — the value is interpolated into a
WebSocket URL. What is stored is the normalised form.

`registrationSecret` is what the server presents on the agent's `/ws/register`: the setup PIN
from the agent's log, or the value of `PBCM_REGISTRATION_SECRET` if the agent has one. The
agent tells the two apart.

**Example Request:**

```json
{
    "hostname": "backup-host",
    "outboundTargetAddress": "192.168.1.50:3001",
    "registrationSecret": "K7QM-3XRD"
}
```

---

### Reconnect Outbound Client

`POST /v1/clients/:clientId/reconnect`

**Description:** Immediate reconnect attempt for an offline outbound client, bypassing the
backoff. Returns `{ "connected": true | false }`.

---

### Get Client Tunnel

`GET /v1/clients/:clientId/tunnel`

**Description:** SSH tunnel configuration and live state. Stored credentials mean the tunnel
is *available* to this client; whether a run takes it is `tunnel.required` — on the job for a
backup, on the request for a restore. Never returns secrets — the private key is write-only. `404` when this client has no tunnel, which is an
ordinary state rather than an error.

---

### Create Client Tunnel

`POST /v1/clients/:clientId/tunnel`

**Description:** Attaches a tunnel to an existing client, in **either** connection mode — the
only way any client gets one, since *Create Outbound Client* no longer takes credentials and
an inbound client does not exist as a row until its agent has registered. The credentials are
tested before they are stored; `409` if the client already has a tunnel.

Storing them changes no run by itself — each job opts in through its own `tunnel` field, and
each restore through the `tunnel` field of its trigger request.

**Example Request:**

```json
{
    "sshHost": "192.168.1.50",
    "sshPort": 22,
    "sshUser": "pbcm",
    "privateKey": "-----BEGIN OPENSSH PRIVATE KEY-----...",
    "passphrase": "optional",
    "hostKeySha256": "confirmed-fingerprint"
}
```

`hostKeySha256` is the fingerprint the caller's own tunnel test was offered moments earlier;
the server verifies the host key actually presented matches it before pinning.

---

### Update Client Tunnel

`PUT /v1/clients/:clientId/tunnel`

**Description:** Updates the SSH credentials. There is no port, no tunnel target and no
on/off switch: the target follows from each job's repository, the bind port is allocated per
forward, and whether the tunnel is used is each job's own setting. An existing connection is
closed so the new credentials take effect at once, which fails a run holding a lease.

| Field | Type | Description |
| :---- | :--- | :---------- |
| `sshHost`, `sshPort`, `sshUser` | string / number / string | SSH endpoint. |
| `privateKey`, `passphrase` | string | Write-only; omit to keep the stored key. |
| `hostKeySha256` | string | Re-pins the host key. |

---

### Delete Client Tunnel

`DELETE /v1/clients/:clientId/tunnel`

**Description:** Removes the tunnel and its stored key. The client and its history stay. Jobs
still configured for the tunnel are **not** rewritten — they fail at the lease rather than
quietly taking a path nobody chose.

---

### Generate Key Pair

`POST /v1/tunnel/keypair`

**Description:** Creates a fresh ed25519 key pair for the setup helper in the UI. Stateless —
nothing is stored; the key is persisted only by the regular create/update calls. This is the
only response that ever carries a private key; it is write-only everywhere else.

**Request Body:**

```json
{
    "comment": "pbcm-server"
}
```

**Example Response:**

```json
{
    "type": "ssh-ed25519",
    "privateKey": "-----BEGIN OPENSSH PRIVATE KEY-----\n...",
    "publicKey": "ssh-ed25519 AAAAC3... pbcm-server"
}
```

---

### Derive Public Key

`POST /v1/tunnel/pubkey`

**Description:** Derives the public key from a private key the operator supplied, so the
`authorized_keys` snippet is available for self-supplied keys too. Returns `400` when the key
cannot be parsed — including a passphrase-protected key without the matching `passphrase`.

**Request Body:**

```json
{
    "privateKey": "-----BEGIN OPENSSH PRIVATE KEY-----\n...",
    "passphrase": "optional"
}
```

**Example Response:**

```json
{
    "type": "ssh-ed25519",
    "publicKey": "ssh-ed25519 AAAAC3... pbcm-server"
}
```

---

### Test Tunnel

`POST /v1/tunnel/test` — with supplied SSH parameters, for a key that is not stored yet.
`POST /v1/clients/:clientId/tunnel/test` — with the stored credentials, so the key never has
to leave the backend.

**Description:** Verifies SSH reachability, credentials and that a reverse forward is
permitted. Does **not** contact any PBS: server-to-PBS reachability is a property of the
repository and is covered by `GET /v1/repositories/:repositoryId/status`.

**Example Response:**

```json
{
    "ok": true,
    "hostKeySha256": "SHA256-fingerprint",
    "boundPort": 43021
}
```

---

## 📅 Jobs

### List Client Jobs

`GET /v1/clients/:clientId/jobs`

**Description:** Retrieves all backup jobs configured for a specific client.

#### Path Parameters

| Parameter  | Type   | Required | Description             |
| :--------- | :----- | :------- | :---------------------- |
| `clientId` | string | **Yes**  | The UUID of the client. |

#### Response (Array of BackupJob objects)

| Field             | Type            | Description                                              |
| :---------------- | :-------------- | :------------------------------------------------------- |
| `id`              | string          | UUID of the job.                                         |
| `name`            | string          | Name of the job.                                         |
| `schedule`        | ScheduleConfig  | Schedule configuration object (see below). Nullable.     |
| `scheduleEnabled` | boolean         | Whether the schedule is active.                          |
| `nextRunAt`       | string          | ISO 8601 timestamp of the next scheduled run (optional). |
| `lastRunAt`       | string          | ISO 8601 timestamp of the last run (optional).           |
| `archives`        | Archive[]       | Array of archive objects (see below).                    |
| `excludes`        | string[]        | Exclusion patterns, one `--exclude` each (see below). `[]` if none. |
| `repository`      | Repository      | The PBS repository configuration. `secret` is always `""`. |
| `encryption`      | object          | `{ "enabled": true }` when the job encrypts (optional). Never carries the key. |

**No secrets in responses.** A job's PBS token secret and its encryption key are needed by
the agent, which runs its jobs from its own `jobs.json`, and by nobody else. Every response
that carries jobs -- this one, `GET /v1/jobs` and the `JOBS_UPDATE` dashboard event --
returns `repository.secret` as an empty string and `encryption` without `keyContent`.

**ScheduleConfig object:**

| Field      | Type     | Description                                                        |
| :--------- | :------- | :----------------------------------------------------------------- |
| `interval` | number   | Numeric interval value (min 1).                                    |
| `unit`     | string   | Unit of the interval: `"seconds"`, `"minutes"`, `"hours"`, `"days"`, `"weeks"`. |
| `weekdays` | string[] | Array of weekday names for weekly schedules (e.g., `["Mon","Wed"]`). |

**Archive object:**

| Field  | Type   | Description                                              |
| :----- | :----- | :------------------------------------------------------- |
| `path` | string | Absolute path on the client to include in the backup.    |
| `name` | string | Archive name in the PBS datastore (e.g., `"etc.pxar"`).  |

**Exclusion patterns:** passed to `proxmox-backup-client backup` as `--exclude <pattern>`.
The CLI applies every pattern to **every** archive of the job, relative to that archive's
root — not to `/` of the client. The syntax is that of `.gitignore`: a leading `/` anchors
the pattern at the archive root (`/stefan/.cache` in an archive of `/home`), a pattern
without one matches at any depth (`node_modules`), and `*` / `**` are globs.

**Example Response:**

```json
[
    {
        "id": "job-uuid-123",
        "name": "Daily ETC Backup",
        "schedule": {
            "interval": 1,
            "unit": "days",
            "weekdays": []
        },
        "scheduleEnabled": true,
        "nextRunAt": "2023-10-27T02:00:00.000Z",
        "archives": [{ "path": "/etc", "name": "etc.pxar" }],
        "excludes": ["/ssl/private"],
        "repository": {
            "repositoryId": "repo-abc",
            "baseUrl": "https://pbs.local:8007",
            "datastore": "backups",
            "username": "client@pbs",
            "secret": ""
        },
        "encryption": { "enabled": true }
    }
]
```

### Save Job

`POST /v1/clients/:clientId/jobs`

**Description:** Creates or updates a backup job configuration on the client.

#### Path Parameters

| Parameter  | Type   | Required | Description             |
| :--------- | :----- | :------- | :---------------------- |
| `clientId` | string | **Yes**  | The UUID of the client. |

#### Request Body

| Field             | Type           | Required | Description                                                                |
| :---------------- | :------------- | :------- | :------------------------------------------------------------------------- |
| `id`              | string         | No       | UUID of the job. If provided, updates existing job; otherwise creates new. |
| `name`            | string         | **Yes**  | Name of the job.                                                           |
| `archives`        | Archive[]      | **Yes**  | Array of archive objects: `path` absolute, `name` matching `[A-Za-z0-9_][A-Za-z0-9_.-]*` (`.pxar` is appended). |
| `excludes`        | string[]       | No       | Exclusion patterns (see above). Send `[]` to clear them on an update.      |
| `schedule`        | ScheduleConfig | No       | Schedule configuration object (nullable).                                  |
| `scheduleEnabled` | boolean        | **Yes**  | Enable/disable the schedule.                                               |
| `repository`      | Repository     | **Yes**  | Copy of the repository to use; `repositoryId` names the managed one. `secret` may be `""`. |
| `encryption`      | object         | No       | `{ "enabled": true, "keyContent"?: string }`. Without `keyContent` the stored key is kept. |

**Secrets are filled in by the server.** The browser never has them, so it does not send
them:

- `repository.secret` is taken from the managed repository named by `repositoryId`. Saving a
  job therefore also brings its secret up to date with the repository. Without a
  `repositoryId` the job keeps the secret it already has, as long as base URL, datastore,
  username and token name are unchanged.
- `encryption.keyContent` is only sent for a key generated right before
  (`POST /v1/clients/:clientId/key`). Left out with `enabled: true`, the agent's stored key
  is kept.

`400` when neither source has a secret or a key.

**Example Request:**

```json
{
    "id": "job-uuid-123",
    "name": "Daily ETC Backup",
    "archives": [{ "path": "/etc", "name": "etc.pxar" }],
    "schedule": {
        "interval": 1,
        "unit": "days",
        "weekdays": []
    },
    "scheduleEnabled": true,
    "repository": {
        "repositoryId": "repo-abc",
        "baseUrl": "https://pbs.local:8007",
        "datastore": "backups",
        "username": "client@pbs",
        "secret": ""
    },
    "encryption": { "enabled": true }
}
```

#### Response

**Example Response:**

```json
{
    "status": "saved"
}
```

### Delete Job

`DELETE /v1/clients/:clientId/jobs/:jobId`

**Description:** Deletes a specific job configuration from the client.

#### Path Parameters

| Parameter  | Type   | Required | Description                    |
| :--------- | :----- | :------- | :----------------------------- |
| `clientId` | string | **Yes**  | The UUID of the client.        |
| `jobId`    | string | **Yes**  | The UUID of the job to delete. |

#### Response

**Example Response:**

```json
{
    "status": "deleted"
}
```

### Run Backup

`POST /v1/clients/:clientId/jobs/:jobId/run`

**Description:** Manually triggers the execution of a backup job immediately.

#### Path Parameters

| Parameter  | Type   | Required | Description                 |
| :--------- | :----- | :------- | :-------------------------- |
| `clientId` | string | **Yes**  | The UUID of the client.     |
| `jobId`    | string | **Yes**  | The UUID of the job to run. |

#### Response

**Example Response:**

```json
{
    "status": "triggered",
    "runId": "run-xyz-789"
}
```

### Trigger Restore

`POST /v1/clients/:clientId/restore`

**Description:** Triggers a restore operation on the client from a specific snapshot.

Whether it goes through the client's SSH reverse tunnel is asked per restore, exactly as it is
per job for a backup — stored credentials say the detour is possible, not that this repository
needs it. `tunnel.required` for a client with no credentials is rejected with `400`; an absent
`tunnel` means a direct connection.

#### Path Parameters

| Parameter  | Type   | Required | Description             |
| :--------- | :----- | :------- | :---------------------- |
| `clientId` | string | **Yes**  | The UUID of the client. |

#### Request Body

| Field        | Type     | Required | Description                                                                        |
| :----------- | :------- | :------- | :--------------------------------------------------------------------------------- |
| `snapshot`   | string   | **Yes**  | The snapshot to restore from, as `<type>/<id>/<YYYY-MM-DDTHH:MM:SSZ>`.             |
| `targetPath` | string   | **Yes**  | The absolute path where files should be restored.                                  |
| `repositoryId` | string | **Yes**  | The ID of the repository containing the snapshot. The server builds the repository, secret included, from the configured one; `400` if it names none. |
| `archives`   | string[] | **Yes**  | Array of archive filenames within the snapshot to restore (e.g. `["root.pxar"]`); none may start with `.` or `-`. |
| `tunnel`     | object   | No       | `{ "required": true }` to route this restore through the client's SSH reverse tunnel. |

**Example Request:**

```json
{
    "snapshot": "host/backup-client-01/2023-10-26T02:00:00Z",
    "targetPath": "/tmp/restore",
    "repositoryId": "repo-abc",
    "archives": ["root.pxar"],
    "tunnel": { "required": true }
}
```

#### Response

**Example Response:**

```json
{
    "status": "triggered",
    "runId": "restore-run-456"
}
```

### Abort Run

`POST /v1/clients/:clientId/runs/:runId/abort`

**Description:** Asks the client's agent to end a run that is under way — a backup, a
restore, or a backup queued behind another run of its job. The server does not end the run
itself: the agent stops `proxmox-backup-client` (`SIGTERM`, `SIGKILL` after ten seconds) and
reports the end through the `STATUS_UPDATE` every run ends with, as status `abort`. So the
history, the webhooks (`job.aborted`) and the dashboard learn of it the way they learn of
any end.

A run that is reading back its snapshot (`phase: "snapshot"`) cannot be aborted: its backup
is finished and in the repository. Neither can a run that exited in the moment the request
was under way; if its CLI still ended with 0, it stays a success.

No request body.

#### Response

**Example Response:**

```json
{
    "status": "aborting",
    "runId": "run-uuid"
}
```

| Status | When |
| :----- | :--- |
| `200`  | The agent accepted the request. The run's end follows as a `JOB_UPDATE`. |
| `409`  | The client is not connected, or the run is not under way on it any more. `error` says which. |
| `504`  | The agent did not answer — most likely a version from before this message existed, which drops it unread. |

---

## 📅 Global Data Views

### List All Jobs

`GET /v1/jobs`

**Description:** Retrieves all backup jobs configured across all registered clients.

#### Response

_Same structure as [List Client Jobs](#list-client-jobs)._

### Get Global History

`GET /v1/history`

**Description:** Retrieves one page of the execution history of all jobs across all clients,
newest first.

#### Query Parameters

| Parameter  | Type   | Description                                                                 |
| :--------- | :----- | :-------------------------------------------------------------------------- |
| `limit`    | number | Rows per page, 1–1000. Default 100.                                         |
| `offset`   | number | Rows to skip. Default 0.                                                    |
| `status`   | string | Only runs in this status (`success`, `failed`, `abort`, `missed`, `running`, …). An unknown status answers with 400. |
| `clientId` | string | Only runs of this client.                                                   |
| `search`   | string | Only runs this text occurs in: the job's name or id, the run's id, or the client's hostname or display name. Case-insensitive for ASCII letters, 1–200 characters; `%` and `_` are taken literally. |
| `unseen`   | string | `true`: only the runs the session's user has yet to mark as seen (see [Get History Seen State](#get-history-seen-state)). `true` or `false`; anything else answers with 400. |

#### Response

| Field   | Type   | Description                                                        |
| :------ | :----- | :----------------------------------------------------------------- |
| `items` | array  | The page.                                                          |
| `total` | number | How many runs the filter matches in all, across every page.        |

Each entry of `items` has the fields of [Get Client History](#get-client-history), with
three differences: the job is named `jobId` instead of `jobConfigId`; the row carries its
client -- `clientId`, plus `hostname` and `displayName`, which are `null` once a history
row has outlived its client; and it carries `unseen` (boolean), whether the session's user
has yet to mark the run as seen. `unseen` is a statement about the user asking, so two
users get different answers for the same run, and only this endpoint carries it.

This is the one list with an envelope. A list the server delivers whole is a bare array;
this one is delivered in pages, and `total` is what no page can tell.

A failure answers with `{ "error": "…" }` and the matching status, as everywhere else.

!!! note "Changed after 1.6"
    This endpoint used to answer with `{ "success": true, "count": n, "data": [...] }`,
    where `count` was `data.length`. It now answers with `{ "items": [...], "total": n }`,
    where `total` counts every match. A caller reading `.data` reads `.items`.
    [Get Latest History per Job](#get-latest-history-per-job) had the same wrapper and is
    now a bare array. Failures were `{ "success": false, "error": "…" }` on both.

### Get Latest History per Job

`GET /v1/history/latest`

**Description:** The newest history entry of every job, one per client and job, newest first.
Entries that belong to no job are left out. Unlike a page of [Get Global History](#get-global-history),
this includes jobs that have not run for a long time. The Jobs page shows it as
"Last Activity".

#### Response

A bare array of the entries [Get Global History](#get-global-history) returns in `items`.

### Get History Seen State

`GET /v1/history/seen`

**Description:** What the session's user has yet to mark as seen. The dashboard shows the
two counts on its "Errors / Warnings" card and lists the runs below it; the History entry
in the sidebar carries a dot while either is above zero.

A run is **unseen** for a user when all of this holds:

- its status is `failed` or `missed`,
- it ended after the user's `seenAt`, and
- the user has not marked it with [Mark Run Seen](#mark-run-seen).

Nothing is marked by opening a page. A user starts with `seenAt` set to the moment they
were created, so what failed before their time is not new to them.

#### Response

| Field          | Type           | Description                                                                 |
| :------------- | :------------- | :-------------------------------------------------------------------------- |
| `seenAt`       | string \| null | The point up to which everything counts as seen (ISO 8601): when the user was created, or their last [Mark History Seen](#mark-history-seen). `null` only for a session whose user has none, which then counts every run. |
| `unseenFailed` | number         | Unseen runs in the status `failed`. |
| `unseenMissed` | number         | Unseen runs in the status `missed`. |

```json
{
    "seenAt": "2026-09-26T08:14:02.311Z",
    "unseenFailed": 2,
    "unseenMissed": 1
}
```

### Mark History Seen

`PUT /v1/history/seen`

**Description:** Marks everything that has happened up to now as seen for the session's
user: `seenAt` becomes the current time. No request body. Answers with the new state (same
shape as [Get History Seen State](#get-history-seen-state)) and broadcasts it as
[`HISTORY_SEEN`](#dashboard-connection), so the user's other tabs follow.

### Mark Run Seen

`PUT /v1/history/:historyId/seen`

**Description:** Marks one run as seen for the session's user. No request body. Marking a
run twice is the same as once. Answers and broadcasts like
[Mark History Seen](#mark-history-seen); `404` if there is no such run.

---

## 🗄 Repositories

### List Repositories

`GET /v1/repositories`

**Description:** Retrieves all configured Proxmox Backup Server repositories. Without the
`secret`: it is written, never read back. The server stores it encrypted with
`secretKey` and uses it for its own PBS calls, for job saves, restores and
[distribution](#distribute-to-clients).

#### Response

**Example Response:**

```json
[
    {
        "id": "repo-abc",
        "baseUrl": "https://pbs.local:8007",
        "datastore": "backups",
        "username": "client@pbs",
        "status": "online"
    }
]
```

### Get Repository Status

`GET /v1/repositories/:repositoryId/status`

**Description:** Checks and returns the current connectivity status of a Proxmox Backup Server repository.

#### Path Parameters

| Parameter      | Type   | Required | Description             |
| :------------- | :----- | :------- | :---------------------- |
| `repositoryId` | string | **Yes**  | UUID of the repository. |

#### Response

**Example Response:**

```json
{
    "status": "online"
}
```

### Create Repository

`POST /v1/repositories`

**Description:** Adds a new Proxmox Backup Server repository configuration.

#### Request Body

| Field         | Type   | Required | Description                                      |
| :------------ | :----- | :------- | :----------------------------------------------- |
| `baseUrl`     | string | **Yes**  | URL of the PBS, **including the port** (e.g., `https://pbs:8007`). Without one the protocol default applies (443 for https, 80 for http) — the PBS API port is never assumed. |
| `datastore`   | string | **Yes**  | Data store name.                                 |
| `fingerprint` | string | No       | SHA256 fingerprint for self-signed certificates. |
| `username`    | string | **Yes**  | API User/Token ID (e.g., `user@pbs`).            |
| `tokenname`   | string | No       | Name of the API token if using one.              |
| `secret`      | string | **Yes**  | API Token secret or password.                    |

**Example Request:**

```json
{
    "baseUrl": "https://pbs.local:8007",
    "datastore": "backups",
    "username": "client@pbs",
    "secret": "mySecretToken",
    "fingerprint": "a9:b8:c7..."
}
```

#### Response

**Example Response:**

```json
{
    "id": "repo-abc",
    "status": "created"
}
```

### Update Repository

`PUT /v1/repositories/:repositoryId`

**Description:** Updates an existing repository configuration.

#### Path Parameters

| Parameter      | Type   | Required | Description                       |
| :------------- | :----- | :------- | :-------------------------------- |
| `repositoryId` | string | **Yes**  | UUID of the repository to update. |

#### Request Body

_Same fields as [Create Repository](#create-repository)_, except that `secret` is optional:
an empty or missing `secret` keeps the stored one.

#### Response

**Example Response:**

```json
{
    "status": "updated"
}
```

### Delete Repository

`DELETE /v1/repositories/:repositoryId`

**Description:** Deletes a repository configuration.

#### Path Parameters

| Parameter      | Type   | Required | Description                       |
| :------------- | :----- | :------- | :-------------------------------- |
| `repositoryId` | string | **Yes**  | UUID of the repository to delete. |

#### Response

**Example Response:**

```json
{
    "status": "deleted"
}
```

### Check Certificate

`GET /v1/repositories/:repositoryId/certificate`

**Description:** Measures the TLS certificate the PBS currently serves and compares it with the
stored fingerprint. Read-only — adopting the measured value is a separate `PUT`.

`caValid` reports whether the certificate passed regular validation (trusted chain **and**
matching hostname). Only that makes an adoption safe: it is evidence from a source independent
of the fingerprint itself. Without it the certificate cannot be told apart from one presented by
someone in the middle, and the operator has to verify it out of band.

**Example Response:**

```json
{
    "storedFingerprint": "49:88:dc:...",
    "measuredFingerprint": "ab:cd:ef:...",
    "matches": false,
    "caValid": true,
    "reachable": true,
    "notAfter": "Nov 27 10:00:00 2026 GMT",
    "error": null
}
```

### Distribute to Clients

`POST /v1/repositories/:repositoryId/distribute`

**Description:** Pushes the **stored** fingerprint and secret to every connected client that
runs a job against this repository, via `JOB_SAVE_CONFIG`. Jobs are matched by
`repository.repositoryId`, falling back to base URL plus datastore for jobs stored before that
id existed. A job is only sent when its fingerprint or its secret differs from the stored one.

The secret goes along because every job keeps its own copy of it -- the agent runs from its
`jobs.json`, offline if need be. Without this, a rotated PBS token would reach a job only when
someone saved it.

An explicit operator action rather than an automatic fan-out on update: for a self-signed PBS
the stored value is a human decision, and rolling it out should be one too. Offline clients are
reported, not queued.

**Example Response:**

```json
{
    "updated": [{ "clientId": "uuid", "jobId": "uuid", "jobName": "daily" }],
    "failed": [],
    "skippedOffline": [{ "clientId": "uuid", "hostname": "zeus" }]
}
```

### List Snapshots

`GET /v1/repositories/:repositoryId/snapshots`

**Description:** Proxies a request to the Proxmox Backup Server to list available snapshots for the configured datastore.

#### Path Parameters

| Parameter      | Type   | Required | Description             |
| :------------- | :----- | :------- | :---------------------- |
| `repositoryId` | string | **Yes**  | UUID of the repository. |

#### Query Parameters

| Parameter  | Type   | Description                                                                   |
| :--------- | :----- | :---------------------------------------------------------------------------- |
| `backupId` | string | Only the snapshots of this backup id. PBS is asked for these alone (`backup-id`), so a client's page does not transfer every other client's snapshots. |

#### Response (Array of Snapshot objects)

| Field          | Type   | Description                                              |
| :------------- | :----- | :------------------------------------------------------- |
| `backupType`   | string | Backup type (e.g., `"host"`).                            |
| `backupId`     | string | Identifier of the backup source (hostname).              |
| `backupTime`   | number | Unix timestamp of the backup.                            |
| `files`        | array  | Array of file objects with `filename`, `cryptMode`, `size`. |
| `size`         | number | Total size in bytes (optional).                          |
| `owner`        | string | Owner of the snapshot (optional).                        |
| `comment`      | string | Comment stored with the snapshot (optional).             |
| `fingerprint`  | string | Encryption fingerprint (optional).                       |

**Example Response:**

```json
[
    {
        "backupType": "host",
        "backupId": "hostname",
        "backupTime": 1672574400,
        "files": [{ "filename": "root.pxar", "size": 104857600 }],
        "owner": "root@pam",
        "fingerprint": "a1b2..."
    }
]
```

---

## 🎫 Registration Tokens

### List Tokens

`GET /v1/tokens`

**Description:** Lists active client registration tokens, by their hash: the token itself is not stored and cannot be listed.

#### Response (Array of Token objects)

| Field       | Type   | Description                                     |
| :---------- | :----- | :---------------------------------------------- |
| `tokenHash` | string | SHA-256 of the token, hex.                      |
| `createdAt` | string | ISO 8601 timestamp of creation.                 |
| `expiresAt` | string | ISO 8601 timestamp of expiry.                   |
| `usedAt`    | string | ISO 8601 timestamp of when it was used (optional). |
| `displayName` | string | Name applied to the client this token registers (optional). |
| `allowedIp` | string | IPv4 address or CIDR network the token may be redeemed from (optional). |

**Example Response:**

```json
[
    {
        "tokenHash": "9f86d081884c...",
        "createdAt": "2023-10-27T10:00:00Z",
        "expiresAt": "2023-10-27T14:00:00Z",
        "usedAt": null,
        "displayName": "pbs-node-01",
        "allowedIp": "192.168.1.0/24"
    }
]
```

### Create Token

`POST /v1/tokens`

**Description:** Generates a new short-lived token for client registration.

The response is the only place the token appears in the clear: the server stores just its SHA-256 hash, and [List Tokens](#list-tokens) returns that hash.

#### Request Body (optional)

Both fields carry a decision the agent cannot make for itself — it registers
unattended, so anything not set here has to be corrected by hand afterwards.

| Field         | Type   | Required | Description                                                        |
| :------------ | :----- | :------- | :----------------------------------------------------------------- |
| `displayName` | string | No       | Applied to the client on registration.                              |
| `allowedIp`   | string | No       | IPv4 address or CIDR network. Registration is refused with **403** from anywhere else, and the client stays pinned to it afterwards. Without it the client is pinned to the address it registered from. |

```json
{
    "displayName": "pbs-node-01",
    "allowedIp": "192.168.1.0/24"
}
```

#### Response

**Example Response:**

```json
{
    "token": "a1b2c3d4e5...",
    "expiresAt": "2023-10-27T14:45:00.000Z",
    "displayName": "pbs-node-01",
    "allowedIp": "192.168.1.0/24"
}
```

### Delete Token

`DELETE /v1/tokens/:tokenHash`

**Description:** Manually invalidates/deletes a registration token.

#### Path Parameters

| Parameter   | Type   | Required | Description                                       |
| :---------- | :----- | :------- | :------------------------------------------------ |
| `tokenHash` | string | **Yes**  | The `tokenHash` of the token, as the list returns it. |

#### Response

**Example Response:**

```json
{
    "status": "deleted"
}
```

A token that does not exist answers `404` with `{ "error": "Token not found" }`.

### Register Client (Public)

`POST /v1/register`

**Description:** Public endpoint used by the client agent to register itself.

#### Request Body

| Field      | Type   | Required | Description                                 |
| :--------- | :----- | :------- | :------------------------------------------ |
| `token`    | string | **Yes**  | A valid, unused registration token.         |
| `hostname` | string | No       | Hostname of the client device.              |

The agent brings no identity of its own. The **server** issues both `clientId` and the
permanent `token` below, and the agent stores them together in `identity.json` in its
data directory. An id chosen by the caller used to be accepted here, which let anyone
holding a registration token name an existing client and take over its row.

**Example Request:**

```json
{
    "token": "a1b2c3d4e5...",
    "hostname": "backup-client-01"
}
```

#### Response

Both values belong together: every later connection is checked as a pair, so an agent
that stores only one of them cannot connect.

**Example Response:**

```json
{
    "token": "f8a9b2...",
    "clientId": "550e8400-..."
}
```

---

## 🪝 Webhooks

The server keeps the webhooks and sends them: when a run reaches a final state it did not have
before, and when a client stays disconnected past its grace period and comes back. The agents
take no part. What a template may contain, and when each event fires, is described in
[Webhooks](webhooks.md).

### List Webhooks

`GET /v1/webhooks`

**Description:** Every webhook, sorted by name, with its last delivery.

#### Response (Array of Webhook objects)

| Field          | Type     | Description |
| :------------- | :------- | :---------- |
| `id`           | string   | UUID. |
| `name`         | string   | Display name, also `{{webhook.name}}` in a template. |
| `enabled`      | boolean  | A disabled webhook is not sent. |
| `url`          | string   | `http://` or `https://`; may hold placeholders. |
| `method`       | string   | `POST` or `PUT`. |
| `headers`      | object   | Header name → value; values may hold placeholders. Returned in the clear. |
| `bodyTemplate` | string   | The JSON template as written. |
| `minLevel`     | string   | `info`, `warning` or `error`. |
| `kinds`        | string[] | Kind patterns such as `job.*`, `client.*`; empty means every kind. |
| `timeoutMs`    | number   | Per attempt, 1000–60000. |
| `lastStatus`   | number   | HTTP status of the last attempt; `null` when nothing answered or nothing was sent yet. |
| `lastError`    | string   | Why the last attempt failed, or `null`. |
| `lastAttemptAt` | string  | ISO 8601, or `null` when nothing was sent yet. |
| `createdAt`    | string   | ISO 8601. |
| `updatedAt`    | string   | ISO 8601, or `null`. |

**Example Response:**

```json
[
    {
        "id": "fb97b74b-bce6-48d2-8962-fea17aae8db2",
        "name": "Ops channel",
        "enabled": true,
        "url": "https://hooks.example.com/pbcm",
        "method": "POST",
        "headers": { "Authorization": "Bearer …" },
        "bodyTemplate": "{ \"text\": \"{{client.name}}: {{event.message}}\" }",
        "minLevel": "warning",
        "kinds": [],
        "timeoutMs": 10000,
        "lastStatus": 200,
        "lastError": null,
        "lastAttemptAt": "2026-09-29T20:40:43.146Z",
        "createdAt": "2026-09-29T20:39:45.200Z",
        "updatedAt": null
    }
]
```

### Create Webhook

`POST /v1/webhooks`

**Description:** Creates a webhook.

#### Request Body

The fields of the list above without `id`, `lastStatus`, `lastError`, `lastAttemptAt`, `createdAt` and `updatedAt`. Required
are `name`, `url` and `bodyTemplate`; the rest default to `enabled: true`, `method: "POST"`,
`headers: {}`, `minLevel: "warning"`, `kinds: []` and `timeoutMs: 10000`.

A body template that is not valid JSON, longer than 64 KiB or uses a placeholder that does not
start with `event`, `client` or `webhook` is refused with **400** and names the reason:

```json
{ "error": "bodyTemplate: a: \"{{foo}}\": a path starts with event, client, webhook" }
```

#### Response

**201** with the webhook, as the list returns it.

### Update Webhook

`PUT /v1/webhooks/:webhookId`

**Description:** Replaces the whole configuration — the same body as [Create Webhook](#create-webhook).
**404** for an id that does not exist.

### Delete Webhook

`DELETE /v1/webhooks/:webhookId`

**Description:** Deletes the webhook. **404** for an id that does not exist.

```json
{ "success": true }
```

### Test Webhook

`POST /v1/webhooks/test`

**Description:** Sends the sample event for the webhook's kinds once, with the webhook as the
request describes it — saved or not. The server sends it, as it would a real delivery. No
retries, no stored result.

#### Request Body

The body of [Create Webhook](#create-webhook).

#### Response

A target that refuses is still a **200**: the test ran, and the result says how it went.

| Field      | Type    | Description |
| :--------- | :------ | :---------- |
| `ok`       | boolean | Whether the target answered 2xx. |
| `status`   | number  | The target's HTTP status, or `null` when nothing answered. |
| `error`    | string  | Why it failed, or `null`. |
| `body`     | any     | The body as rendered and sent. |
| `response` | string  | The first 500 characters the target answered, or `null`. |

```json
{ "ok": false, "status": 403, "error": "HTTP 403 Forbidden", "body": { "k": 1 }, "response": "forbidden token" }
```

---

## 🛠 Settings & Maintenance

### Get Cleanup Settings

`GET /v1/settings/cleanup`

**Description:** Retrieves current automated cleanup and retention settings.

#### Response

**Example Response:**

```json
{
    "token_retention_days": "30",
    "token_cleanup_interval_hours": "24",
    "retention_job_history_days": "90",
    "retention_job_history_count": "50",
    "job_history_cleanup_interval_hours": "24"
}
```

The response also carries `security` and any key an operator added to the `settings`
block by hand. An interval of `"0"` switches that cleanup's timer off; the manual endpoints
below keep working. `retention_invalid_tokens_days` and `retention_invalid_tokens_count`
are gone: the first is now `token_retention_days` (its value is not carried over), the
second has no successor. Left in `config.yaml`, both are ignored and logged as unknown at
startup.

### Update Cleanup Settings

`PUT /v1/settings/cleanup`

**Description:** Updates the automated cleanup and retention parameters.

#### Request Body

_Same fields as the response of [Get Cleanup Settings](#get-cleanup-settings)._ Only the
keys sent are changed; the others keep their stored value, so each tab of the settings page
sends just its own.

Changing a cleanup's retention values or interval restarts its scheduler, so the next run
moves at once (see [Scheduler Status](#scheduler-status)).

### Run Maintenance

`POST /v1/settings/cleanup`

**Description:** Manually triggers the cleanup/maintenance task based on current settings.

Runs both cleanups below, one after the other, each recorded as a manual run of its
scheduler, and answers with what each removed:

```json
{
    "success": true,
    "tokens": 2,
    "history": 14
}
```

### Clean Up Invalid Tokens

`POST /v1/settings/cleanup/invalid-tokens`

**Description:** Removes registration tokens that have been invalid (used or expired) for
longer than the saved `token_retention_days`. Recorded as a manual run of the
`token-cleanup` scheduler. The settings page runs this from its Client Tokens tab.

```json
{
    "removed": 2
}
```

### Clean Up Job History

`POST /v1/settings/cleanup/job-history`

**Description:** Removes job history records according to the saved
`retention_job_history_*` settings. Recorded as a manual run of the `job-history-cleanup`
scheduler. The settings page runs this from its Job History tab.

```json
{
    "removed": 14
}
```

### Scheduler Status

`GET /v1/settings/scheduler-status`

**Description:** The state of every scheduler the server runs: whether a run is in
progress, when the timer fires next (`null` when its interval is `0`) and the last run it
finished. The last run survives a restart (table `scheduler_state`); there is no history
beyond it.

```json
{
    "schedulers": {
        "token-cleanup": {
            "isRunning": false,
            "nextRun": "2026-09-24T16:11:22.336Z",
            "lastRun": {
                "trigger": "manual",
                "status": "success",
                "startedAt": "2026-09-23T16:11:34.355Z",
                "finishedAt": "2026-09-23T16:11:34.355Z",
                "result": { "removed": 0 },
                "error": null
            }
        },
        "job-history-cleanup": {
            "isRunning": false,
            "nextRun": null,
            "lastRun": null
        }
    }
}
```

- `trigger`: `schedule` (the timer) or `manual` (a cleanup endpoint above).
- `status`: `success`, `partial`, `failed` (with `error`) or `interrupted` — the server
  stopped while the run was in progress; `finishedAt` is `null` then.
- `result`: `{ removed }` for both schedulers, `null` unless the run succeeded.

The first run after a restart comes one interval after the last run started — at once if
that is already past. A scheduler that has never run keeps the run it had planned, so
restarts do not keep pushing it away; with none planned, it comes one interval after startup.
Every change is pushed as [`SCHEDULER_STATUS_UPDATE`](#dashboard-connection).

---

## 🏓 Reachability

### Ping

`GET /v1/ping`

**Description:** Answers the question *"is there a PBCM server at this URL?"* — no
authentication required. The agent's status and register pages call it against the
agent's configured server, to show whether it answers (`GET /api/status/server` on the
agent's web UI). The agent no longer checks an address an operator has just typed: the
registration itself reports a server that does not answer.

It deliberately checks **nothing** beyond the process answering. In particular it does
not touch the database: a server whose database is broken is still *reachable*, and
reporting "no server at this address" during setup would send the operator looking in the
wrong place.

For "is this instance able to serve requests", which is what a container healthcheck or a
monitor wants, use [Health](#-health) instead — that one does check the database.

#### Response

**Example Response:**

```json
{
    "status": "ok"
}
```

---

## 🔌 WebSockets

### Dashboard Connection

`GET /ws/dashboard`

**Description:** WebSocket endpoint for the web dashboard to receive real-time updates.

#### Authentication

The `pbcm_session` cookie, which the browser attaches to the handshake on its own. There
are no query parameters. It used to take `?token=<jwt>` — the browser WebSocket API cannot
set headers, so the query string was the only place a bearer token could go, and it was
written into every proxy and server access log the connection passed.

A connection without a valid session is closed with `4001 Unauthorized`
(or `4001 Invalid Token` if the cookie is present but does not verify).

#### Events (Server -> Client)

| Event                | Payload Structure                                                     | Description                              |
| :------------------- | :-------------------------------------------------------------------- | :--------------------------------------- |
| `CLIENTS_UPDATE`     | `Client[]`                                                            | Full list of clients and statuses. Also the first message after the handshake. |
| `JOBS_UPDATE`        | `{ clientId: string, jobs: BackupJob[] }`                             | One client's job configs; the cache only exists while its agent is connected, so this fires on connect, on disconnect (empty list) and after every job change. |
| `TUNNEL_UPDATE`      | `TunnelState`                                                         | One client's tunnel runtime state: status, active leases, forwards, last error. |
| `JOB_UPDATE`         | `{ clientId: string, job: StatusUpdatePayload }`                      | Updates for running jobs.                |
| `LOG_UPDATE`         | `{ clientId: string, jobId: string, output: string, stream: string }` | Live log output.                         |
| `JOB_NEXT_RUN_UPDATE`| `{ clientId: string, jobId: string, nextRunAt: string \| null }`      | Updated next scheduled run time for a job. |
| `SCHEDULER_STATUS_UPDATE` | `{ scheduler: SchedulerId, status: SchedulerStatus }`            | One server scheduler, whenever a run starts or ends or its timer moves. Same shape as one entry of [Scheduler Status](#scheduler-status). |
| `HISTORY_SEEN`       | `{ username: string, seenAt: string \| null, unseenFailed: number, unseenMissed: number }` | A user marked runs as seen ([Mark History Seen](#mark-history-seen), [Mark Run Seen](#mark-run-seen)). Sent to every dashboard; each keeps only its own user's. |
| `WEBHOOKS_UPDATE`    | —                                                                     | A webhook changed, or a delivery went out. The dashboard fetches [List Webhooks](#list-webhooks) again. |

These nine are the whole vocabulary, and it is written down once: `DashboardMessageSchema`
in [`shared/src/dashboardMessages.ts`](https://github.com/stefgo/proxmox-backup-client-manager/blob/main/shared/src/dashboardMessages.ts),
a discriminated union on `type`. The server can only broadcast a member of it, and the
dashboard parses every message against it -- one that does not match is dropped and
reported once per type in the browser console, never half-applied.

### Agent Connection

`GET /ws/agent`

**Description:** WebSocket endpoint for client agents. Requires the identity issued at
registration, presented as the query parameters `clientId` and `token`
(`/ws/agent?clientId=<uuid>&token=<authToken>`; the token may also travel as a
`Bearer` header). Both have to name the same client — neither half authenticates on its
own, and the id is no secret, since it is also the PBS `--backup-id` and therefore
readable from any snapshot name. A mismatch is refused with close code **4003** before
the AUTH handshake begins.

> For clients with `connectionMode: "outbound"` the direction is reversed: the **server**
> connects to the agent's own `/ws/register` and `/ws/agent` endpoints (port 3001). The
> protocol after AUTH is identical, stage 5 below included — only the `AUTH_FAILURE` is
> left out there, because the side that dialled reads the auth result rather than the
> message. See `docs/tunnel.md`.

#### Authentication Stages

1. `clientId` and `token` are looked up as a pair — both have to name the same row
   (`4003 Invalid credentials` otherwise).
2. The client's address is checked against `security.allowed_networks`
   (`4003 Access denied`).
3. A token that belongs to an **outbound** client is refused (`4003 Access denied`): those
   are dialled by the server and never connect here. Their token carries no allowed
   address, and a missing one means the check is switched off, so it would otherwise be
   valid from anywhere.
4. The client's address is checked against the client's own allowed address or network; a
   client whose check is switched off skips this step (`4003 IP address mismatch`).
5. A 5-second window is given for the client to send an `AUTH` handshake message
   (`4001 Authentication timed out` otherwise). An `AUTH` whose payload does not parse is
   closed with `4000 Invalid payload`; any other first message is answered with
   `AUTH_FAILURE` and closed with `4003 Forbidden`.

A second connection under the same client id replaces the first, which is closed with
`4000 Replaced by new connection`.

#### Client -> Server Events

**`AUTH`**
**Description:** Initial handshake. Sent by the agent immediately after connecting.
**Payload:**

```json
{
    "hostname": "client-hostname",
    "version": "1.0.0",
    "timezone": "Europe/Berlin"
}
```

`timezone` is the IANA zone of the agent process (`TZ`, UTC in a container without it), the
one its scheduler repeats jobs in. The server stores it only to show it. Optional, since older
agents do not send it.

**`TUNNEL_ACQUIRE`**
**Description:** Requests an SSH reverse tunnel lease before a run of a job configured for the
tunnel, in either connection mode. The server grants it only if the named job is itself
configured for the tunnel — the client's word is never the basis. The request carries **no
target**: the server resolves the PBS endpoint from the job (or, for
restores, from the run it authorised when triggering it) and verifies that the job belongs to
the requesting client. The endpoint is taken from the repository configured on the server
that the job points at (`repositoryId`, else host and port of `baseUrl`); a job whose
repository is not configured there is denied.
**Payload:**

```json
{
    "requestId": "uuid",
    "runId": "run-uuid",
    "jobId": "job-uuid"
}
```

**`FINGERPRINT_OBSERVED`**
**Description:** Reports a PBS certificate fingerprint the agent measured and that differs from
the one it has stored. Purely informational: the server logs it and shows it in the repository
editor, but **never** adopts it as the new target value — a single compromised client must not be
able to set what every other client then trusts.
**Payload:**

```json
{
    "repositoryId": "uuid",
    "baseUrl": "https://pbs.local:8007",
    "fingerprint": "ab:cd:ef:...",
    "caValid": true
}
```

**`TUNNEL_RELEASE`**
**Description:** Releases a lease after the run has finished. Fire-and-forget.
**Payload:**

```json
{
    "leaseId": "lease-uuid"
}
```

**`SYNC_HISTORY`**
**Description:** History rows the agent has not had acknowledged yet — what it collected
while offline, and every change since. Each entry carries the agent's `revision` of the
row; the server stores it only if it is not older than the one it holds, and answers with
`HISTORY_ACK`. Entries are validated one by one: a malformed entry is logged and, since it
can never be stored, acknowledged anyway. Agents of an older build send no `revision` and
receive no ack.
**Payload:**

```json
{
    "history": [
        {
            "id": "run-uuid",
            "jobConfigId": "job-uuid",
            "name": "job-name",
            "type": "backup",
            "status": "success",
            "startTime": "ISO-TIMESTAMP",
            "endTime": "ISO-TIMESTAMP",
            "exitCode": 0,
            "stdout": "...",
            "stderr": "...",
            "snapshot": "host/client-uuid/2026-09-30T02:00:00Z",
            "snapshotDetails": { "...": "see Get Client History" },
            "snapshotError": null,
            "revision": 3
        }
    ]
}
```

**`STATUS_UPDATE`**
**Description:** Job status update from agent.
**Payload:**

```json
{
    "id": "run-uuid",
    "jobId": "job-uuid",
    "name": "job-name",
    "status": "running",
    "type": "backup",
    "startTime": "ISO-TIMESTAMP",
    "endTime": "ISO-TIMESTAMP",
    "exitCode": 0,
    "stdout": "output...",
    "stderr": "errors...",
    "phase": null,
    "snapshot": "host/client-uuid/2026-09-30T02:00:00Z",
    "snapshotDetails": { "...": "see Get Client History" },
    "snapshotError": null
}
```

After a successful backup the agent reads back its snapshot before the run ends. For that
step it sends an update with `"status": "running"` and `"phase": "snapshot"`; the final
update carries `"phase": null` and the snapshot fields. The server stores only final
updates and passes every update on as `JOB_UPDATE`. All four fields are optional — agents
of an older build send none of them.

**`LOG_UPDATE`**
**Description:** Real-time log streaming from agent.
**Payload:**

```json
{
    "jobId": "run-uuid",
    "output": "log line content\n",
    "stream": "stdout"
}
```

#### Server -> Client Events

**`AUTH_SUCCESS`**
**Payload:**

```json
{
    "lastSyncTime": "ISO-TIMESTAMP",
    "historyAck": true
}
```

`historyAck` tells the agent that `SYNC_HISTORY` is acknowledged with `HISTORY_ACK`; the
agent then sends every row not yet acknowledged. `lastSyncTime` is kept for agents of an
older build, which send what changed after it instead.

**`HISTORY_ACK`**
**Description:** The `SYNC_HISTORY` entries the server stored, each at the revision it
received. The agent marks a row synced only up to that revision, so a row that changed
meanwhile is sent again. Not sent when storing failed — the agent retries after a minute.
**Payload:**

```json
{
    "entries": [{ "id": "run-uuid", "revision": 3 }]
}
```

**`AUTH_FAILURE`**
**Payload:**

```json
{
    "error": "Reason for failure"
}
```

**`RUN_BACKUP`**
**Description:** Instruction to run a backup job.
**Payload:**

```json
{
    "runId": "new-run-uuid",
    "jobId": "configured-job-uuid"
}
```

**`RUN_RESTORE`**
**Description:** Instruction to run a restore job.
**Payload:**

```json
{
    "runId": "new-run-uuid",
    "snapshot": "host/client-uuid/2026-09-30T02:00:00Z",
    "targetPath": "/restore/path",
    "repository": { "baseUrl": "...", "datastore": "...", "username": "...", "secret": "..." },
    "archives": ["root.pxar"],
    "tunnel": { "required": true }
}
```

`tunnel` is present only when the restore was triggered for it; absent means a direct
connection.

**`ABORT_RUN`**
**Description:** Server asks the agent to end a run that is under way. Unlike the two
above it is a request with an answer: whether the run could still be stopped is something
only the agent knows.
**Payload:**

```json
{
    "requestId": "req-uuid",
    "runId": "run-uuid"
}
```

**Response** (same type, from the agent):

```json
{
    "requestId": "req-uuid",
    "success": false,
    "error": "This run is not under way on the client any more."
}
```

`success: true` means the run was told to stop, not that it has: it ends through its own
`STATUS_UPDATE`, with status `abort`.

**`JOB_LIST_CONFIG`**
**Description:** Server requests the list of configured jobs from the agent.
**Payload:**

```json
{
    "requestId": "req-uuid"
}
```

**`JOB_SAVE_CONFIG`**
**Description:** Server instructs agent to save/update a job.
**Payload:**

```json
{
    "requestId": "req-uuid",
    "job": { "id": "job-uuid", "name": "...", "archives": [], "repository": {}, "schedule": {}, "scheduleEnabled": true }
}
```

**`JOB_DELETE_CONFIG`**
**Description:** Server instructs agent to delete a job.
**Payload:**

```json
{
    "requestId": "req-uuid",
    "jobId": "job-uuid"
}
```

**`GENERATE_KEY_CONFIG`**
**Description:** Server instructs agent to generate a new encryption key.
**Payload:**

```json
{
    "requestId": "req-uuid"
}
```

**Agent Response:**
```json
{
    "requestId": "req-uuid",
    "success": true,
    "keyContent": "-----BEGIN ENCRYPTED PRIVATE KEY-----..."
}
```

**`HISTORY`**
**Description:** Server requests job history from the agent.
**Payload:**

```json
{
    "requestId": "req-uuid"
}
```

**`FS_LIST`**
**Description:** Server requests file system listing.
**Payload:**

```json
{
    "requestId": "req-uuid",
    "path": "/path/to/list"
}
```

**`GET_VERSION`**
**Description:** Server requests agent version.
**Payload:**

```json
{
    "requestId": "req-uuid"
}
```
