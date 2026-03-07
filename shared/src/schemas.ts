import { z } from "zod";

export const RepositorySchema = z.object({
    baseUrl: z.url(),
    datastore: z.string().min(1),
    fingerprint: z.string().optional(),
    username: z.string().min(1),
    tokenname: z.string().optional(),
    secret: z.string(),
});

export const ClientSchema = z.object({
    id: z.uuid(),
    hostname: z.string(),
    displayName: z.string().optional(),
    status: z.enum(["online", "offline"]),
    lastSeen: z.string(),
    version: z.string().optional(),
});

export const ScheduleConfigSchema = z.object({
    interval: z.number().min(1),
    unit: z.enum(["seconds", "minutes", "hours", "days", "weeks"]),
    weekdays: z.array(z.string()),
});

export const ArchiveSchema = z.object({
    path: z.string().min(1),
    name: z.string().min(1),
});

export const EncryptionConfigSchema = z.object({
    enabled: z.boolean(),
    keyContent: z.string().optional(),
});

export const JobSchema = z.object({
    id: z.uuid(),
    name: z.string().min(1),
    schedule: ScheduleConfigSchema.nullable(),
    scheduleEnabled: z.boolean(),
    createdAt: z.string().optional(),
    nextRunAt: z.string().optional(),
    lastRunAt: z.string().optional(),
});

export const BackupJobSchema = JobSchema.extend({
    archives: z.array(ArchiveSchema),
    repository: RepositorySchema,
    encryption: EncryptionConfigSchema.optional(),
});

export const RestoreJobSchema = JobSchema.extend({
    snapshot: z.string(),
    targetPath: z.string(),
    archives: z.array(z.string()),
    repository: RepositorySchema,
    encryption: EncryptionConfigSchema.optional(),
});

export const RegistrationPayloadSchema = z.object({
    token: z.string(),
    clientId: z.string(),
    hostname: z.string().optional(),
});

export const RegistrationResponseSchema = z.object({
    token: z.string(),
    clientId: z.string(),
});

export const TokenSchema = z.object({
    token: z.string(),
    createdAt: z.string(),
    expiresAt: z.string(),
    usedAt: z.string().optional(),
});

export const SnapshotSchema = z.object({
    backupType: z.string(),
    backupId: z.string(),
    backupTime: z.number(),
    files: z.array(
        z.object({
            filename: z.string(),
            cryptMode: z.string().optional(),
            size: z.number().optional(),
        }),
    ),
    size: z.number().optional(),
    owner: z.string().optional(),
    comment: z.string().optional(),
    verification: z
        .object({
            state: z.string(),
            lastVerify: z.number(),
        })
        .optional(),
    fingerprint: z.string().optional(),
});

// WS Payloads schemas

export const AuthPayloadSchema = z.object({
    hostname: z.string(),
    version: z.string().optional(),
});

export const RunJobPayloadSchema = z.object({
    runId: z.string(),
    jobId: z.string(),
});

export const StatusUpdatePayloadSchema = z.object({
    id: z.string(),
    jobId: z.string().optional(),
    name: z.string(),
    status: z.string(),
    type: z.string(),
    startTime: z.string(),
    endTime: z.string().optional(),
    exitCode: z.number().optional(),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    error: z.string().optional(),
});

export const LogUpdatePayloadSchema = z.object({
    jobId: z.string(),
    output: z.string(),
    stream: z.enum(["stdout", "stderr"]),
});

export const RestoreSnapshotPayloadSchema = z.object({
    runId: z.string(),
    snapshot: z.string(),
    targetPath: z.string(),
    repository: RepositorySchema,
    archives: z.array(z.string()),
    encryption: EncryptionConfigSchema.optional(),
});

export const FsListRequestSchema = z.object({
    requestId: z.string(),
    path: z.string(),
});

export const FsFileSchema = z.object({
    name: z.string(),
    isDirectory: z.boolean(),
    path: z.string(),
    size: z.number(),
});

export const FsListResponseSchema = z.object({
    requestId: z.string(),
    files: z.array(FsFileSchema).optional(),
    error: z.string().optional(),
});

export const JobListRequestSchema = z.object({
    requestId: z.string(),
});

export const JobListResponseSchema = z.object({
    requestId: z.string(),
    jobs: z.array(BackupJobSchema),
});

export const JobSaveRequestSchema = z.object({
    requestId: z.string(),
    job: BackupJobSchema.partial(),
});

export const JobSaveResponseSchema = z.object({
    requestId: z.string(),
    success: z.boolean(),
    error: z.string().optional(),
});

export const JobDeleteRequestSchema = z.object({
    requestId: z.string(),
    jobId: z.string(),
});

export const JobDeleteResponseSchema = z.object({
    requestId: z.string(),
    success: z.boolean(),
    error: z.string().optional(),
});

export const GenerateKeyRequestSchema = z.object({
    requestId: z.string(),
});

export const GenerateKeyResponseSchema = z.object({
    requestId: z.string(),
    success: z.boolean(),
    keyContent: z.string().optional(),
    error: z.string().optional(),
});

export const GetVersionRequestSchema = z.object({
    requestId: z.string(),
});

export const GetVersionResponseSchema = z.object({
    requestId: z.string(),
    version: z.string(),
    error: z.string().optional(),
});

export const HistoryRequestSchema = z.object({
    requestId: z.string(),
});

export const HistoryEntrySchema = z.object({
    id: z.string(),
    name: z.string().optional(),
    jobConfigId: z.string().nullable(),
    type: z.string(),
    status: z.string(),
    startTime: z.string(),
    endTime: z.string().nullable(),
    exitCode: z.number().nullable(),
    stdout: z.string().nullable(),
    stderr: z.string().nullable(),
});

export const HistoryResponseSchema = z.object({
    requestId: z.string(),
    history: z.array(HistoryEntrySchema),
});

export const SyncHistoryPayloadSchema = z.object({
    history: z.array(HistoryEntrySchema),
});

export const JobNextRunUpdatePayloadSchema = z.object({
    jobId: z.string(),
    nextRunAt: z.string().nullable(),
});
