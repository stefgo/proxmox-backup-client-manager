# 📚 API Documentation

**Base URL:** `/api/v1` (unless otherwise noted)

> **Note:** All API responses are generally JSON formatted.

## 📖 Table of Contents

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
    - [Get Client History](#get-client-history)
    - [Get Client File System](#get-client-file-system)
    - [Get Client Version](#get-client-version)
    - [Delete Client](#delete-client)
- [Jobs](#-jobs)
    - [List Client Jobs](#list-client-jobs)
    - [Save Job](#save-job)
    - [Delete Job](#delete-job)
    - [Run Backup](#run-backup)
    - [Trigger Restore](#trigger-restore)
- [Repositories](#-repositories)
    - [List Repositories](#list-repositories)
    - [Create Repository](#create-repository)
    - [Update Repository](#update-repository)
    - [Delete Repository](#delete-repository)
    - [List Snapshots](#list-snapshots)
- [Registration Tokens](#-registration-tokens)
    - [List Tokens](#list-tokens)
    - [Create Token](#create-token)
    - [Delete Token](#delete-token)
    - [Register Client (Public)](#register-client-public)
- [WebSockets](#-websockets)
    - [Dashboard Connection](#dashboard-connection)
    - [Agent Connection](#agent-connection)
        - [Client -> Server Events](#client---server-events)
        - [Server -> Client Events](#server---client-events)

---

## 🔐 Authentication

### Login

`POST /login` (Note: No `/v1` prefix, maps to `/api/login`)

**Description:** Authenticates a user with local credentials and returns a JWT token.

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

| Field   | Type   | Description                                              |
| :------ | :----- | :------------------------------------------------------- |
| `token` | string | A JWT token used for authenticating subsequent requests. |

**Example Response:**

```json
{
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
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

#### Response

**Example Response:**

```json
[
    {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "hostname": "backup-client-01",
        "status": "online",
        "lastSeen": "2023-10-27T12:30:00.000Z"
    }
]
```

### Get Client History

`GET /v1/clients/:clientId/history`

**Description:** Retrieves the execution history of jobs for a specific client.

#### Path Parameters

| Parameter  | Type   | Required | Description             |
| :--------- | :----- | :------- | :---------------------- |
| `clientId` | string | **Yes**  | The UUID of the client. |

#### Response

**Example Response:**

```json
[
    {
        "id": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
        "name": "Daily System Backup",
        "type": "backup",
        "status": "success",
        "start_time": "2023-10-26T02:00:00.000Z",
        "end_time": "2023-10-26T02:15:30.000Z",
        "exit_code": 0,
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

### Delete Client

`DELETE /v1/clients/:clientId`

**Description:** Removes a client registration. If the client is connected, it will be disconnected.

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

## 📅 Jobs

### List Client Jobs

`GET /v1/clients/:clientId/jobs`

**Description:** Retrieves all backup jobs configured for a specific client.

#### Path Parameters

| Parameter  | Type   | Required | Description             |
| :--------- | :----- | :------- | :---------------------- |
| `clientId` | string | **Yes**  | The UUID of the client. |

#### Response

**Example Response:**

```json
[
    {
        "id": "job-123",
        "name": "Daily ETC Backup",
        "schedule": {
            "interval": 1,
            "unit": "days",
            "weekdays": []
        },
        "scheduleEnabled": true,
        "archives": [{ "path": "/etc", "name": "etc.pxar" }],
        "repository": {
            "id": "repo-abc",
            "baseUrl": "https://pbs.local:8007",
            "datastore": "backups",
            "username": "client@pbs",
            "status": "online"
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

| Field             | Type     | Required | Description                                                                |
| :---------------- | :------- | :------- | :------------------------------------------------------------------------- |
| `id`              | string   | No       | UUID of the job. If provided, updates existing job; otherwise creates new. |
| `name`            | string   | **Yes**  | Name of the job.                                                           |
| `archives`        | string[] | **Yes**  | Array of absolute paths to include in the backup.                          |
| `schedule`        | string   | **Yes**  | Cron-like schedule string.                                                 |
| `scheduleEnabled` | boolean  | **Yes**  | Enable/disable schedule.                                                   |
| `repository`      | string   | **Yes**  | The ID of the repository to use.                                           |

**Example Request:**

```json
{
    "id": "job-123",
    "name": "Daily ETC Backup",
    "archives": ["/etc"],
    "schedule": "0 2 * * *",
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

#### Path Parameters

| Parameter  | Type   | Required | Description             |
| :--------- | :----- | :------- | :---------------------- |
| `clientId` | string | **Yes**  | The UUID of the client. |

#### Request Body

| Field        | Type   | Required | Description                                                                       |
| :----------- | :----- | :------- | :-------------------------------------------------------------------------------- |
| `snapshot`   | string | **Yes**  | The name/ID of the snapshot to restore from.                                      |
| `targetPath` | string | **Yes**  | The absolute path where files should be restored.                                 |
| `repository` | string | **Yes**  | The ID of the repository containing the snapshot.                                 |
| `archives`   | string | **Yes**  | The name of the archive (file) within the snapshot to restore (e.g. `root.pxar`). |

**Example Request:**

```json
{
    "snapshot": "host/backup-client-01/2023-10-26T02:00:00Z",
    "targetPath": "/tmp/restore",
    "repository": "repo-abc",
    "archives": "root.pxar"
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

### Create Repository

`POST /v1/repositories`

**Description:** Adds a new Proxmox Backup Server repository configuration.

#### Request Body

| Field         | Type   | Required | Description                                      |
| :------------ | :----- | :------- | :----------------------------------------------- |
| `baseUrl`     | string | **Yes**  | URL of the PBS (e.g., `https://pbs:8007`).       |
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

_Same fields as Create Repository._

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

### List Snapshots

`GET /v1/repositories/:repositoryId/snapshots`

**Description:** Proxies a request to the Proxmox Backup Server to list available snapshots for the configured datastore.

#### Path Parameters

| Parameter      | Type   | Required | Description             |
| :------------- | :----- | :------- | :---------------------- |
| `repositoryId` | string | **Yes**  | UUID of the repository. |

#### Response

**Example Response:**

```json
[
    {
        "backup_type": "host",
        "backup_id": "hostname",
        "backup_time": 1672574400,
        "files": [{ "filename": "root.pxar" }],
        "fingerprint": "a1b2..."
    }
]
```

---

## 🎫 Registration Tokens

### List Tokens

`GET /v1/tokens`

**Description:** Lists active client registration tokens.

#### Response

**Example Response:**

```json
[
    {
        "token": "token-123",
        "created_at": "2023-10-27T10:00:00Z",
        "expires_at": "2023-10-27T14:00:00Z",
        "used_at": null
    }
]
```

### Create Token

`POST /v1/tokens`

**Description:** Generates a new short-lived token for client registration.

#### Response

**Example Response:**

```json
{
    "token": "a1b2c3d4e5...",
    "expiresAt": "2023-10-27T14:45:00.000Z"
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
| `clientId` | string | **Yes**  | CSS-generated UUID for the client identity. |
| `hostname` | string | No       | Hostname of the client device.              |

**Example Request:**

```json
{
    "token": "a1b2c3d4e5...",
    "clientId": "550e8400-...",
    "hostname": "backup-client-01"
}
```

#### Response

**Example Response:**

```json
{
    "token": "f8a9b2...",
    "clientId": "550e8400-..."
}
```

---

## 🔌 WebSockets

### Dashboard Connection

`GET /api/ws/dashboard`

**Description:** WebSocket endpoint for the web dashboard to receive real-time updates.

#### Query Parameters

| Parameter | Type   | Required | Description                     |
| :-------- | :----- | :------- | :------------------------------ |
| `token`   | string | **Yes**  | Valid JWT authentication token. |

#### Events (Server -> Client)

| Event            | Payload Structure                                                     | Description                        |
| :--------------- | :-------------------------------------------------------------------- | :--------------------------------- |
| `CLIENTS_UPDATE` | `Client[]`                                                            | Full list of clients and statuses. |
| `JOB_UPDATE`     | `{ clientId: string, job: StatusUpdatePayload }`                      | Updates for running jobs.          |
| `LOG_UPDATE`     | `{ clientId: string, jobId: string, output: string, stream: string }` | Live log output.                   |

### Agent Connection

`GET /ws`

**Description:** WebSocket endpoint for client agents. Requires an active `authToken`.

#### Client -> Server Events

**`AUTH`**
**Description:** Initial handshake.
**Payload:**

```json
{
    "hostname": "client-hostname",
    "version": "1.0.0"
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
    "name": "job-name",
    "status": "running", // or "success", "failed"
    "type": "backup", // or "restore"
    "start_time": "ISO-TIMESTAMP",
    "end_time": "ISO-TIMESTAMP", // optional
    "exit_code": 0, // optional
    "stdout": "output...", // optional
    "stderr": "errors..." // optional
}
```

**`LOG_UPDATE`**
**Description:** Real-time log streaming from agent.
**Payload:**

```json
{
    "jobId": "run-uuid",
    "output": "log line content\n",
    "stream": "stdout" // or "stderr"
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
  "repository": { ...Repository object... },
  "archives": ["root.pxar"]
}
```

**`JOB_LIST_CONFIG`**
**Description:** Server requests the list of configured jobs.
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
  "job": { ...Job config object... }
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

**`HISTORY`**
**Description:** Server requests job history.
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
