import {
    upcomingRuns,
    type Archive,
    type BackupJob,
    type BackupJobSchema,
    type Repository,
    type ScheduleConfig,
} from '@pbcm/shared';
import type { z } from 'zod';
import { DraftFieldError, type FieldErrors, type FieldOf } from '../../../lib/entityForm';
import { toLocalDateInput, toLocalTimeInput } from '../../../utils';

/**
 * Everything a backup job consists of, as the editor holds it. UI state -- the open file
 * browser, the half-typed archive -- is not in here: it is not part of the job, so it
 * neither makes the form dirty nor is it asked about on the way out.
 */
export interface JobDraft {
    name: string;
    archives: Archive[];
    /** `--exclude` patterns, relative to each archive's root (see buildBackupArgs on the agent). */
    excludes: string[];
    repository: Repository | null;
    scheduleEnabled: boolean;
    /** As typed, so the field can be emptied on the way to another number. */
    interval: string;
    unit: ScheduleConfig['unit'];
    weekdays: string[];
    /** The first run, as the date and time inputs hold it: local, `YYYY-MM-DD` and `HH:MM`. */
    startDate: string;
    startTime: string;
    encryptionEnabled: boolean;
    /** Only a key generated in this form: the server never sends a stored one back. */
    keyContent: string | null;
    /**
     * The job was loaded with encryption on, so the agent holds its key. Saving without
     * `keyContent` keeps that key -- the server fills it in (see JobSecrets on the backend).
     */
    hasStoredKey: boolean;
    /**
     * Whether this job reaches its repository through the client's SSH reverse tunnel. Per
     * job, because a client can have one PBS it reaches directly and another only through
     * the detour.
     */
    tunnelRequired: boolean;
}

export type BackupJobInput = z.input<typeof BackupJobSchema>;

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** A new job: no schedule yet, and one that would start now, daily, once switched on. */
export function emptyJobDraft(now: Date): JobDraft {
    return {
        name: '',
        archives: [],
        excludes: [],
        repository: null,
        scheduleEnabled: false,
        interval: '1',
        unit: 'days',
        weekdays: [...WEEKDAYS],
        startDate: toLocalDateInput(now),
        startTime: toLocalTimeInput(now),
        encryptionEnabled: false,
        keyContent: null,
        hasStoredKey: false,
        tunnelRequired: false,
    };
}

/**
 * The draft of a stored job. The start shown is its next run; a job that has none -- its
 * schedule is off, or it never had one -- gets `now` as the date to start from.
 */
export function jobDraftFrom(job: BackupJob, now: Date): JobDraft {
    const start = job.schedule && job.nextRunAt ? new Date(job.nextRunAt) : now;
    const encrypted = !!job.encryption?.enabled;
    return {
        name: job.name,
        archives: job.archives || [],
        excludes: job.excludes || [],
        repository: job.repository || null,
        scheduleEnabled: !!job.schedule && !!job.scheduleEnabled,
        interval: String(job.schedule?.interval ?? 1),
        unit: job.schedule?.unit ?? 'days',
        weekdays: job.schedule?.weekdays ?? [...WEEKDAYS],
        startDate: toLocalDateInput(start),
        // A job without a schedule starts at midnight once it gets one, not at whatever
        // minute the editor happened to be opened.
        startTime: job.schedule ? toLocalTimeInput(start) : '00:00',
        encryptionEnabled: encrypted,
        keyContent: null,
        hasStoredKey: encrypted,
        tunnelRequired: !!job.tunnel?.required,
    };
}

/** The interval as a number, or what keeps it from being one. */
function intervalOf(draft: JobDraft): number | string {
    const text = draft.interval.trim();
    const interval = text === '' ? NaN : Number(text);
    if (!Number.isFinite(interval) || interval < 1) return 'At least 1.';
    if (!Number.isInteger(interval)) return 'A whole number.';
    return interval;
}

/** The first run as the two inputs hold it, read as local time -- the clock they show. */
function startOf(draft: JobDraft): Date | null {
    if (!draft.startDate || !draft.startTime) return null;
    const start = new Date(`${draft.startDate}T${draft.startTime}`);
    return Number.isNaN(start.getTime()) ? null : start;
}

