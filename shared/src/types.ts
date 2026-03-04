import { z } from "zod";
import {
    ClientSchema,
    BackupJobSchema,
    JobSchema,
    RestoreJobSchema,
    RepositorySchema,
    RegistrationPayloadSchema,
    RegistrationResponseSchema,
    ArchiveSchema,
    EncryptionConfigSchema,
    ScheduleConfigSchema,
} from "./schemas.js";

export type RegistrationPayload = z.infer<typeof RegistrationPayloadSchema>;
export type RegistrationResponse = z.infer<typeof RegistrationResponseSchema>;

export type Repository = z.infer<typeof RepositorySchema>;

export interface ManagedRepository extends Repository {
    id: string | number;
    status: "online" | "offline" | "unknown" | "loading";
}

export type Client = z.infer<typeof ClientSchema>;

export interface Token {
    token: string;
    createdAt: string;
    expiresAt: string;
    usedAt?: string;
}

export type ScheduleConfig = z.infer<typeof ScheduleConfigSchema>;
export type Archive = z.infer<typeof ArchiveSchema>;
export type Job = z.infer<typeof JobSchema>;
export type EncryptionConfig = z.infer<typeof EncryptionConfigSchema>;
export type BackupJob = z.infer<typeof BackupJobSchema>;
export type RestoreJob = z.infer<typeof RestoreJobSchema>;

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
    stream: "stdout" | "stderr";
}

export interface RestoreSnapshotPayload {
    runId: string;
    snapshot: string;
    targetPath: string;
    repository: Repository;
    archives: string[];
    encryption?: EncryptionConfig;
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

export interface SyncHistoryPayload {
    history: HistoryEntry[];
}

export interface JobNextRunUpdatePayload {
    jobId: string;
    nextRunAt: string | null;
}

export interface WsMessage<T = any> {
    type: string;
    payload: T;
}

export interface ProtocolMap {
    AUTH: {
        req: AuthPayload;
        res: void;
    };
    AUTH_SUCCESS: {
        req: void;
        res: { lastSyncTime?: string | null };
    };
    AUTH_FAILURE: {
        req: { error?: string };
        res: void;
    };
    GET_VERSION: {
        req: GetVersionRequest;
        res: GetVersionResponse;
    };
    JOB_LIST_CONFIG: {
        req: JobListRequest;
        res: JobListResponse;
    };
    JOB_SAVE_CONFIG: {
        req: JobSaveRequest;
        res: JobSaveResponse;
    };
    JOB_DELETE_CONFIG: {
        req: JobDeleteRequest;
        res: JobDeleteResponse;
    };
    GENERATE_KEY_CONFIG: {
        req: GenerateKeyRequest;
        res: GenerateKeyResponse;
    };
    RUN_BACKUP: {
        req: RunJobPayload;
        res: void;
    };
    RUN_RESTORE: {
        req: RestoreSnapshotPayload;
        res: void;
    };
    FS_LIST: {
        req: FsListRequest;
        res: FsListResponse;
    };
    HISTORY: {
        req: HistoryRequest;
        res: HistoryResponse;
    };
    STATUS_UPDATE: {
        req: StatusUpdatePayload;
        res: void;
    };
    LOG_UPDATE: {
        req: LogUpdatePayload;
        res: void;
    };
    SYNC_HISTORY: {
        req: SyncHistoryPayload;
        res: void;
    };
    JOB_NEXT_RUN_UPDATE: {
        req: JobNextRunUpdatePayload;
        res: void;
    };
}
