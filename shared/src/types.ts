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
    TokenSchema,
    SnapshotSchema,
    AuthPayloadSchema,
    RunJobPayloadSchema,
    StatusUpdatePayloadSchema,
    LogUpdatePayloadSchema,
    RestoreSnapshotPayloadSchema,
    FsListRequestSchema,
    FsFileSchema,
    FsListResponseSchema,
    JobListRequestSchema,
    JobListResponseSchema,
    JobSaveRequestSchema,
    JobSaveResponseSchema,
    JobDeleteRequestSchema,
    JobDeleteResponseSchema,
    GenerateKeyRequestSchema,
    GenerateKeyResponseSchema,
    GetVersionRequestSchema,
    GetVersionResponseSchema,
    HistoryRequestSchema,
    HistoryEntrySchema,
    HistoryResponseSchema,
    SyncHistoryPayloadSchema,
    JobNextRunUpdatePayloadSchema,
    TunnelDescriptorSchema,
    TunnelConfigSchema,
    RegistrationRequestSchema,
    RegistrationResultSchema,
    TunnelAcquireSchema,
    TunnelAcquireResultSchema,
    FingerprintObservedSchema,
    TunnelReleaseSchema,
} from "./schemas.js";

export type ConnectionMode = "inbound" | "outbound";
export type TunnelStatus = "idle" | "connecting" | "up" | "error";

export type RegistrationPayload = z.infer<typeof RegistrationPayloadSchema>;
export type RegistrationResponse = z.infer<typeof RegistrationResponseSchema>;

export type Repository = z.infer<typeof RepositorySchema>;

export interface ManagedRepository extends Repository {
    id: string | number;
    status: "online" | "offline" | "unknown" | "loading";
    /** Last fingerprint a client reported for this repository. Informational only. */
    observed?: {
        fingerprint: string;
        caValid: boolean;
        clientId: string;
        at: string;
    };
}

export type Client = z.infer<typeof ClientSchema> & {
    /** Runtime tunnel state, present for outbound clients only. Never persisted. */
    tunnel?: TunnelState;
};

export type Token = z.infer<typeof TokenSchema>;

export type ScheduleConfig = z.infer<typeof ScheduleConfigSchema>;
export type Archive = z.infer<typeof ArchiveSchema>;
export type Job = z.infer<typeof JobSchema>;
export type EncryptionConfig = z.infer<typeof EncryptionConfigSchema>;
export type BackupJob = z.infer<typeof BackupJobSchema>;
export type RestoreJob = z.infer<typeof RestoreJobSchema>;

export type Snapshot = z.infer<typeof SnapshotSchema>;

// WS Payloads

export type AuthPayload = z.infer<typeof AuthPayloadSchema>;
export type RunJobPayload = z.infer<typeof RunJobPayloadSchema>;
export type StatusUpdatePayload = z.infer<typeof StatusUpdatePayloadSchema>;
export type LogUpdatePayload = z.infer<typeof LogUpdatePayloadSchema>;
export type RestoreSnapshotPayload = z.infer<
    typeof RestoreSnapshotPayloadSchema
>;
export type FsListRequest = z.infer<typeof FsListRequestSchema>;
export type FsFile = z.infer<typeof FsFileSchema>;
export type FsListResponse = z.infer<typeof FsListResponseSchema>;
export type JobListRequest = z.infer<typeof JobListRequestSchema>;
export type JobListResponse = z.infer<typeof JobListResponseSchema>;
export type JobSaveRequest = z.infer<typeof JobSaveRequestSchema>;
export type JobSaveResponse = z.infer<typeof JobSaveResponseSchema>;
export type JobDeleteRequest = z.infer<typeof JobDeleteRequestSchema>;
export type JobDeleteResponse = z.infer<typeof JobDeleteResponseSchema>;
export type GenerateKeyRequest = z.infer<typeof GenerateKeyRequestSchema>;
export type GenerateKeyResponse = z.infer<typeof GenerateKeyResponseSchema>;
export type GetVersionRequest = z.infer<typeof GetVersionRequestSchema>;
export type GetVersionResponse = z.infer<typeof GetVersionResponseSchema>;
export type HistoryRequest = z.infer<typeof HistoryRequestSchema>;
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
export type HistoryResponse = z.infer<typeof HistoryResponseSchema>;
export type SyncHistoryPayload = z.infer<typeof SyncHistoryPayloadSchema>;
export type JobNextRunUpdatePayload = z.infer<
    typeof JobNextRunUpdatePayloadSchema
>;

export type TunnelDescriptor = z.infer<typeof TunnelDescriptorSchema>;
export type TunnelConfig = z.infer<typeof TunnelConfigSchema>;
export type RegistrationRequest = z.infer<typeof RegistrationRequestSchema>;
export type RegistrationResult = z.infer<typeof RegistrationResultSchema>;
export type TunnelAcquire = z.infer<typeof TunnelAcquireSchema>;
export type TunnelAcquireResult = z.infer<typeof TunnelAcquireResultSchema>;
export type FingerprintObserved = z.infer<typeof FingerprintObservedSchema>;
export type TunnelRelease = z.infer<typeof TunnelReleaseSchema>;

/** Tunnel runtime state as broadcast to the dashboard (never persisted). */
export interface TunnelState {
    clientId: string;
    status: TunnelStatus;
    activeLeases: number;
    forwards: { target: string; port: number }[];
    lastUsedAt?: string | null;
    lastError?: string | null;
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
    FINGERPRINT_OBSERVED: {
        req: FingerprintObserved;
        res: void;
    };
    TUNNEL_ACQUIRE: {
        req: TunnelAcquire;
        res: TunnelAcquireResult;
    };
    TUNNEL_ACQUIRE_RESULT: {
        req: TunnelAcquireResult;
        res: void;
    };
    TUNNEL_RELEASE: {
        req: TunnelRelease;
        res: void;
    };
}
