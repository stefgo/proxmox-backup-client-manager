import { z } from "zod";
import {
    CLIENT_STATUS,
    CONNECTION_MODE,
    DEFAULT_AGENT_PORT,
    JOB_PHASE,
    JOB_STATUS,
    SCHEDULER_IDS,
    SCHEDULER_RUN_STATUSES,
    SCHEDULER_TRIGGERS,
    TUNNEL_STATUS,
    WEBHOOK_LEVELS,
    WEBHOOK_METHODS,
} from "./constants.js";
import { normaliseTargetAddress } from "./targetAddress.js";
import { placeholderError, webhookTemplateError } from "./webhookTemplate.js";

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

/**
 * `POST /api/v1/repositories` and `PUT /api/v1/repositories/:repositoryId` -- what the
 * repository editor sends. The secret is optional here and only here: it is never sent to
 * the browser, so an update carries one only to change it, and one without keeps what is
 * stored. Creating requires it; the controller says so, since only it knows which of the
 * two it is.
 */
export const RepositoryInputSchema = RepositorySchema.extend({
    secret: z.string().optional(),
});

/**
 * A single IPv4 address or an IPv4 network in CIDR notation.
 *
 * Only v4: the pin is checked with `isIpInCidr` on the server, which works on
 * 32-bit integers. Accepting a v6 literal here would store a value that check
 * cannot evaluate.
 */
export const Ipv4OrCidrSchema = z.union([z.ipv4(), z.cidrv4()], {
    error: "Must be an IPv4 address or an IPv4 network in CIDR notation",
});

/**
 * One entry of `security.trusted_proxies`: what Fastify's `trustProxy` (proxy-addr) accepts
 * as a list item. Unlike the pin above this may be v6 — proxy-addr evaluates it, not
 * `isIpInCidr`. The three names are proxy-addr's presets: `loopback` (127.0.0.1/8, ::1),
 * `linklocal` and `uniquelocal` (the RFC 1918 ranges and fc00::/7, which covers a proxy
 * on a Docker bridge network whose address is not fixed).
 */
export const TrustedProxySchema = z.union(
    [
        z.ipv4(),
        z.cidrv4(),
        z.ipv6(),
        z.cidrv6(),
        z.enum(["loopback", "linklocal", "uniquelocal"]),
    ],
    {
        error: "Must be an IP address, a network in CIDR notation, or one of loopback, linklocal, uniquelocal",
    },
);

/** YAML turns an empty block (`tls:` with nothing below it) into null. */
const blockOrMissing = <T extends z.ZodType>(schema: T) =>
    z.preprocess((value) => value ?? undefined, schema);

/** The levels pino accepts. */
export const LogLevelSchema = z.enum([
    "trace",
    "debug",
    "info",
    "warn",
    "error",
    "fatal",
    "silent",
]);

/**
 * Where the certificate and its private key are, for an agent that terminates TLS. The
 * paths stay exactly as the operator wrote them -- the agent resolves them against its own
 * directory and checks at startup that both files can be read.
 */
export const AgentTlsConfigSchema = z.object({
    cert: z.string().trim().min(1, { error: "Must be the path to a certificate file" }),
    key: z.string().trim().min(1, { error: "Must be the path to a private key file" }),
});

/**
 * The whole of the agent's config.yaml -- everything the operator writes, and nothing the
 * agent writes back: `clientId` and `authToken` are issued by the server and live in the
 * agent's data directory (see client/src/core/Identity.ts).
 *
 * Loose at the top level, so a key this version does not know stays a key it ignores rather
 * than a reason not to start. The agent edits the file through its YAML document, never by
 * writing this object back, so nothing here can delete what it did not parse.
 *
 * Every field carries its default, which makes this schema the one place that says what an
 * agent without a config.yaml does. Three settings are deliberately *not* validated here --
 * `logLevel`, `allowSelfSignedCertificates` and `logCapBytes` are tolerated rather than
 * fatal, and Config.ts drops a wrong value with a warning before it reaches this schema.
 */
