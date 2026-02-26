export interface RegistrationPayload {
    token: string;
    clientId: string;
    hostname?: string;
}

export interface RegistrationResponse {
    token: string;
    clientId: string;
}

export interface Repository {
    baseUrl: string;
    datastore: string;
    fingerprint?: string;
    username: string;
    tokenname?: string;
    secret: string;
}

export interface ManagedRepository extends Repository {
    id: string | number;
    status: 'online' | 'offline' | 'unknown' | 'loading';
}

export interface Client {
    id: string;
    hostname: string;
    displayName?: string;
    status: 'online' | 'offline';
    lastSeen: string;
}

export interface Token {
    token: string;
    createdAt: string;
    expiresAt: string;
    usedAt?: string;
}

export interface ScheduleConfig {
    interval: number;
    unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks';
    weekdays: string[];
}

export interface Archive {
    path: string;
    name: string;
}

export interface Job {
    id: string;
    name: string;
    schedule: ScheduleConfig | null;
    scheduleEnabled: boolean;
    createdAt?: string;
    nextRunAt?: string;
    lastRunAt?: string;
}

export interface EncryptionConfig {
    enabled: boolean;
    keyContent?: string;
}

export interface BackupJob extends Job {
    archives: Archive[];
    repository: Repository;
    encryption?: EncryptionConfig;
}

export interface RestoreJob extends Job {
    snapshot: string;
    targetPath: string;
    archives: string[];
    repository: Repository;
}

export interface Snapshot {
    backupType: string;
    backupId: string;
    backupTime: number; // Unix timestamp
    files: { filename: string; cryptMode?: string; size?: number }[];
    size?: number;
    owner?: string;
    comment?: string;
    verification?: {
        state: string;
        lastVerify: number;
    };
    fingerprint?: string;
}

// WS Payloads

export interface AuthPayload {
    hostname: string;
}

export interface RunJobPayload {
    runId: string;
    jobId: string;
}

export interface StatusUpdatePayload {
    id: string;
    name?: string;
    status: string;
    type: string;
    startTime?: string;
    endTime?: string;
    exitCode?: number;
    stdout?: string;
    stderr?: string;
    error?: string;
}

export interface LogUpdatePayload {
    jobId: string;
    output: string;
    stream: 'stdout' | 'stderr';
}

export interface RestoreSnapshotPayload {
    runId: string;
    snapshot: string;
    targetPath: string;
    repository: Repository;
    archives: string[];
}

export interface FsListRequest {
    requestId: string;
    path: string;
}

export interface FsFile {
    name: string;
    isDirectory: boolean;
    path: string;
    size: number;
}

export interface FsListResponse {
    requestId: string;
    files?: FsFile[];
    error?: string;
}

export interface JobListRequest {
    requestId: string;
}

export interface JobListResponse {
    requestId: string;
    jobs: BackupJob[];
}

export interface JobSaveRequest {
    requestId: string;
    job: Partial<BackupJob>;
}

export interface JobSaveResponse {
    requestId: string;
    success: boolean;
    error?: string;
}

export interface JobDeleteRequest {
    requestId: string;
    jobId: string;
}

export interface JobDeleteResponse {
    requestId: string;
    success: boolean;
    error?: string;
}

export interface GenerateKeyRequest {
    requestId: string;
}

export interface GenerateKeyResponse {
    requestId: string;
    success: boolean;
    keyContent?: string;
    error?: string;
}

export interface GetVersionRequest {
    requestId: string;
}

export interface GetVersionResponse {
    requestId: string;
    version: string;
    error?: string;
}

export interface HistoryRequest {
    requestId: string;
}

export interface HistoryEntry {
    id: string;
    name?: string;
    jobConfigId: string | null;
    type: string;
    status: string;
    startTime: string;
    endTime: string | null;
    exitCode: number | null;
    stdout: string | null;
    stderr: string | null;
}

export interface HistoryResponse {
    requestId: string;
    history: HistoryEntry[];
}

export interface WsMessage<T = any> {
    type: string;
    payload: T;
}

export interface ProtocolMap {
    'AUTH': {
        req: AuthPayload;
        res: void;
    };
    'AUTH_SUCCESS': {
        req: void;
        res: void;
    };
    'AUTH_FAILURE': {
        req: { error?: string };
        res: void;
    };
    'GET_VERSION': {
        req: GetVersionRequest;
        res: GetVersionResponse;
    };
    'JOB_LIST_CONFIG': {
        req: JobListRequest;
        res: JobListResponse;
    };
    'JOB_SAVE_CONFIG': {
        req: JobSaveRequest;
        res: JobSaveResponse;
    };
    'JOB_DELETE_CONFIG': {
        req: JobDeleteRequest;
        res: JobDeleteResponse;
    };
    'GENERATE_KEY_CONFIG': {
        req: GenerateKeyRequest;
        res: GenerateKeyResponse;
    };
    'RUN_BACKUP': {
        req: RunJobPayload;
        res: void;
    };
    'RUN_RESTORE': {
        req: RestoreSnapshotPayload;
        res: void;
    };
    'FS_LIST': {
        req: FsListRequest;
        res: FsListResponse;
    };
    'HISTORY': {
        req: HistoryRequest;
        res: HistoryResponse;
    };
    'STATUS_UPDATE': {
        req: StatusUpdatePayload;
        res: void;
    };
    'LOG_UPDATE': {
        req: LogUpdatePayload;
        res: void;
    };
}
