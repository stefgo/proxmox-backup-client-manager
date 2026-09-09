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

/** Applies to every request the server sends an agent that has no entry below. */
export const WS_REQUEST_TIMEOUT_DEFAULT_MS = 5000;

/**
 * How long the server waits for an agent's answer, per event.
 *
 * Five seconds used to apply to everything. That is generous for a config read and far
 * too little for the two below: a directory listing on a large tree and an encryption key
 * generation are both slow by nature, and over a narrow link they timed out while the
 * agent was still working — the answer then arrived for a request nobody was waiting for.
 *
 * Kept next to WS_EVENTS rather than in the server, because the agent's own timeouts are
 * derived from the same contract and the two must not drift.
 */
export const WS_REQUEST_TIMEOUT_MS: Partial<Record<string, number>> = {
    [WS_EVENTS.FS_LIST]: 30000,
    [WS_EVENTS.GENERATE_KEY_CONFIG]: 30000,
    [WS_EVENTS.HISTORY]: 15000,
};

export const JOB_STATUS = {
    IDLE: "idle",
    RUNNING: "running",
    SUCCESS: "success",
    FAILED: "failed",
    ABORTED: "abort",
    SKIPPED: "skipped",
    QUEUED: "queued",
} as const;

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

/**
 * Whether the server currently holds a WebSocket to the agent. Deliberately binary:
 * ProxyService derives it from `connectedClients` on every dashboard broadcast, and
 * there is no third state for it to report.
 */
export const CLIENT_STATUS = {
    ONLINE: "online",
    OFFLINE: "offline",
} as const;

/**
 * Reachability of a managed PBS repository. Wider than CLIENT_STATUS on both ends:
 * `unknown` is what the list endpoint returns before anything has probed the repository,
 * `loading` is the frontend's own marker while a probe is in flight.
 */
export const REPOSITORY_STATUS = {
    ONLINE: "online",
    OFFLINE: "offline",
    UNKNOWN: "unknown",
    LOADING: "loading",
} as const;
