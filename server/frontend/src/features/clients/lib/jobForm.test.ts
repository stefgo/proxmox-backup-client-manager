import { describe, expect, it } from 'vitest';
import { BackupJobSchema, type BackupJob } from '@pbcm/shared';
import { checkDraft } from '../../../lib/entityForm';
import { toLocalDateInput, toLocalTimeInput } from '../../../utils';
import {
    WEEKDAYS,
    emptyJobDraft,
    jobDraftFrom,
    jobFieldOf,
    jobInputFrom,
    jobRules,
    previewRuns,
    type JobDraft,
} from './jobForm';

const NOW = new Date(2026, 9, 3, 14, 30);
const JOB_ID = '33333333-3333-4333-8333-333333333333';

const repository = {
    repositoryId: '7',
    baseUrl: 'https://pbs.example.com:8007',
    datastore: 'backups',
    username: 'root@pam',
    // Not known in the browser: the server fills it in from the repository on save.
    secret: '',
};

const job = (changes: Partial<BackupJob> = {}): BackupJob => ({
    id: JOB_ID,
    name: 'Daily /home',
    schedule: { interval: 2, unit: 'hours', weekdays: ['mon', 'fri'] },
    scheduleEnabled: true,
    nextRunAt: new Date(2026, 9, 4, 2, 0).toISOString(),
    archives: [{ path: '/home', name: 'home' }],
    excludes: ['/stefan/.cache'],
    repository,
    ...changes,
});

const complete = (changes: Partial<JobDraft> = {}): JobDraft => ({
    ...emptyJobDraft(NOW),
    name: 'Daily /home',
    archives: [{ path: '/home', name: 'home' }],
    repository,
    ...changes,
});

const check = (draft: JobDraft, jobId: string | null = null) =>
    checkDraft(
        { schema: BackupJobSchema, toInput: (d: JobDraft) => jobInputFrom(d, jobId), fieldOf: jobFieldOf, rules: jobRules },
        draft,
    );

describe('emptyJobDraft', () => {
    it('starts now, daily, on every weekday, with the schedule off', () => {
        expect(emptyJobDraft(NOW)).toMatchObject({
            scheduleEnabled: false,
            interval: '1',
            unit: 'days',
            weekdays: [...WEEKDAYS],
            startDate: '2026-10-03',
            startTime: '14:30',
        });
    });

    it('hands out its own weekday list each time', () => {
        expect(emptyJobDraft(NOW).weekdays).not.toBe(emptyJobDraft(NOW).weekdays);
    });
});

describe('jobDraftFrom', () => {
    it('shows the next run of a scheduled job as its start, in local time', () => {
        const next = new Date(2026, 9, 4, 2, 0);
        expect(jobDraftFrom(job(), NOW)).toMatchObject({
            scheduleEnabled: true,
            interval: '2',
            unit: 'hours',
            weekdays: ['mon', 'fri'],
            startDate: toLocalDateInput(next),
            startTime: toLocalTimeInput(next),
        });
    });

    it('starts a scheduled job without a next run now', () => {
        expect(jobDraftFrom(job({ nextRunAt: undefined }), NOW)).toMatchObject({
            startDate: '2026-10-03',
            startTime: '14:30',
        });
    });

    it('starts a job without a schedule today at midnight, daily, schedule off', () => {
        expect(jobDraftFrom(job({ schedule: null, scheduleEnabled: true }), NOW)).toMatchObject({
            scheduleEnabled: false,
            interval: '1',
            unit: 'days',
            weekdays: [...WEEKDAYS],
            startDate: '2026-10-03',
            startTime: '00:00',
        });
    });

    it('takes an encrypted job for one whose key the agent holds', () => {
        expect(jobDraftFrom(job({ encryption: { enabled: true } }), NOW)).toMatchObject({
            encryptionEnabled: true,
            keyContent: null,
            hasStoredKey: true,
        });
    });

    it('holds no key for a job whose encryption is off', () => {
        expect(jobDraftFrom(job({ encryption: { enabled: false } }), NOW)).toMatchObject({
            encryptionEnabled: false,
            hasStoredKey: false,
        });
    });

    it('reads the tunnel of a job that has none stored as off', () => {
        expect(jobDraftFrom(job(), NOW).tunnelRequired).toBe(false);
        expect(jobDraftFrom(job({ tunnel: { required: true } }), NOW).tunnelRequired).toBe(true);
    });
});