export const AgentConfigSchema = z.looseObject({
    /**
     * Where the server is, for an agent that dials in. Left unvalidated beyond "a
     * non-empty string": a URL nobody can parse costs the WebSocket, not the web UI the
     * operator would fix it in -- so it is a warning at derivation, not a refusal to start.
     */
    serverUrl: z.string().trim().min(1).nullish(),
    logLevel: LogLevelSchema.default("info"),
    /** The `proxmox-backup-client` binary. In the container image it is on `PATH`. */
    executable: z.string().trim().min(1).default("proxmox-backup-client"),
    /** Static arguments appended to every backup, alternating flag and value. */
    backupParams: blockOrMissing(z.array(z.string()).default([])),
    /** The same for every restore. */
    restoreParams: blockOrMissing(z.array(z.string()).default([])),
    /** Scripts run before and after a job; empty means none. */
    preScript: z.string().nullish(),
    postScript: z.string().nullish(),
    /** Seconds before a queued run is started once the one ahead of it has finished. */
    queueDelaySeconds: z.number().min(0).default(5),
    /**
     * Random delay before requesting a tunnel lease. Clients usually share the same
     * schedule ("daily at 02:00") and would otherwise all ask in the same second.
     */
    tunnelAcquireJitterSeconds: z.number().min(0).default(30),
    /**
     * Bytes of stdout and stderr kept per run, each channel counted separately. The output
     * is held in memory for the whole run, stored with its history and synced to the server,
     * so an unbounded one costs three times over.
     */
    logCapBytes: z.number().int().min(1024).default(256 * 1024),
    /**
     * Networks the server may dial `/ws/register` and `/ws/agent` from. Empty means no
     * restriction. The local web UI on the same port is deliberately not covered: it is
     * where an operator registers the agent, and a list holding only the server's address
     * would shut them out of it.
     */
    allowedNetworks: blockOrMissing(z.array(Ipv4OrCidrSchema).default([])),
    /**
     * The port the local web server listens on. Coerced, because `PBCM_CLIENT_PORT` is laid
     * over this field as a string. A value that is not a port is refused rather than
     * silently replaced by the default: an agent listening somewhere other than where its
     * operator put it is the harder fault to find. Port 0 -- "any free port" to Node -- is
     * never what this setting means, and the minimum rules it out.
     */
    listenPort: z.coerce
        .number({ error: "Must be an integer between 1 and 65535" })
        .int({ error: "Must be an integer between 1 and 65535" })
        .min(1)
        .max(65535)
        .default(DEFAULT_AGENT_PORT),
    /**
     * Accept a PBCM server certificate that does not validate, for registration and for the
     * WebSocket alike. Off by default: that WebSocket carries the auth token, and a
     * certificate nobody checks is one anybody in between can present. The PBS certificate
     * is a different matter and handled by the fingerprint, not by this.
     */
    allowSelfSignedCertificates: z.boolean().default(false),
    /**
     * Serve the agent's own web server over TLS. Absent means plain HTTP. The other half of
     * `allowSelfSignedCertificates`: that one is about the certificate this agent checks
     * when it dials the server, this one about the certificate it presents when the server
     * dials it.
     */
    tls: blockOrMissing(AgentTlsConfigSchema.optional()),
    /**
     * Serve the status page at `/status`, with the endpoints only it calls. On by default,
     * which is how the agent behaved before the setting existed.
     */
    enableStatusPage: blockOrMissing(z.boolean().default(true)),
    /**
     * Serve the register page at `/register` and the `/api/register` endpoint behind it,
     * for as long as the agent is unregistered -- both close once it has an identity. Worth
     * switching off for an agent the server registers (outbound): that endpoint decides
     * which server the agent obeys, and the setup PIN is the only thing guarding it.
     */
    enableRegisterPage: blockOrMissing(z.boolean().default(true)),
});

export type AgentConfigParsed = z.output<typeof AgentConfigSchema>;

/** The identity the server issues at registration, as the agent stores it. */
export const AgentIdentitySchema = z.object({
    clientId: z.string().min(1),
    authToken: z.string().min(1),
});

export const ClientSchema = z.object({
    id: z.uuid(),
    hostname: z.string(),
    displayName: z.string().optional(),
    status: z.enum(CLIENT_STATUS),
    lastSeen: z.string(),
    version: z.string().optional(),
    connectionMode: z.enum(CONNECTION_MODE).optional(),
    outboundTargetAddress: z.string().optional(),
    /**
     * Inbound clients only: the address or network their connections must come from.
     * Editable, because a client that moves is otherwise locked out with no way back --
     * the agent cannot argue its own case, only the operator can.
     *
     * `null` switches the check off, and the three states are distinct on the wire: a
     * value restricts, `null` disables, and an absent key in a PUT leaves the stored
     * setting untouched.
     */
    inboundAllowedIp: Ipv4OrCidrSchema.nullish(),
    /**
     * The address of the last successful agent connect -- successful, because it is written
     * only once the check against `inboundAllowedIp` has passed. A rejected connect leaves it
     * alone, so an agent that has moved still shows its old address here. Nothing decides on
     * it; it is here so the editor can show what `inboundAllowedIp` is about to be measured
     * against. DIM calls the same thing `inboundLastIp`.
     */
    ipAddress: z.string().optional(),
    /**
     * Whether SSH credentials are stored for this client, so its jobs and restores may
     * choose the tunnel. Independent of `connectionMode`: the tunnel is a route to the
     * PBS, the mode is who dials the WebSocket, every combination of the two is valid,
     * and unlike the mode this one can be set up and removed at any time.
     */
    tunnelConfigured: z.boolean().optional(),
    /**
     * The IANA time zone the agent reported on its last connect. The first run of a job is
     * the point in time entered in the browser; every repetition after it keeps the agent's
     * clock time in this zone. `null` for an agent that has not connected yet or predates
     * the field. Observed, never set.
     */
    timezone: z.string().nullish(),
});

