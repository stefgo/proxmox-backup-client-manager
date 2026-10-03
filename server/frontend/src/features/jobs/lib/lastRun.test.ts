import { describe, expect, it } from 'vitest';
import type { GlobalHistoryEntry, HistoryEntry } from '@pbcm/shared';
import type { SessionHistoryItem } from '../../../lib/cacheUpdates';
import { lastRunByJob, lastRunKey } from './lastRun';

const run = {
    type: 'backup',
    status: 'success',
    startTime: '2026-10-03 12:00:00',
    endTime: '2026-10-03 12:01:00',
    exitCode: 0,
    stdout: null,
    stderr: null,
};

/** A row as `GET /api/v1/history/latest` delivers it. */
const fetched = (fields: Partial<GlobalHistoryEntry>): SessionHistoryItem => ({
    ...run,
    id: 'run-1',
    clientId: 'client-a',
    jobId: 'job-1',
    name: 'nightly',
    hostname: 'web01',
    displayName: null,
    ...fields,
});

/** A row as `JOB_UPDATE` puts it into the same list. */
const pushed = (fields: Partial<HistoryEntry> & { clientId?: string }): SessionHistoryItem => ({
    ...run,
    id: 'run-1',
    clientId: 'client-a',
    jobConfigId: 'job-1',
    hostname: 'web01',
    displayName: null,
    ...fields,
});

describe('lastRunByJob', () => {
    it('finds a fetched row by its client and job', () => {
        const row = fetched({});
        expect(lastRunByJob([row]).get(lastRunKey('client-a', 'job-1'))).toBe(row);
    });

    it('finds a pushed row, which names its job as jobConfigId', () => {
        const row = pushed({});
        expect(lastRunByJob([row]).get(lastRunKey('client-a', 'job-1'))).toBe(row);
    });

    it('leaves out a run that belongs to no job', () => {
        expect(lastRunByJob([fetched({ jobId: null }), pushed({ jobConfigId: null })]).size).toBe(0);
    });

    it('keeps the same job id of two clients apart', () => {
        const a = fetched({ id: 'run-a' });
        const b = fetched({ id: 'run-b', clientId: 'client-b' });
        const byJob = lastRunByJob([a, b]);
        expect(byJob.get(lastRunKey('client-a', 'job-1'))).toBe(a);
        expect(byJob.get(lastRunKey('client-b', 'job-1'))).toBe(b);
    });

    it('takes the later start of two rows of one job, whatever their order', () => {
        const older = fetched({ id: 'older', startTime: '2026-10-02 12:00:00' });
        const newer = pushed({ id: 'newer', startTime: '2026-10-03T12:00:00Z' });
        expect(lastRunByJob([older, newer]).get(lastRunKey('client-a', 'job-1'))).toBe(newer);
        expect(lastRunByJob([newer, older]).get(lastRunKey('client-a', 'job-1'))).toBe(newer);
    });

    it('has no entry for a job that never ran', () => {
        expect(lastRunByJob([fetched({})]).get(lastRunKey('client-a', 'job-2'))).toBeUndefined();
    });
});
