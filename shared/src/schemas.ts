import { z } from 'zod';

export const RepositorySchema = z.object({
    baseUrl: z.string().url(),
    datastore: z.string().min(1),
    fingerprint: z.string().optional(),
    username: z.string().min(1),
    tokenname: z.string().optional(),
    secret: z.string()
});

export const ClientSchema = z.object({
    id: z.string().uuid(),
    hostname: z.string(),
    displayName: z.string().optional(),
    status: z.enum(['online', 'offline']),
    lastSeen: z.string()
});

export const ScheduleConfigSchema = z.object({
    interval: z.number().min(1),
    unit: z.enum(['seconds', 'minutes', 'hours', 'days', 'weeks']),
    weekdays: z.array(z.string())
});

export const ArchiveSchema = z.object({
    path: z.string().min(1),
    name: z.string().min(1)
});

export const EncryptionConfigSchema = z.object({
    enabled: z.boolean(),
    keyContent: z.string().optional()
});

export const JobSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    schedule: ScheduleConfigSchema.nullable(),
    scheduleEnabled: z.boolean(),
    createdAt: z.string().optional(),
    nextRunAt: z.string().optional(),
    lastRunAt: z.string().optional()
});

export const BackupJobSchema = JobSchema.extend({
    archives: z.array(ArchiveSchema),
    repository: RepositorySchema,
    encryption: EncryptionConfigSchema.optional()
});

export const RestoreJobSchema = JobSchema.extend({
    snapshot: z.string(),
    targetPath: z.string(),
    archives: z.array(z.string()),
    repository: RepositorySchema,
    encryption: EncryptionConfigSchema.optional()
});

export const RegistrationPayloadSchema = z.object({
    token: z.string(),
    clientId: z.string(),
    hostname: z.string().optional()
});

export const RegistrationResponseSchema = z.object({
    token: z.string(),
    clientId: z.string()
});