/**
 * Where the server dials an outbound agent, as `host:port`. Transformed rather than only
 * checked, so what reaches the database is the normalised form: the value is interpolated
 * into a `ws://` URL, and a scheme, path or credentials in it would quietly send the agent
 * connection elsewhere.
 */
export const TargetAddressSchema = z
    .string()
    .transform((value) => normaliseTargetAddress(value))
    .refine((address): address is string => address !== null, {
        error: "Must be a host or host:port, without scheme, path or credentials",
    });

/**
 * `PUT /api/v1/clients/:clientId` -- what the client editor may change. Every key is
 * optional, and an absent one leaves the stored value alone. Which of the two addresses a
 * client has at all follows from its connection mode; the controller decides that against
 * the stored row, which a schema cannot see.
 */
export const ClientUpdateSchema = z.object({
    displayName: ClientSchema.shape.displayName,
    outboundTargetAddress: TargetAddressSchema.optional(),
    inboundAllowedIp: ClientSchema.shape.inboundAllowedIp,
});

/** `POST /api/v1/clients/outbound`. */
export const CreateOutboundClientSchema = z.object({
    outboundTargetAddress: TargetAddressSchema,
    /**
     * What the server presents on the agent's `/ws/register`: the setup PIN from the agent's
     * log, or the agent's `PBCM_REGISTRATION_SECRET`. The agent tells the two apart itself.
     */
    registrationSecret: z.string().min(1),
    hostname: z.string().optional(),
});

/**
 * Whether a run reaches its repository through the SSH reverse tunnel.
 *
 * A property of the run, chosen per backup job and per restore: one client can back up to
 * a PBS it reaches directly and to another it only reaches through the tunnel. The client
 * side of it is just the SSH credentials — stored means available, and a job or restore
 * that asks for a tunnel the client has none for is rejected when it is saved or started.
 *
 * Travelling with the job is what keeps it honest: the agent stores it in the job's
 * config and there is no second copy anywhere to fall out of step with. A restore has no
 * stored config, so it carries the answer in the request that triggers it.
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

/**
 * `POST /api/v1/clients/:clientId/tunnel`. Everything is required: there is no
 * half-configured tunnel worth storing.
 */
export const TunnelCreateSchema = TunnelConfigSchema;

/**
 * `PUT /api/v1/clients/:clientId/tunnel`. Every field optional -- the repository builds
 * its UPDATE from the keys that are present, so an absent one means "leave it alone".
 *
 * `passphrase` is the exception that has to be spelled out: `null` is a value here, not a
 * missing field. It is how a key that no longer has a passphrase gets its stored one
 * cleared, and `.partial()` alone would not allow it through.
 */
