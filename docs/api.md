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
- [Global Data Views](#-global-data-views)
    - [List All Jobs](#list-all-jobs)
    - [Get Global History](#get-global-history)
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
- [Settings & Maintenance](#-settings--maintenance)
    - [Get Cleanup Settings](#get-cleanup-settings)
    - [Update Cleanup Settings](#update-cleanup-settings)
    - [Run Maintenance](#run-maintenance)
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

The agent exposes the same endpoint on its own web UI port (`3001` by default), where it
serves the same purpose.

#### Response

| Status | Body                  | Meaning                            |
| :----- | :-------------------- | :--------------------------------- |
| `200`  | `{"status":"ok"}`     | The process serves requests and its database is reachable |
| `503`  | `{"status":"error"}`  | The database could not be queried  |

**What it deliberately does not check.** The server does not consult its agent
connections: a single offline agent must not mark the control plane as broken. The agent
does not consult its server connection either — it runs its jobs from its own SQLite copy
whether or not the server can be reached, so a lost connection is not ill health. The
agent's connection state has its own endpoint on its web UI (`/api/status/connection`).

**Why `/api/health` and not `/health`.** The server answers every path outside `/api`
with the SPA's `index.html` and **HTTP 200**, so a probe pointed at `/health` would keep
reporting success even if the route were gone. Under `/api`, an unknown path returns
`404` as JSON.

**Not to be confused with [`/v1/ping`](#-reachability).** That one answers "is there a
PBCM server at this URL" for an operator typing an address during registration, and
touches nothing. This one answers "can this instance serve requests" and checks the
database. Keeping them apart matters: if `ping` reported the database, a server with a
broken one would tell the operator that the address is wrong.

---

## 🔐 Authentication

Browser sessions are carried by a cookie, not by a token the page holds.

| Cookie         | Contents         | Flags                                              |
| :------------- | :--------------- | :------------------------------------------------- |
| `pbcm_session` | The JWT          | `HttpOnly`, `SameSite=Strict`, `Secure` over HTTPS |
| `pbcm_auth`    | `1`, no secret   | `SameSite=Strict` — readable, so the UI knows whether to render the login form |

`Max-Age` on both follows `jwtExpiresIn`. `Secure` is set only when the request arrived
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

**Description:** Who the session belongs to. The dashboard used to base64-decode the JWT
in the browser to get this; with the token in an `HttpOnly` cookie it comes from the
server that issued it instead.

```json
{
    "username": "admin",
    "id": 1
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

**Example Response:**

```json
[
    {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "hostname": "backup-client-01",
        "displayName": "Production Server",
        "status": "online",
        "lastSeen": "2023-10-27T12:30:00.000Z",
        "version": "1.2.0"
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
        "stderr": null
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

**Example Request:**

```json
{
    "hostname": "backup-host",
    "outboundTargetAddress": "192.168.1.50:3001",
    "registrationSecret": "one-time-secret"
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
| `repository`      | Repository      | The PBS repository configuration.                        |

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
        "repository": {
            "baseUrl": "https://pbs.local:8007",
            "datastore": "backups",
            "username": "client@pbs",
            "secret": "***"
        }
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
| `archives`        | Archive[]      | **Yes**  | Array of archive objects with `path` and `name`.                           |
| `schedule`        | ScheduleConfig | No       | Schedule configuration object (nullable).                                  |
| `scheduleEnabled` | boolean        | **Yes**  | Enable/disable the schedule.                                               |
| `repository`      | string         | **Yes**  | The ID of the repository to use.                                           |

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
    "repository": "repo-abc"
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
| `snapshot`   | string   | **Yes**  | The name/ID of the snapshot to restore from.                                       |
| `targetPath` | string   | **Yes**  | The absolute path where files should be restored.                                  |
| `repository` | string   | **Yes**  | The ID of the repository containing the snapshot.                                  |
| `archives`   | string[] | **Yes**  | Array of archive filenames within the snapshot to restore (e.g. `["root.pxar"]`). |
| `tunnel`     | object   | No       | `{ "required": true }` to route this restore through the client's SSH reverse tunnel. |

**Example Request:**

```json
{
    "snapshot": "host/backup-client-01/2023-10-26T02:00:00Z",
    "targetPath": "/tmp/restore",
    "repository": "repo-abc",
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

---

## 📅 Global Data Views

### List All Jobs

`GET /v1/jobs`

**Description:** Retrieves all backup jobs configured across all registered clients.

#### Response

_Same structure as [List Client Jobs](#list-client-jobs)._

### Get Global History

`GET /v1/history`

**Description:** Retrieves the execution history of all jobs across all clients.

#### Response

_Same structure as [Get Client History](#get-client-history)._

---

## 🗄 Repositories

### List Repositories

`GET /v1/repositories`

**Description:** Retrieves all configured Proxmox Backup Server repositories.

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

_Same fields as [Create Repository](#create-repository)._

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

### Distribute Fingerprint

`POST /v1/repositories/:repositoryId/distribute`

**Description:** Pushes the **stored** fingerprint to every connected client that runs a job
against this repository, via `JOB_SAVE_CONFIG`. Jobs are matched by `repository.repositoryId`,
falling back to base URL plus datastore for jobs stored before that id existed.

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

**Description:** Lists active client registration tokens.

#### Response (Array of Token objects)

| Field       | Type   | Description                                     |
| :---------- | :----- | :---------------------------------------------- |
| `token`     | string | The token string.                               |
| `createdAt` | string | ISO 8601 timestamp of creation.                 |
| `expiresAt` | string | ISO 8601 timestamp of expiry.                   |
| `usedAt`    | string | ISO 8601 timestamp of when it was used (optional). |
| `displayName` | string | Name applied to the client this token registers (optional). |
| `allowedIp` | string | IPv4 address or CIDR network the token may be redeemed from (optional). |

**Example Response:**

```json
[
    {
        "token": "token-123",
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

`DELETE /v1/tokens/:token`

**Description:** Manually invalidates/deletes a registration token.

#### Path Parameters

| Parameter | Type   | Required | Description                 |
| :-------- | :----- | :------- | :-------------------------- |
| `token`   | string | **Yes**  | The token string to delete. |

#### Response

**Example Response:**

```json
{
    "status": "deleted"
}
```

### Register Client (Public)

`POST /v1/register`

**Description:** Public endpoint used by the client agent to register itself.

#### Request Body

| Field      | Type   | Required | Description                                 |
| :--------- | :----- | :------- | :------------------------------------------ |
| `token`    | string | **Yes**  | A valid, unused registration token.         |
| `hostname` | string | No       | Hostname of the client device.              |

The agent brings no identity of its own. The **server** issues both `clientId` and the
permanent `token` below, and the agent stores them together in its `config.yaml`. An id
chosen by the caller used to be accepted here, which let anyone holding a registration
token name an existing client and take over its row.

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

## 🛠 Settings & Maintenance

### Get Cleanup Settings

`GET /v1/settings/cleanup`

**Description:** Retrieves current automated cleanup and retention settings.

#### Response

**Example Response:**

```json
{
    "keepLast": 10,
    "keepDaily": 7,
    "keepWeekly": 4,
    "keepMonthly": 12
}
```

### Update Cleanup Settings

`PUT /v1/settings/cleanup`

**Description:** Updates the automated cleanup and retention parameters.

#### Request Body

_Same fields as the response of [Get Cleanup Settings](#get-cleanup-settings)._

### Run Maintenance

`POST /v1/settings/cleanup`

**Description:** Manually triggers the cleanup/maintenance task based on current settings.

---

## 🏓 Reachability

### Ping

`GET /v1/ping`

**Description:** Answers the question *"is there a PBCM server at this URL?"* — no
authentication required. The agent calls it against a URL an operator has just typed, to
tell them before registration whether the address is right (`GET /api/status/server` on
the agent's web UI).

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
| `CLIENTS_UPDATE`     | `Client[]`                                                            | Full list of clients and statuses.       |
| `JOBS_UPDATE`        | `{ clientId: string, jobs: BackupJob[] }`                             | One client's job configs; the cache only exists while its agent is connected, so this fires on connect, on disconnect (empty list) and after every job change. |
| `JOB_UPDATE`         | `{ clientId: string, job: StatusUpdatePayload }`                      | Updates for running jobs.                |
| `LOG_UPDATE`         | `{ clientId: string, jobId: string, output: string, stream: string }` | Live log output.                         |
| `JOB_NEXT_RUN_UPDATE`| `{ jobId: string, nextRunAt: string \| null }`                        | Updated next scheduled run time for a job. |

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
> protocol after AUTH is identical. See `docs/tunnel.md`.

#### Client -> Server Events

**`AUTH`**
**Description:** Initial handshake. Sent by the agent immediately after connecting.
**Payload:**

```json
{
    "hostname": "client-hostname",
    "version": "1.0.0"
}
```

**`TUNNEL_ACQUIRE`**
**Description:** Requests an SSH reverse tunnel lease before a run of a job configured for the
tunnel, in either connection mode. The server grants it only if the named job is itself
configured for the tunnel — the client's word is never the basis. The request carries **no
target**: the server resolves the PBS endpoint from the job (or, for
restores, from the run it authorised when triggering it) and verifies that the job belongs to
the requesting client.
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
**Description:** Delta-load of job history from agent to server.
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
            "stderr": "..."
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
    "stderr": "errors..."
}
```

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
    "lastSyncTime": "ISO-TIMESTAMP"
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
    "snapshot": "snapshot-name",
    "targetPath": "/restore/path",
    "repository": { "baseUrl": "...", "datastore": "...", "username": "...", "secret": "..." },
    "archives": ["root.pxar"],
    "tunnel": { "required": true }
}
```

`tunnel` is present only when the restore was triggered for it; absent means a direct
connection.

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
