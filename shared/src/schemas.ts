import { z } from "zod";

export const RepositorySchema = z.object({
    /**
     * Id of the managed repository this copy was taken from. Optional because jobs
     * stored before the id was introduced do not carry it; ProxyService backfills
     * those on the next client connect.
     */
    repositoryId: z.string().optional(),
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
    connectionMode: z.enum(["inbound", "outbound"]).optional(),
    outboundTargetAddress: z.string().optional(),
    /**
     * Whether SSH credentials are stored for this client, so its jobs may choose the
     * tunnel. Independent of `connectionMode`: the tunnel is a route to the PBS, the
     * mode is who dials the WebSocket, and every combination of the two is valid.
     */
    tunnelConfigured: z.boolean().optional(),
});

/**
 * Whether a job reaches its repository through the SSH reverse tunnel.
 *
 * A property of the job, chosen per job: one client can back up to a PBS it reaches
 * directly and to another it only reaches through the tunnel. The client side of it is
 * just the SSH credentials — stored means available, and a job that asks for a tunnel
 * the client has none for is rejected when it is saved.
 *
 * Travelling with the job is what keeps it honest: the agent stores it in the job's
 * config and there is no second copy anywhere to fall out of step with.
 *
 * The loopback port is deliberately not part of this: it is allocated per forward and
 * only known at lease time (see TunnelAcquireResult).
 */
export const TunnelModeSchema = z.object({
    required: z.boolean(),
});

/** SSH parameters for a client tunnel. Never leaves the backend once stored. */
export const TunnelConfigSchema = z.object({
    sshHost: z.string().min(1),
    sshPort: z.number().int().min(1).max(65535).optional(),
    sshUser: z.string().min(1),
    privateKey: z.string().min(1),
    passphrase: z.string().optional(),
    hostKeySha256: z.string().min(1),
});

export const ScheduleConfigSchema = z.object({
    // .finite() matters because this is also the gate for schedules read back out of
    // SQLite: JSON.parse('{"interval":1e999}') yields Infinity, which would turn the
    // computed next run into an Invalid Date.
    interval: z.number().finite().min(1),
    unit: z.enum(["seconds", "minutes", "hours", "days", "weeks"]),
    // Defaulted rather than required, so a row written before weekdays existed still
    // parses instead of silently disabling its job.
    weekdays: z.array(z.string()).default([]),
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
    id: z.uuid().nullable(),
    name: z.string().min(1),
    schedule: ScheduleConfigSchema.nullable(),
    scheduleEnabled: z.coerce.boolean(),
    createdAt: z.string().optional(),
    nextRunAt: z.string().optional(),
    lastRunAt: z.string().optional(),
});

export const BackupJobSchema = JobSchema.extend({
    archives: z.array(ArchiveSchema),
    repository: RepositorySchema,
    encryption: EncryptionConfigSchema.optional(),
    tunnel: TunnelModeSchema.optional(),
});

export const RestoreJobSchema = JobSchema.extend({
    snapshot: z.string(),
    targetPath: z.string(),
    archives: z.array(z.string()),
    repository: RepositorySchema,
    encryption: EncryptionConfigSchema.optional(),
    tunnel: TunnelModeSchema.optional(),
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

/**
 * A single IPv4 address or an IPv4 network in CIDR notation.
 *
 * Only v4: the pin is checked with `isIpInCidr` on the server, which works on
 * 32-bit integers. Accepting a v6 literal here would store a value that check
 * cannot evaluate.
 */
export const Ipv4OrCidrSchema = z.union([z.ipv4(), z.cidrv4()]);

export const TokenSchema = z.object({
    token: z.string(),
    createdAt: z.string(),
    expiresAt: z.string(),
    usedAt: z.string().optional(),
    /** Applied to the client this token registers. */
    displayName: z.string().optional(),
    /** Where the token may be redeemed from, and what the client is pinned to afterwards. */
    allowedIp: z.string().optional(),
});

/**
 * The optional body of `POST /api/v1/tokens`.
 *
 * Both values are decisions only an operator can make, and the token is the one
 * moment one is present: the agent registers unattended, so anything it is not
 * told here has to be corrected by hand afterwards.
 */
export const CreateRegistrationTokenSchema = z.object({
    displayName: z.string().trim().min(1).max(100).optional(),
    allowedIp: Ipv4OrCidrSchema.optional(),
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
    // Must be declared here even though it is optional: zod strips unknown keys, so a
    // missing entry would silently leave every tunnelled restore going direct.
    tunnel: TunnelModeSchema.optional(),
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
    // job_history.name is a nullable TEXT column, so a row genuinely can carry null.
    // Declaring it optional-only meant a single such row failed SyncHistoryPayloadSchema
    // on the server, which drops the whole payload — the client's entire delta history
    // sync, on every reconnect. Widened to match what the table can actually hold.
    name: z.string().nullable().optional(),
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

/**
 * Row shape of GET /api/v1/history. Deliberately not a HistoryEntry: the global
 * endpoint reports the history row's own job_id and LEFT JOINs the clients table
 * for hostname/displayName, whereas an agent-sourced HistoryEntry carries
 * jobConfigId and no client columns at all. Nullability follows the job_history
 * DDL; hostname/displayName are null once a history row outlives its client.
 */
export const GlobalHistoryEntrySchema = z.object({
    id: z.string(),
    clientId: z.string(),
    jobId: z.string().nullable(),
    name: z.string().nullable(),
    type: z.string(),
    status: z.string(),
    startTime: z.string(),
    endTime: z.string().nullable(),
    exitCode: z.number().nullable(),
    stdout: z.string().nullable(),
    stderr: z.string().nullable(),
    hostname: z.string().nullable(),
    displayName: z.string().nullable(),
});

export const GlobalHistoryResponseSchema = z.object({
    success: z.boolean(),
    count: z.number().optional(),
    data: z.array(GlobalHistoryEntrySchema),
});

export const SyncHistoryPayloadSchema = z.object({
    history: z.array(HistoryEntrySchema),
});

export const JobNextRunUpdatePayloadSchema = z.object({
    jobId: z.string(),
    nextRunAt: z.string().nullable(),
});

// Outbound connection mode: the server dials the client and registers itself.

export const RegistrationRequestSchema = z.object({
    secret: z.string().min(1),
    authToken: z.string().min(1),
});

export const RegistrationResultSchema = z.object({
    hostname: z.string().optional(),
    error: z.string().optional(),
});

// Tunnel lease protocol (client -> server -> client).
// The client never names a target: jobId (backup) or runId (restore) is resolved
// server-side into the actual PBS host/port.

export const TunnelAcquireSchema = z.object({
    requestId: z.string(),
    runId: z.string(),
    jobId: z.string().optional(),
});

export const TunnelAcquireResultSchema = z.object({
    requestId: z.string(),
    granted: z.boolean(),
    leaseId: z.string().optional(),
    bindHost: z.string().optional(),
    bindPort: z.number().optional(),
    /**
     * Fingerprint to pin for this run. Tunneled clients reach the PBS as 127.0.0.1 and
     * can never validate it themselves, so the server measures it and passes it along.
     */
    fingerprint: z.string().optional(),
    error: z.string().optional(),
});

/**
 * A client reporting the certificate fingerprint it measured. Purely informational —
 * the server logs it and never adopts it as the new target value.
 */
export const FingerprintObservedSchema = z.object({
    repositoryId: z.string().optional(),
    baseUrl: z.string(),
    fingerprint: z.string(),
    caValid: z.boolean(),
});

export const TunnelReleaseSchema = z.object({
    leaseId: z.string(),
});