/**
 * The next `count` runs the schedule in the draft leads to, for the preview below it. None
 * while the schedule is off or cannot be read yet -- the fields say why, the preview does
 * not have to.
 *
 * Calculated on the browser's clock, as the start is entered on it. The agent repeats on
 * its own, so the two agree only where both keep the same time zone.
 */
export function previewRuns(draft: JobDraft, now: Date, count: number): Date[] {
    const interval = intervalOf(draft);
    const start = startOf(draft);
    if (!draft.scheduleEnabled || typeof interval !== 'number' || !start) return [];
    return upcomingRuns({ interval, unit: draft.unit, weekdays: draft.weekdays }, start, now, count);
}

/**
 * The draft as `POST /api/v1/clients/:clientId/jobs` takes it; `jobId` is `null` for a
 * job that does not exist yet. Throws at the field that keeps a request from being built.
 */
export function jobInputFrom(draft: JobDraft, jobId: string | null): BackupJobInput {
    if (!draft.repository) throw new DraftFieldError<JobDraft>('repository', 'Choose the repository the job backs up to.');

    let nextRunAt: string | undefined;
    if (draft.startDate && draft.startTime) {
        const start = startOf(draft);
        if (!start) throw new DraftFieldError<JobDraft>('startDate', 'Not a date and time.');
        nextRunAt = start.toISOString();
    }

    const interval = intervalOf(draft);
    if (typeof interval !== 'number') throw new DraftFieldError<JobDraft>('interval', interval);

    return {
        id: jobId,
        name: draft.name,
        archives: draft.archives,
        // Always sent, including empty: an update without it would keep the exclusions
        // stored before, and removing the last one would not take.
        excludes: draft.excludes,
        // A real boolean: the 1/0 sent once only survived because the schema coerces it.
        scheduleEnabled: draft.scheduleEnabled,
        nextRunAt,
        schedule: { interval, unit: draft.unit, weekdays: draft.weekdays },
        repository: draft.repository,
        encryption: draft.encryptionEnabled ? { enabled: true, keyContent: draft.keyContent || undefined } : undefined,
        // Always sent, including as `false`: leaving it out of an update would let the
        // previously stored route stand, and turning the tunnel off would silently not take.
        tunnel: { required: draft.tunnelRequired },
    };
}

/**
 * What the save button asks, said at the field. The backend parses a job with every key
 * optional and refuses one without a repository with a bare 400; a schedule without a
 * start has no first run; encryption without a key is refused by the agent at run time.
 * None of that is in the schema, so it is decided here.
 */
export function jobRules(draft: JobDraft): FieldErrors<JobDraft> {
    const errors: FieldErrors<JobDraft> = {};
    if (!draft.name.trim()) errors.name = 'Name the job.';
    if (draft.archives.length === 0) errors.archives = 'Add at least one archive.';
    if (!draft.repository) errors.repository = 'Choose the repository the job backs up to.';
    if (draft.scheduleEnabled && (!draft.startDate || !draft.startTime)) {
        errors.startDate = 'A schedule needs the date and time of its first run.';
    }
    const interval = intervalOf(draft);
    if (typeof interval !== 'number') errors.interval = interval;
    if (draft.encryptionEnabled && !draft.keyContent && !draft.hasStoredKey) {
        errors.encryptionEnabled = 'Encryption needs a key.';
    }
    return errors;
}

/** Where an issue of `BackupJobSchema` is shown: the request nests what the form lays out flat. */
export const jobFieldOf: FieldOf<JobDraft> = (path) => {
    switch (path[0]) {
        case 'name':
        case 'archives':
        case 'excludes':
        case 'repository':
        case 'scheduleEnabled':
            return path[0];
        case 'schedule':
            return path[1] === 'unit' || path[1] === 'weekdays' ? path[1] : 'interval';
        case 'nextRunAt':
            return 'startDate';
        case 'encryption':
            return 'encryptionEnabled';
        case 'tunnel':
            return 'tunnelRequired';
        default:
            return null;
    }
};