describe('jobInputFrom', () => {
    it('sends the exclusions even when there are none, so the last one can be removed', () => {
        expect(jobInputFrom(complete(), null).excludes).toEqual([]);
    });

    it('sends the tunnel even when it is off, so it can be switched off', () => {
        expect(jobInputFrom(complete(), null).tunnel).toEqual({ required: false });
    });

    it('sends the start as an instant, read from the local date and time', () => {
        const input = jobInputFrom(complete({ startDate: '2026-10-04', startTime: '02:00' }), null);
        expect(input.nextRunAt).toBe(new Date(2026, 9, 4, 2, 0).toISOString());
    });

    it('sends no start when the date or the time is missing', () => {
        expect(jobInputFrom(complete({ startTime: '' }), null).nextRunAt).toBeUndefined();
    });

    it('sends no encryption while it is off, and the generated key while it is on', () => {
        expect(jobInputFrom(complete(), null).encryption).toBeUndefined();
        expect(jobInputFrom(complete({ encryptionEnabled: true, keyContent: '{"k":1}' }), null).encryption).toEqual({
            enabled: true,
            keyContent: '{"k":1}',
        });
    });

    it('sends encryption without a key for one the agent already holds', () => {
        expect(jobInputFrom(complete({ encryptionEnabled: true, hasStoredKey: true }), JOB_ID).encryption).toEqual({
            enabled: true,
            keyContent: undefined,
        });
    });

    it('carries the id of the job it changes, and null for a new one', () => {
        expect(jobInputFrom(complete(), JOB_ID).id).toBe(JOB_ID);
        expect(jobInputFrom(complete(), null).id).toBeNull();
    });
});

describe('the job draft, checked', () => {
    it('accepts a job with a name, an archive and a repository', () => {
        expect(check(complete()).isValid).toBe(true);
    });

    it('accepts a stored job as it was loaded', () => {
        expect(check(jobDraftFrom(job(), NOW), JOB_ID).isValid).toBe(true);
    });

    it('says what a new job lacks, at each field', () => {
        expect(check(emptyJobDraft(NOW)).errors).toEqual({
            name: 'Name the job.',
            archives: 'Add at least one archive.',
            repository: 'Choose the repository the job backs up to.',
        });
    });

    it('asks a schedule for its first run', () => {
        expect(check(complete({ scheduleEnabled: true, startTime: '' })).errors).toEqual({
            startDate: 'A schedule needs the date and time of its first run.',
        });
    });

    it('does not ask for a first run while the schedule is off', () => {
        expect(check(complete({ startDate: '', startTime: '' })).isValid).toBe(true);
    });

    it('refuses an interval below one at the interval', () => {
        expect(check(complete({ interval: '0' })).errors).toEqual({ interval: 'At least 1.' });
        expect(check(complete({ interval: '-3' })).errors).toEqual({ interval: 'At least 1.' });
    });

    it('lets the interval be emptied, and says so at the field instead of putting a 1 back', () => {
        expect(check(complete({ interval: '' })).errors).toEqual({ interval: 'At least 1.' });
        expect(check(complete({ interval: '  ' })).errors).toEqual({ interval: 'At least 1.' });
    });

    it('refuses an interval that is no whole number', () => {
        expect(check(complete({ interval: '1.5' })).errors).toEqual({ interval: 'A whole number.' });
        expect(check(complete({ interval: 'two' })).errors).toEqual({ interval: 'At least 1.' });
    });

    it('sends the interval as the number that was typed', () => {
        expect(check(complete({ interval: ' 12 ' })).input?.schedule).toMatchObject({ interval: 12 });
    });

    it('refuses encryption without a key', () => {
        expect(check(complete({ encryptionEnabled: true })).errors).toEqual({
            encryptionEnabled: 'Encryption needs a key.',
        });
    });

    it('shows an archive the schema refuses at the archives', () => {
        const draft = complete({ archives: [{ path: 'relative', name: 'home' }] });
        expect(check(draft).errors).toEqual({ archives: 'Paths must be absolute' });
    });

    it('shows a start that is no date at the start', () => {
        expect(check(complete({ startDate: 'tomorrow', startTime: '02:00' })).errors).toEqual({
            startDate: 'Not a date and time.',
        });
    });
});

describe('previewRuns', () => {
    const scheduled = (changes: Partial<JobDraft> = {}) =>
        complete({ scheduleEnabled: true, startDate: '2026-10-04', startTime: '02:00', ...changes });
    const starts = (draft: JobDraft) =>
        previewRuns(draft, NOW, 3).map((run) => `${toLocalDateInput(run)} ${toLocalTimeInput(run)}`);

    it('starts with the first run and repeats it by the interval', () => {
        expect(starts(scheduled({ interval: '2' }))).toEqual([
            '2026-10-04 02:00',
            '2026-10-06 02:00',
            '2026-10-08 02:00',
        ]);
    });

    it('has nothing to show while the schedule is off', () => {
        expect(starts(scheduled({ scheduleEnabled: false }))).toEqual([]);
    });

    it('has nothing to show while the interval or the start cannot be read', () => {
        expect(starts(scheduled({ interval: '' }))).toEqual([]);
        expect(starts(scheduled({ startTime: '' }))).toEqual([]);
    });
});