export const TunnelUpdateSchema = TunnelConfigSchema.partial().extend({
    passphrase: z.string().nullable().optional(),
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

/*
 * The values below reach `proxmox-backup-client` as positional arguments. No shell is
 * involved, but a value starting with `-` would be read as an option -- a snapshot of
 * `--repository=...` sends the restore somewhere else. So each is held to the form the CLI
 * expects, which never starts with one.
 */

/** An archive name as the PBS accepts it: `root`, `etc`, `catalog.pcat1`. */
const ARCHIVE_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const ArchiveNameSchema = z.string().regex(ARCHIVE_NAME, {
    error: "Archive names may contain letters, digits, _ . - and must not start with . or -",
});

/** A path on the client. Always absolute: the file browser only ever hands out those. */
const AbsolutePathSchema = z.string().startsWith("/", { error: "Paths must be absolute" });

/** `<type>/<backup-id>/<time>`, the form the PBS names a snapshot by (see runSnapshotPath). */
const SNAPSHOT_PATH = /^(host|vm|ct)\/[A-Za-z0-9_][A-Za-z0-9_.-]*\/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const SnapshotPathSchema = z.string().regex(SNAPSHOT_PATH, {
    error: "Snapshot must be <type>/<id>/<YYYY-MM-DDTHH:MM:SSZ>",
});

export const ArchiveSchema = z.object({
    path: AbsolutePathSchema,
    name: ArchiveNameSchema,
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
    // Passed to `proxmox-backup-client` as one `--exclude` each. The CLI applies every
    // pattern to every archive of the run, relative to that archive's root, so they
    // belong to the job and not to a single archive. Defaulted so that a job stored
    // before exclusions existed still parses.
    excludes: z.array(z.string().trim().min(1)).default([]),
    repository: RepositorySchema,
    encryption: EncryptionConfigSchema.optional(),
    tunnel: TunnelModeSchema.optional(),
});

export const RestoreJobSchema = JobSchema.extend({
    snapshot: SnapshotPathSchema,
    targetPath: AbsolutePathSchema,
    archives: z.array(ArchiveNameSchema),
    repository: RepositorySchema,
    encryption: EncryptionConfigSchema.optional(),
    tunnel: TunnelModeSchema.optional(),
});

/**
 * What the browser sends to start a restore (`POST /api/v1/clients/:clientId/restore`).
 * The repository is named, not described: the server builds it from the managed
 * repository, secret included, which the browser never sees.
 */
export const RestoreRequestSchema = RestoreJobSchema.pick({
    snapshot: true,
    targetPath: true,
    archives: true,
    encryption: true,
    tunnel: true,
}).extend({
    repositoryId: z.string().min(1),
});

/**
 * What an agent sends to `POST /api/v1/register`. It brings no identity of its own:
 * the server issues both `clientId` and `authToken` and returns them below.
 */
export const RegistrationPayloadSchema = z.object({
    token: z.string(),
    hostname: z.string().optional(),
});

/**
 * The identity the server issues. The agent stores both values together -- one without
 * the other is useless, because every later connection is checked as a pair.
 */
export const RegistrationResponseSchema = z.object({
    token: z.string(),
    clientId: z.string(),
});

/** A registration token as the list shows it: by its hash, never the token itself. */
export const TokenSchema = z.object({
    /** SHA-256 of the token, hex. Also what `DELETE /api/v1/tokens/:tokenHash` takes. */
    tokenHash: z.string(),
    createdAt: z.string(),
    expiresAt: z.string(),
    /** Null for a token nobody has redeemed yet. */
    usedAt: z.string().nullish(),
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

/**
 * `POST /api/v1/tokens`: the one response that carries the token in the clear. The server
 * stores only its hash, so this is the only time it can be shown.
 */
export const CreatedTokenSchema = z.object({
    token: z.string(),
    expiresAt: z.string(),
    displayName: z.string().optional(),
    allowedIp: z.string().optional(),
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

/**
 * What a backup run left on the PBS, as the agent read it back with `snapshot list` right
 * after the run. Stored with the run, so it outlives a prune of the snapshot itself.
 *
 * Deliberately without `verification`: that is set by a verify job hours later, and a copy
 * taken when the run ended would say nothing about it.
 */
export const RunSnapshotDetailsSchema = z.object({
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
    fingerprint: z.string().optional(),
    protected: z.boolean().optional(),
});

/**
 * The snapshot fields a run carries -- on the wire from the agent, in its history and in
 * the server's. All optional: an agent of an older build sends none of them, and a
 * required field would make the server drop its whole SYNC_HISTORY payload.
 *
 * - `snapshot`: `host/<clientId>/<time>`, fixed by the agent before the run starts.
 * - `snapshotDetails`: what the PBS reported for it once the run had ended.
 * - `snapshotError`: why there are no details, although the backup itself succeeded.
 */
const runSnapshotFields = {
    snapshot: z.string().nullable().optional(),
    snapshotDetails: RunSnapshotDetailsSchema.nullable().optional(),
    snapshotError: z.string().nullable().optional(),
};

// WS Payloads schemas

export const AuthPayloadSchema = z.object({
    hostname: z.string(),
    version: z.string().optional(),
    /**
     * The IANA time zone of the agent process (`TZ`, UTC in a container without it). The
     * scheduler repeats a job in this zone; the server stores it only to show it next to the
     * schedule. Absent from agents that predate the field.
     */
    timezone: z.string().optional(),
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
    /**
     * A step of a run that is still `running` but no longer in the CLI -- today only
     * `snapshot`, the query for the snapshot details after a backup. The final update
     * sends it as null, so a receiver that merges updates does not keep the old value.
     */
    phase: z.enum([JOB_PHASE.SNAPSHOT]).nullable().optional(),
    ...runSnapshotFields,
});

export const LogUpdatePayloadSchema = z.object({
    jobId: z.string(),
    output: z.string(),
    stream: z.enum(["stdout", "stderr"]),
});

export const RestoreSnapshotPayloadSchema = z.object({
    runId: z.string(),
    snapshot: SnapshotPathSchema,
    targetPath: AbsolutePathSchema,
    repository: RepositorySchema,
    archives: z.array(ArchiveNameSchema),
    encryption: EncryptionConfigSchema.optional(),
    // Must be declared here even though it is optional: zod strips unknown keys, so a
    // missing entry would silently leave every tunnelled restore going direct. Absent
    // means direct, which is also what a client without credentials always gets.
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

/**
 * Asks the agent to end a run that is under way -- a backup, a restore, or a backup
 * waiting in the job's queue. A request with an answer rather than a push: whether the
 * run could still be stopped is something only the agent knows, and the dashboard says it.
 */
export const AbortRunRequestSchema = z.object({
    requestId: z.string(),
    runId: z.string(),
});

/**
 * `success` says the run was told to stop, not that it has: it ends through its own
 * `STATUS_UPDATE`, as `abort`. `error` names why there was nothing to stop.
 */
export const AbortRunResponseSchema = z.object({
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
    /**
     * The agent's revision of this row, raised on every change to it. Echoed back in
     * HISTORY_ACK, so the agent can tell which version the server stored. Optional: an
     * agent of an older build sends none and is synced the old way.
     */
    revision: z.number().int().optional(),
    ...runSnapshotFields,
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
    ...runSnapshotFields,
});

export const SyncHistoryPayloadSchema = z.object({
    history: z.array(HistoryEntrySchema),
});

/**
 * The server's answer to SYNC_HISTORY: the rows it stored, each at the revision it
 * stored. The agent keeps offering a row until it has an ack for its current revision.
 */
export const HistoryAckEntrySchema = z.object({
    id: z.string(),
    revision: z.number().int(),
});

export const HistoryAckSchema = z.object({
    entries: z.array(HistoryAckEntrySchema),
});

export const JobNextRunUpdatePayloadSchema = z.object({
    jobId: z.string(),
    nextRunAt: z.string().nullable(),
});

// Outbound connection mode: the server dials the client and registers itself.

export const RegistrationRequestSchema = z.object({
    secret: z.string().min(1),
    authToken: z.string().min(1),
    /** The identity the server assigned this client -- the outbound counterpart of
     *  RegistrationResponseSchema. */
    clientId: z.string().min(1),
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

// REST request bodies
//
// These describe what the HTTP endpoints accept, and they exist for the same reason the
// WS payload schemas above do: an unchecked body reaches a repository or the config file
// unaltered. They stay here rather than in the backend because the frontend builds these
// same shapes and can derive its types from them.

/** `POST /api/login`. Both empty is a malformed request, not a failed login. */
export const LoginPayloadSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
});

/**
 * `POST /api/v1/users`.
 *
 * `password` is optional at this level because an OIDC-only user has none; that a *local*
 * user must have one is a rule the controller enforces, not a property of the shape.
 */
export const CreateUserSchema = z.object({
    username: z.string().trim().min(1).max(100),
    password: z.string().min(1).optional(),
    auth_methods: z.string().min(1).optional(),
});

/** `PUT /api/v1/users/:userId`. Both fields optional: either one alone is a valid edit. */
export const UpdateUserSchema = z.object({
    password: z.string().min(1).optional(),
    auth_methods: z.string().min(1).optional(),
});

/**
 * A numeric setting as the settings UI sends it: a count of days, entries or hours. Still
 * named after the retention values it was written for; the cleanup intervals share it.
 */
const RetentionValueSchema = z
    .string()
    .regex(/^\d+$/, "Settings values must be whole numbers");

/**
 * `PUT /api/v1/settings/cleanup`.
 *
 * Deliberately loose. `AppConfig.settings` carries an index signature, and the settings
 * page reads the whole object and sends it back unchanged — so a key an operator added to
 * `config.yaml` by hand travels through this endpoint on every save. A strict schema would
 * strip it, and the next save from the UI would silently delete it from the file.
 *
 * What is checked is what the UI writes and what has consequences: the retention values
 * must be numbers, and `security` decides which networks may register a client.
 */
export const CleanupSettingsSchema = z.looseObject({
    token_retention_days: RetentionValueSchema.optional(),
    token_cleanup_interval_hours: RetentionValueSchema.optional(),
    retention_job_history_days: RetentionValueSchema.optional(),
    retention_job_history_count: RetentionValueSchema.optional(),
    job_history_cleanup_interval_hours: RetentionValueSchema.optional(),
    security: z
        .object({
            allowed_networks: z.array(z.string()).optional(),
        })
        .optional(),
});

/**
 * `GET /api/v1/history`.
 *
 * Coerced because query strings arrive as text. The bounds are the point: `parseInt` used
 * to pass `NaN` straight to a SQLite binding, and a negative LIMIT means *no* limit in
 * SQLite -- so `?limit=-1` returned the entire history table.
 */
export const HistoryQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(1000).default(100),
    offset: z.coerce.number().int().min(0).default(0),
    /** Only the runs in this status. An unknown one is refused rather than matching nothing. */
    status: z.enum(JOB_STATUS).optional(),
    /** Only the runs of this client. */
    clientId: z.string().min(1).optional(),
    /**
     * Only the runs this text occurs in: the job's name or id, the run's id, or the
     * client's hostname or display name. Bounded, as it ends up in a LIKE pattern.
     */
    search: z.string().trim().min(1).max(200).optional(),
    /**
     * `true`: only the runs the session's user has yet to mark as seen. Spelled out
     * rather than coerced -- `z.coerce.boolean()` reads the text "false" as true.
     */
    unseen: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .optional(),
});

/**
 * Query of `GET /api/v1/repositories/:repositoryId/snapshots`. With `backupId` the answer
 * holds that backup id's snapshots only -- a client's page asks for its own instead of
 * taking every client's and dropping the rest in the browser.
 */
export const SnapshotQuerySchema = z.object({
    backupId: z.string().min(1).optional(),
});

/**
 * What one user has yet to mark as seen. `seenAt` is the mark below which everything counts
 * as seen -- set when the user was created and raised by "mark all" -- and the two counts
 * are the failed and the missed runs that ended after it and were not marked one by one.
 * Null only for a session whose user has no mark, which then counts every run.
 */
export const HistorySeenSchema = z.object({
    seenAt: z.string().nullable(),
    unseenFailed: z.number().int().min(0),
    unseenMissed: z.number().int().min(0),
});

/**
 * One snapshot as the Proxmox Backup Server API returns it.
 *
 * Separate from `SnapshotSchema` on purpose: PBS speaks kebab-case over the wire and this
 * application speaks camelCase. Keeping both means the translation in
 * `RepositoryController.listSnapshots` stays visible instead of hiding inside one schema
 * that would have to accept either spelling.
 */
export const PbsSnapshotSchema = z.looseObject({
    "backup-type": z.string(),
    "backup-id": z.string(),
    "backup-time": z.number(),
    files: z
        .array(
            z.looseObject({
                filename: z.string(),
                "crypt-mode": z.string().optional(),
                size: z.number().optional(),
            }),
        )
        .default([]),
    size: z.number().optional(),
    owner: z.string().optional(),
    comment: z.string().optional(),
    fingerprint: z.string().optional(),
    protected: z.boolean().optional(),
});

/** The envelope PBS wraps every list response in. */
export const PbsSnapshotListSchema = z.object({
    data: z.array(PbsSnapshotSchema),
});

// ---------------------------------------------------------------------------
// Server configuration (config.yaml)
// ---------------------------------------------------------------------------

/**
 * The SSH reverse tunnel settings block.
 *
 * Every default lives here rather than in a separate constant on the server, so the
 * fallback and the validity rule for a field cannot drift apart. The bounds are not
 * decoration: `maxConcurrentTunnels: 0` would refuse every backup, and a
 * `minRequestIntervalMs` of 0 would remove the rate limit on lease requests entirely.
 */
export const TunnelSettingsSchema = z.object({
    enabled: z.boolean().default(true),
    /** Never 0.0.0.0: that would need GatewayPorts on the client host. */
    remoteBindHost: z.string().min(1).default("127.0.0.1"),
    connectTimeoutMs: z.number().int().positive().default(10000),
    keepaliveIntervalMs: z.number().int().positive().default(15000),
    idleGraceMs: z.number().int().nonnegative().default(60000),
    maxLeaseMs: z.number().int().positive().default(86400000),
    acquireTimeoutMs: z.number().int().positive().default(20000),
    maxConcurrentTunnels: z.number().int().min(1).default(20),
    retryDelaysMs: z.array(z.number().int().nonnegative()).default([2000, 5000, 10000]),
    minRequestIntervalMs: z.number().int().nonnegative().default(3000),
});

/**
 * A numeric setting as config.yaml may hold it. `retention_job_history_days: 60` without
 * quotes is a number to the YAML parser and was accepted before these keys had defaults
 * here (see SettingsService.getSetting); refusing to start over it would break a working
 * installation, so a whole number is taken and written back as text.
 */
const StoredSettingValueSchema = z.preprocess(
    (value) => (typeof value === "number" ? String(value) : value),
    RetentionValueSchema,
);

/**
 * The settings block: retention values and cleanup intervals. Loose for the same reason
 * `CleanupSettingsSchema` is: the settings page reads this object whole and writes it back,
 * so a key an operator added by hand has to survive the round trip.
 */
export const AppSettingsSchema = z.looseObject({
    token_retention_days: StoredSettingValueSchema.default("30"),
    token_cleanup_interval_hours: StoredSettingValueSchema.default("24"),
    retention_job_history_days: StoredSettingValueSchema.default("90"),
    retention_job_history_count: StoredSettingValueSchema.default("50"),
    job_history_cleanup_interval_hours: StoredSettingValueSchema.default("24"),
});

export const OidcConfigSchema = z
    .looseObject({
        enabled: z.boolean().default(false),
        issuer: z.string().nullish(),
        client_id: z.string().nullish(),
        client_secret: z.string().nullish(),
        redirect_uri: z.string().nullish(),
    })
    // The example config ships the block with empty fields and `enabled: false`, so the
    // fields are only required -- and checked -- once the block is switched on. Requiring
    // them always made a server started from that example refuse to start.
    .superRefine((oidc, ctx) => {
        if (!oidc.enabled) return;
        for (const key of ["issuer", "redirect_uri"] as const) {
            if (!z.url().safeParse(oidc[key]).success) {
                ctx.addIssue({
                    code: "custom",
                    path: [key],
                    message: "Required as a URL while oidc.enabled is true",
                });
            }
        }
        for (const key of ["client_id", "client_secret"] as const) {
            if (!oidc[key]) {
                ctx.addIssue({
                    code: "custom",
                    path: [key],
                    message: "Required while oidc.enabled is true",
                });
            }
        }
    });

/**
 * The whole of `config.yaml`.
 *
 * Loose at the top level on purpose. `AppConfig.saveConfig()` writes the parsed object
 * back into the YAML document, so a strict schema would not merely ignore a key an
 * operator added by hand — it would delete it from their file on the next save.
 *
 * `jwtSecret` and `secretKey` are required even though a fresh installation has neither: the
 * server generates both and writes them back *before* this schema is applied, so by the time
 * anything is validated the values always exist. Requiring them here turns a secret that
 * somehow went missing into a startup error rather than a server signing tokens with
 * `undefined`.
 */
export const AppConfigSchema = z.looseObject({
    jwtSecret: z.string().min(1),
    /**
     * Encrypts every secret the server stores and has to read back: SSH keys of the tunnels,
     * PBS token secrets of the repositories, auth tokens of outbound clients. Separate from
     * `jwtSecret`, so that rotating the session key does not make them unreadable.
     */
    secretKey: z.string().min(1),
    /**
     * Any span @fastify/jwt accepts. Defaulted rather than optional: without a value the
     * server signed tokens that never expired, so a leaked one stayed valid forever.
     */
    jwtExpiresIn: z.string().min(1).default("12h"),
    logLevel: z.string().min(1).optional(),
    /**
     * Optional like `logLevel`, and for the same reason: left out it stays DEFAULT_SERVER_PORT,
     * and nothing writes the number into a file the operator never put it in.
     */
    port: z.number().int().min(1).max(65535).optional(),
    oidc: blockOrMissing(OidcConfigSchema.optional()),
    settings: AppSettingsSchema.default({
        token_retention_days: "30",
        token_cleanup_interval_hours: "24",
        retention_job_history_days: "90",
        retention_job_history_count: "50",
        job_history_cleanup_interval_hours: "24",
    }),
    security: z
        .object({
            /**
             * Empty means no restriction — an unset perimeter, not a closed one. Validated
             * against the same shape a client's own pin uses, so an unusable value is
             * caught at startup instead of silently rejecting every agent.
             */
            allowed_networks: z.array(Ipv4OrCidrSchema).default([]),
            /**
             * The reverse proxies whose X-Forwarded-For/-Proto/-Host this server believes.
             *
             * Empty by default, which means no one's: the client address is the socket's
             * peer and the scheme is the connection's own. Trusting every peer, as this
             * server used to, let anyone who reaches the port directly choose the address
             * that the login rate limit, `allowed_networks` and a client's
             * `inbound_allowed_ip` are checked against. Behind a proxy, its address has to
             * be listed here — otherwise every request appears to come from the proxy.
             */
            trusted_proxies: z.array(TrustedProxySchema).default([]),
            /**
             * Whether to send Strict-Transport-Security.
             *
             * Off by default, unlike helmet's own setting. A large share of installations
             * run on plain HTTP inside a home network, and that header tells the browser
             * to refuse http:// for this host from then on — remembered for months, and
             * not undone by turning the header off again. Only switch it on behind TLS.
             */
            hsts: z.boolean().default(false),
            /**
             * Whether an outbound agent dialled over `wss://` may present a certificate
             * this server cannot verify. Off by default, so a wrong or expired certificate
             * is a failed connection rather than a silent one.
             *
             * It exists because an agent on a home network usually carries a self-signed
             * certificate, and the alternative -- running a CA for a handful of hosts --
             * is more than that situation warrants. Mirrors `allowSelfSignedCertificates`
             * on the agent, the same decision for the other direction of the same link.
             */
            allow_self_signed_agent_certificates: z.boolean().default(false),
        })
        // Spelled out rather than left to the field defaults: `.default()` hands this
        // object back as it stands, so a key missing here is missing at runtime.
        .default({
            allowed_networks: [],
            trusted_proxies: [],
            hsts: false,
            allow_self_signed_agent_certificates: false,
        }),
    tunnel: TunnelSettingsSchema.default(TunnelSettingsSchema.parse({})),
});

export type AppConfigInput = z.input<typeof AppConfigSchema>;
export type AppConfigParsed = z.output<typeof AppConfigSchema>;

// ── Webhooks, REST ───────────────────────────────────────────────────────────

/** RFC 9110 token characters: what a header name may consist of. */
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/**
 * `POST /api/v1/webhooks` and `PUT /api/v1/webhooks/:id`. The body template stays a string:
 * it is stored as the operator wrote it, indentation included, and only checked here -- see
 * webhookTemplate.ts for what it may contain.
 */
export const WebhookInputSchema = z.object({
    name: z.string().trim().min(1, "A name is required").max(100),
    enabled: z.boolean().default(true),
    url: z
        .string()
        .trim()
        .regex(/^https?:\/\/\S+$/i, "Must be an http:// or https:// URL")
        .refine((url) => placeholderError(url) === null, {
            error: (issue) => placeholderError(issue.input) ?? "Invalid placeholder",
        }),
    method: z.enum(WEBHOOK_METHODS).default("POST"),
    headers: z
        .record(z.string().regex(HEADER_NAME, "Not a valid header name"), z.string())
        .default({})
        .refine((headers) => placeholderError(Object.values(headers)) === null, {
            error: (issue) => placeholderError(Object.values(issue.input as object)) ?? "Invalid placeholder",
        }),
    bodyTemplate: z
        .string()
        .min(1, "A body template is required")
        .max(65536, "A body template may be at most 64 KiB")
        .refine((source) => webhookTemplateError(source) === null, {
            error: (issue) => webhookTemplateError(issue.input as string) ?? "Invalid template",
        }),
    minLevel: z.enum(WEBHOOK_LEVELS).default("warning"),
    /** Kind patterns such as `job.*`; empty means every kind. */
    kinds: z.array(z.string().trim().min(1)).default([]),
    timeoutMs: z.number().int().min(1000).max(60000).default(10000),
});

/** A webhook as the API returns it: what was configured, and how its last delivery went. */
export const WebhookSchema = WebhookInputSchema.extend({
    id: z.string(),
    /** The HTTP status of the last attempt; null when it never got an answer. */
    lastStatus: z.number().nullable(),
    lastError: z.string().nullable(),
    lastAttemptAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string().nullable(),
});

// ── What the server sends a browser ──────────────────────────────────────────
//
// The schemas above this line guard what comes *in*: a request body, an agent's message.
// The ones below describe what goes *out* to the dashboard, and they are looser on purpose.
// A response is checked for its shape, not for the rules an operator's input has to meet --
// a job stored by an older agent may carry an archive name today's editor would refuse, and
// rejecting it here would take the whole list off the screen with it.

/** Tunnel runtime state as broadcast to the dashboard (never persisted). */
export const TunnelStateSchema = z.object({
    clientId: z.string(),
    status: z.enum(TUNNEL_STATUS),
    activeLeases: z.number(),
    forwards: z.array(z.object({ target: z.string(), port: z.number() })),
    lastUsedAt: z.string().nullish(),
    lastError: z.string().nullish(),
});

/**
 * A client as `GET /api/v1/clients` and `CLIENTS_UPDATE` carry it. Not `ClientSchema`:
 * that one is what `PUT /clients/:id` accepts, while this is a row read out of SQLite --
 * every column that is nullable there arrives as `null`, not as a missing key.
 */
export const ClientViewSchema = ClientSchema.extend({
    id: z.string(),
    /** Empty for a row without one; the column is nullable, a registered client never is. */
    hostname: z.string(),
    displayName: z.string().nullish(),
    /** Null until the agent has connected once. */
    lastSeen: z.string().nullable(),
    version: z.string().nullish(),
    outboundTargetAddress: z.string().nullish(),
    inboundAllowedIp: z.string().nullish(),
    ipAddress: z.string().nullish(),
    /** Runtime tunnel state, present when SSH credentials are stored. Never persisted. */
    tunnel: TunnelStateSchema.optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().nullish(),
});

/**
 * A backup job as a browser receives it -- `GET /jobs`, `GET /clients/:id/jobs` and
 * `JOBS_UPDATE`. The shape of `BackupJobSchema` without its input rules, see above.
 */
export const BackupJobViewSchema = z.object({
    id: z.string().nullable(),
    name: z.string(),
    schedule: z
        .object({
            interval: z.number(),
            unit: z.enum(["seconds", "minutes", "hours", "days", "weeks"]),
            weekdays: z.array(z.string()).default([]),
        })
        .nullable(),
    scheduleEnabled: z.coerce.boolean(),
    createdAt: z.string().optional(),
    nextRunAt: z.string().optional(),
    lastRunAt: z.string().optional(),
    archives: z.array(z.object({ path: z.string(), name: z.string() })),
    excludes: z.array(z.string()).default([]),
    repository: z.object({
        repositoryId: z.string().optional(),
        baseUrl: z.string(),
        datastore: z.string(),
        fingerprint: z.string().optional(),
        username: z.string(),
        tokenname: z.string().optional(),
        /** Always empty: a job reaches a browser without its secret (see JobSecrets). */
        secret: z.string(),
    }),
    encryption: EncryptionConfigSchema.optional(),
    tunnel: TunnelModeSchema.optional(),
});

/** What every scheduler reports as the result of a run. */
const SchedulerRunResultSchema = z.object({ removed: z.number() });

/** One scheduler's state; `SchedulerStatus` in types.ts is the same shape, per scheduler. */
export const SchedulerStatusSchema = z.object({
    isRunning: z.boolean(),
    nextRun: z.string().nullable(),
    lastRun: z
        .object({
            trigger: z.enum(SCHEDULER_TRIGGERS),
            status: z.enum(SCHEDULER_RUN_STATUSES),
            startedAt: z.string(),
            finishedAt: z.string().nullable(),
            result: SchedulerRunResultSchema.nullable(),
            error: z.string().nullable(),
        })
        .nullable(),
});

/** The payload of `SCHEDULER_STATUS_UPDATE`: one scheduler, whenever a run starts or ends. */
export const SchedulerStatusUpdateSchema = z.object({
    scheduler: z.enum(SCHEDULER_IDS),
    status: SchedulerStatusSchema,
});
