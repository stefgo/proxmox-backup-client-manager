import { z } from "zod";
import { REPOSITORY_STATUS, SCHEDULER_IDS } from "./constants.js";
import {
    BackupJobViewSchema,
    ClientViewSchema,
    FsFileSchema,
    GlobalHistoryEntrySchema,
    HistoryEntrySchema,
    SchedulerStatusSchema,
    SnapshotSchema,
    TokenSchema,
    WebhookSchema,
} from "./schemas.js";

/**
 * What the REST endpoints answer with, one schema per shape.
 *
 * The frontend parses every response against one of these (`lib/api.ts`), and the
 * controllers name the same types as what they return -- so a field renamed on one side
 * fails the other's build instead of arriving as `undefined`.
 *
 * Nullability follows what the server sends, which for a row read out of SQLite is `null`
 * and not a missing key.
 */

// ── Clients, jobs, history ───────────────────────────────────────────────────

/** `GET /api/v1/clients`. */
export const ClientListSchema = z.array(ClientViewSchema);

/** `POST /api/v1/clients/:clientId/reconnect`: whether the dial reached the agent. */
export const ReconnectResultSchema = z.object({ connected: z.boolean() });

/** `GET /api/v1/clients/:clientId/jobs`. */
export const ClientJobListSchema = z.array(BackupJobViewSchema);

/** `GET /api/v1/jobs`: every connected client's cached jobs. */
export const GlobalJobListSchema = z.array(
    z.object({ clientId: z.string(), jobs: z.array(BackupJobViewSchema) }),
);

/** `GET /api/v1/clients/:clientId/history`, as the agent reports it. */
export const ClientHistorySchema = z.array(HistoryEntrySchema);

/** `GET /api/v1/history` and `GET /api/v1/history/latest`. */
export const GlobalHistorySchema = z.array(GlobalHistoryEntrySchema);

/** `GET /api/v1/clients/:clientId/fs`. */
export const FsFileListSchema = z.array(FsFileSchema);

/** `POST /api/v1/clients/:clientId/key`: the encryption key the agent generated. */
export const GeneratedEncryptionKeySchema = z.object({
    keyContent: z.string().optional(),
});

// ── Tunnel ───────────────────────────────────────────────────────────────────

/** `GET /api/v1/clients/:clientId/tunnel`. The private key is write-only and never part of this. */
export const TunnelInfoSchema = z.object({
    sshHost: z.string(),
    sshPort: z.number(),
    sshUser: z.string(),
    hostKeySha256: z.string(),
    remoteBindHost: z.string(),
});

/**
 * `POST /api/v1/tunnel/test` and `.../clients/:clientId/tunnel/test`. A failed test is
 * still a 200: the test ran, and `ok` says how it went.
 */
export const TunnelTestResultSchema = z.object({
    ok: z.boolean(),
    /** The key the host presented, also on a mismatch -- what lets the editor offer to re-pin. */
    hostKeySha256: z.string().optional(),
    boundPort: z.number().optional(),
    error: z.string().optional(),
});

/** `POST /api/v1/tunnel/keypair`: the one moment a private key travels to the browser. */
export const GeneratedKeyPairSchema = z.object({
    type: z.string(),
    privateKey: z.string(),
    publicKey: z.string(),
});

/** `POST /api/v1/tunnel/pubkey`. */
export const DerivedPublicKeySchema = z.object({
    type: z.string(),
    publicKey: z.string(),
});

// ── Repositories ─────────────────────────────────────────────────────────────

/**
 * A repository as `GET /api/v1/repositories` returns it: without the secret, which is
 * written but never read back (see RepositoryController.list).
 */
export const ManagedRepositorySchema = z.object({
    id: z.union([z.string(), z.number()]),
    repositoryId: z.string().optional(),
    baseUrl: z.string(),
    datastore: z.string(),
    fingerprint: z.string().nullish(),
    username: z.string(),
    tokenname: z.string().nullish(),
    status: z.enum(REPOSITORY_STATUS),
    /** Last fingerprint a client reported for this repository. Informational only. */
    observed: z
        .object({
            fingerprint: z.string(),
            caValid: z.boolean(),
            clientId: z.string(),
            at: z.string(),
        })
        .optional(),
});

export const ManagedRepositoryListSchema = z.array(ManagedRepositorySchema);

