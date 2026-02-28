export const WS_EVENTS = {
    // Client -> Server
    AUTH: "AUTH",
    LOG_UPDATE: "LOG_UPDATE",
    STATUS_UPDATE: "STATUS_UPDATE",
    SYNC_HISTORY: "SYNC_HISTORY",

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
};

export const CLIENT_STATUS = {
    ONLINE: "online",
    OFFLINE: "offline",
    BUSY: "busy",
};
