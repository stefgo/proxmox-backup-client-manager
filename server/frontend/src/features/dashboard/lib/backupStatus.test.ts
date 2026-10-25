import { describe, expect, it } from 'vitest';
import type { GlobalHistoryEntry, HistoryEntry } from '@pbcm/shared';
import { jobIdOf, type GlobalJob, type SessionHistoryItem } from '../../../lib/cacheUpdates';
import { byBackupStatus, existingJobRuns } from './backupStatus';

const run = (clientId: string, jobId: string | null, changes: Partial<GlobalHistoryEntry> = {}): GlobalHistoryEntry => ({
    id: `run-${clientId}-${jobId}`,
    clientId,
    jobId,
    name: null,
    type: 'backup',
    status: 'success',
    startTime: '2026-10-25T02:00:00.000Z',
    endTime: '2026-10-25T02:10:00.000Z',
    exitCode: 0,
    stdout: null,
    stderr: null,
    hostname: clientId,
    displayName: null,
    ...changes,
});

const job = (clientId: string, id: string) => ({ clientId, id }) as GlobalJob;

describe('existingJobRuns', () => {
    it('drops the run of a job a known client no longer has', () => {
        const rows = existingJobRuns([run('a', 'j1'), run('a', 'gone')], [job('a', 'j1')], ['a']);
        expect(rows.map(jobIdOf)).toEqual(['j1']);
    });

    it('drops them all for a known client whose list is empty', () => {
        expect(existingJobRuns([run('a', 'j1')], [], ['a'])).toEqual([]);
    });

    it('keeps the runs of a client whose list the server does not hold', () => {
        expect(existingJobRuns([run('a', 'j1')], [], [])).toHaveLength(1);
    });

    it('keeps the same job id of another client apart', () => {
        const rows = existingJobRuns([run('a', 'j1'), run('b', 'j1')], [job('b', 'j1')], ['a', 'b']);
        expect(rows.map((r) => r.clientId)).toEqual(['b']);
    });

    it('reads the job of a row an agent pushed', () => {
        const entry: HistoryEntry = {
            id: 'run-1',
            name: null,
            jobConfigId: 'j1',
            type: 'backup',
            status: 'success',
            startTime: '2026-10-25T02:00:00.000Z',
            endTime: null,
            exitCode: null,
            stdout: null,
            stderr: null,
        };
        const pushed: SessionHistoryItem = { ...entry, clientId: 'a', hostname: null, displayName: null };
        expect(existingJobRuns([pushed], [job('a', 'j1')], ['a'])).toHaveLength(1);
    });
});

describe('byBackupStatus', () => {
    it('puts problems first and the oldest first within each', () => {
        const rows = byBackupStatus([
            run('a', 'ok-new', { startTime: '2026-10-25T03:00:00.000Z' }),
            run('a', 'ok-old', { startTime: '2026-10-20T03:00:00.000Z' }),
            run('a', 'running', { status: 'running' }),
            run('a', 'missed', { status: 'missed' }),
            run('a', 'failed', { status: 'failed' }),
            run('a', 'skipped', { status: 'skipped' }),
        ]);
        expect(rows.map(jobIdOf)).toEqual(['failed', 'missed', 'running', 'skipped', 'ok-old', 'ok-new']);
    });

    it('leaves the list it was given as it was', () => {
        const rows = [run('a', 'b', { status: 'success' }), run('a', 'a', { status: 'failed' })];
        byBackupStatus(rows);
        expect(rows.map(jobIdOf)).toEqual(['b', 'a']);
    });
});
