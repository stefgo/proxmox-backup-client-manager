export const WS_EVENTS = {
    // Client -> Server
    AUTH: "AUTH",
    TUNNEL_ACQUIRE: "TUNNEL_ACQUIRE",
    TUNNEL_RELEASE: "TUNNEL_RELEASE",
    LOG_UPDATE: "LOG_UPDATE",
    STATUS_UPDATE: "STATUS_UPDATE",
    SYNC_HISTORY: "SYNC_HISTORY",
    JOB_NEXT_RUN_UPDATE: "JOB_NEXT_RUN_UPDATE",
    FINGERPRINT_OBSERVED: "FINGERPRINT_OBSERVED",

    // Server -> Client
    AUTH_SUCCESS: "AUTH_SUCCESS",
    AUTH_FAILURE: "AUTH_FAILURE",
    RUN_BACKUP: "RUN_BACKUP",
    FS_LIST: "FS_LIST",
    JOB_LIST_CONFIG: "JOB_LIST_CONFIG",
    JOB_SAVE_CONFIG: "JOB_SAVE_CONFIG",
    JOB_DELETE_CONFIG: "JOB_DELETE_CONFIG",
    GENERATE_KEY_CONFIG: "GENERATE_KEY_CONFIG",
    HISTORY: "HISTORY",
    RUN_RESTORE: "RUN_RESTORE",
    TUNNEL_ACQUIRE_RESULT: "TUNNEL_ACQUIRE_RESULT",

    // Server -> Client (outbound connection mode: server dials the client)
    REGISTRATION_REQUEST: "REGISTRATION_REQUEST",
    REGISTRATION_SUCCESS: "REGISTRATION_SUCCESS",
    REGISTRATION_FAILURE: "REGISTRATION_FAILURE",

    GET_VERSION: "GET_VERSION", // Client <-> Server

    // Internal
    ERROR: "ERROR",
} as const;

export const JOB_STATUS = {
    IDLE: "idle",
    RUNNING: "running",
    SUCCESS: "success",
    FAILED: "failed",
    ABORTED: "abort",
    SKIPPED: "skipped",
    QUEUED: "queued",
};

export const CONNECTION_MODE = {
    INBOUND: "inbound",
    OUTBOUND: "outbound",
} as const;

export const TUNNEL_STATUS = {
    IDLE: "idle",
    CONNECTING: "connecting",
    UP: "up",
    ERROR: "error",
} as const;

export const CLIENT_STATUS = {
    ONLINE: "online",
    OFFLINE: "offline",
    BUSY: "busy",
};