/** `GET /api/v1/repositories/:repositoryId/status`. */
export const RepositoryStatusResponseSchema = z.object({
    status: z.enum(REPOSITORY_STATUS),
});

/** `GET /api/v1/repositories/:repositoryId/certificate`: the measured against the stored fingerprint. */
export const CertificateCheckSchema = z.object({
    storedFingerprint: z.string().nullable(),
    measuredFingerprint: z.string().nullable(),
    matches: z.boolean(),
    caValid: z.boolean(),
    reachable: z.boolean(),
    notAfter: z.string().nullable(),
    error: z.string().nullable(),
});

/** `POST /api/v1/repositories/:repositoryId/distribute`: which jobs took the new credentials. */
export const DistributeResultSchema = z.object({
    updated: z.array(z.object({ clientId: z.string(), jobId: z.string(), jobName: z.string() })),
    failed: z.array(z.object({ clientId: z.string(), jobId: z.string(), error: z.string() })),
    skippedOffline: z.array(z.object({ clientId: z.string(), hostname: z.string() })),
});

/** `GET /api/v1/repositories/:repositoryId/snapshots`. */
export const SnapshotListSchema = z.array(SnapshotSchema);

// ── Tokens, users, session ───────────────────────────────────────────────────

/** `GET /api/v1/tokens`. */
export const TokenListSchema = z.array(TokenSchema);

/** One row of `GET /api/v1/users`; the password hash is not among the columns. */
export const UserSchema = z.object({
    id: z.number(),
    username: z.string(),
    auth_methods: z.string().nullish(),
    created_at: z.string(),
    updated_at: z.string().nullish(),
});

export const UserListSchema = z.array(UserSchema);

/** `GET /api/v1/me`: who the session belongs to. */
export const SessionUserSchema = z.object({
    username: z.string().nullable(),
    id: z.number().nullable(),
});

/** `GET /api/auth/config`: which login the form offers. */
export const AuthConfigSchema = z.object({
    type: z.enum(["local", "oidc"]),
});

// ── Settings ─────────────────────────────────────────────────────────────────

/**
 * `GET /api/v1/settings/cleanup`: the settings block of config.yaml, as it stands. Loose,
 * like the file -- a value an operator wrote by hand is a number there and a string once
 * the UI has saved it.
 */
export const SettingsResponseSchema = z.record(z.string(), z.unknown());

/** `GET /api/v1/settings/scheduler-status`: every scheduler the server runs. */
export const SchedulerStatusResponseSchema = z.object({
    schedulers: z.object(
        Object.fromEntries(SCHEDULER_IDS.map((id) => [id, SchedulerStatusSchema])) as Record<
            (typeof SCHEDULER_IDS)[number],
            typeof SchedulerStatusSchema
        >,
    ),
});

/** `POST /api/v1/settings/cleanup/*`: what a manual cleanup removed. */
export const CleanupResultSchema = z.object({ removed: z.number() });

// ── Webhooks ─────────────────────────────────────────────────────────────────

/** `GET /api/v1/webhooks`. */
export const WebhookListSchema = z.array(WebhookSchema);

/** `POST /api/v1/webhooks/test`: one test delivery -- what was sent, and what came back. */
export const WebhookTestResultSchema = z.object({
    ok: z.boolean(),
    /** The target's HTTP status; null when nothing answered. */
    status: z.number().nullable(),
    error: z.string().nullable(),
    /** The body as rendered and sent. */
    body: z.unknown(),
    /** The start of what the target answered. */
    response: z.string().nullable(),
});

export type CertificateCheck = z.infer<typeof CertificateCheckSchema>;
export type DistributeResult = z.infer<typeof DistributeResultSchema>;
export type TunnelInfo = z.infer<typeof TunnelInfoSchema>;
export type TunnelTestResult = z.infer<typeof TunnelTestResultSchema>;
export type ManagedRepository = z.infer<typeof ManagedRepositorySchema>;
export type User = z.infer<typeof UserSchema>;
export type SessionUser = z.infer<typeof SessionUserSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;
export type WebhookTestResult = z.infer<typeof WebhookTestResultSchema>;
export type ReconnectResult = z.infer<typeof ReconnectResultSchema>;
export type CleanupResult = z.infer<typeof CleanupResultSchema>;
