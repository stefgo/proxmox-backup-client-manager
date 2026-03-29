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
- [Health Check](#-health-check)
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

**Description:** Updates client metadata such as the display name.

#### Path Parameters

| Parameter  | Type   | Required | Description             |
| :--------- | :----- | :------- | :---------------------- |
| `clientId` | string | **Yes**  | The UUID of the client. |

#### Request Body

| Field         | Type   | Required | Description                              |
| :------------ | :----- | :------- | :--------------------------------------- |
| `displayName` | string | No       | A custom display name for the client.    |

**Example Request:**

```json
{
    "displayName": "Production Server"
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

**Example Request:**

```json
{
    "snapshot": "host/backup-client-01/2023-10-26T02:00:00Z",
    "targetPath": "/tmp/restore",
    "repository": "repo-abc",
    "archives": ["root.pxar"]
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

**Example Response:**

```json
[
    {
        "token": "token-123",
        "createdAt": "2023-10-27T10:00:00Z",
        "expiresAt": "2023-10-27T14:00:00Z",
        "usedAt": null
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
| `clientId` | string | **Yes**  | Client-generated UUID for the client identity. |
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

## 🏓 Health Check

### Ping

`GET /v1/ping`

**Description:** Public health check endpoint. No authentication required.

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

`GET /api/ws/dashboard`

**Description:** WebSocket endpoint for the web dashboard to receive real-time updates.

#### Query Parameters

| Parameter | Type   | Required | Description                     |
| :-------- | :----- | :------- | :------------------------------ |
| `token`   | string | **Yes**  | Valid JWT authentication token. |

#### Events (Server -> Client)

| Event                | Payload Structure                                                     | Description                              |
| :------------------- | :-------------------------------------------------------------------- | :--------------------------------------- |
| `CLIENTS_UPDATE`     | `Client[]`                                                            | Full list of clients and statuses.       |
| `JOB_UPDATE`         | `{ clientId: string, job: StatusUpdatePayload }`                      | Updates for running jobs.                |
| `LOG_UPDATE`         | `{ clientId: string, jobId: string, output: string, stream: string }` | Live log output.                         |
| `JOB_NEXT_RUN_UPDATE`| `{ jobId: string, nextRunAt: string \| null }`                        | Updated next scheduled run time for a job. |

### Agent Connection

`GET /ws`

**Description:** WebSocket endpoint for client agents. Requires an active `authToken`.

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
    "archives": ["root.pxar"]
}
```

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
