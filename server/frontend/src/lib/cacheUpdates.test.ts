import { beforeEach, describe, expect, it } from 'vitest';
import type { BackupJob, Client, GlobalHistoryEntry, HistoryEntry, SchedulerStatuses, TunnelState } from '@pbcm/shared';
import {
    applyRunToLatest,
    applySchedulerUpdate,
    jobIdOf,
    mergeTunnelState,
    recentRuns,
    replaceClientJobs,
    setJobNextRun,
    upsertRun,
    type GlobalJob,
    type SessionHistoryItem,
} from './cacheUpdates';

const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const CLIENT_B = '22222222-2222-4222-8222-222222222222';

/** A run as an agent pushes it over the WebSocket. */
const run = (changes: Partial<HistoryEntry> = {}): HistoryEntry => ({
    id: 'run-1',
    name: 'Daily /home',
    jobConfigId: 'job-1',
    type: 'backup',
    status: 'running',
    startTime: '2026-09-28T02:00:00.000Z',
    endTime: null,
    exitCode: null,
    stdout: null,
    stderr: null,
    ...changes,
});

/** A row as GET /api/v1/history/latest returns it, client columns included. */
const restRow = (changes: Partial<GlobalHistoryEntry> = {}): GlobalHistoryEntry => ({
    id: 'run-1',
    clientId: CLIENT_A,
    jobId: 'job-1',
    name: 'Daily /home',
    type: 'backup',
    status: 'success',
    startTime: '2026-09-28T02:00:00.000Z',
    endTime: '2026-09-28T02:10:00.000Z',
    exitCode: 0,
    stdout: null,
    stderr: null,
    hostname: 'web01',
    displayName: 'Web 01',
    ...changes,
});

const client = (id: string, hostname: string, displayName?: string): Client => ({
    id,
    hostname,
    displayName,
    status: 'online',
    lastSeen: '2026-09-28T02:00:00.000Z',
});

/**
 * The list and the clients the caller knows, as the cache would hold them: each test
 * applies its updates one after the other, the way the socket delivers them.
 */
let latest: SessionHistoryItem[];
let clients: Client[];

const rows = () => latest;
const updateSession = (clientId: string, job: HistoryEntry) => {
    latest = applyRunToLatest(latest, clientId, job, clients.find((c) => c.id === clientId));
};

beforeEach(() => {
    latest = [];
    clients = [client(CLIENT_A, 'web01', 'Web 01'), client(CLIENT_B, 'db01')];
});

describe('applyRunToLatest', () => {
    it('adds the first run of a job, with the client columns of the client it is handed', () => {
        updateSession(CLIENT_A, run());
        expect(rows()).toEqual([{ ...run(), clientId: CLIENT_A, hostname: 'web01', displayName: 'Web 01' }]);
    });

    it('leaves the display name null for a client that has none', () => {
        updateSession(CLIENT_B, run());
        expect(rows()[0]).toMatchObject({ hostname: 'db01', displayName: null });
    });

    it('updates the row of the same run instead of adding one', () => {
        updateSession(CLIENT_A, run());
        updateSession(CLIENT_A, run({ status: 'success', endTime: '2026-09-28T02:10:00.000Z', exitCode: 0 }));
        expect(rows()).toHaveLength(1);
        expect(rows()[0]).toMatchObject({ id: 'run-1', status: 'success', exitCode: 0 });
    });

    it('updates a row that came from the REST fetch', () => {
        latest = [restRow({ status: 'running', endTime: null })];
        updateSession(CLIENT_A, run({ status: 'failed', exitCode: 255 }));
        expect(rows()).toHaveLength(1);
        expect(rows()[0]).toMatchObject({ status: 'failed', exitCode: 255, hostname: 'web01' });
        expect(jobIdOf(rows()[0])).toBe('job-1');
    });

    it('replaces the row of a job with a newer run', () => {
        updateSession(CLIENT_A, run());
        updateSession(CLIENT_A, run({ id: 'run-2', startTime: '2026-09-29T02:00:00.000Z' }));
        expect(rows().map((row) => row.id)).toEqual(['run-2']);
    });

    it('replaces a REST row with a newer run of the same job', () => {
        latest = [restRow()];
        updateSession(CLIENT_A, run({ id: 'run-2', startTime: '2026-09-29T02:00:00.000Z' }));
        expect(rows().map((row) => row.id)).toEqual(['run-2']);
    });

    it('discards an older run of a job already shown', () => {
        updateSession(CLIENT_A, run({ id: 'run-2', startTime: '2026-09-29T02:00:00.000Z' }));
        updateSession(CLIENT_A, run({ id: 'run-1', status: 'success' }));
        expect(rows().map((row) => row.id)).toEqual(['run-2']);
    });

    it('still takes a late update of the run that is shown', () => {
        updateSession(CLIENT_A, run({ id: 'run-2', startTime: '2026-09-29T02:00:00.000Z' }));
        updateSession(CLIENT_A, run({ id: 'run-2', startTime: '2026-09-29T02:00:00.000Z', status: 'success' }));
        expect(rows()[0]).toMatchObject({ id: 'run-2', status: 'success' });
    });

    it('keeps one row per job, newest first', () => {
        updateSession(CLIENT_A, run({ id: 'a', jobConfigId: 'job-1', startTime: '2026-09-28T02:00:00.000Z' }));
        updateSession(CLIENT_A, run({ id: 'b', jobConfigId: 'job-2', startTime: '2026-09-28T04:00:00.000Z' }));
        updateSession(CLIENT_A, run({ id: 'c', jobConfigId: 'job-3', startTime: '2026-09-28T03:00:00.000Z' }));
        expect(rows().map((row) => row.id)).toEqual(['b', 'c', 'a']);
    });

    it('keeps the same job id of two clients apart', () => {
        updateSession(CLIENT_A, run({ id: 'a' }));
        updateSession(CLIENT_B, run({ id: 'b', startTime: '2026-09-28T03:00:00.000Z' }));
        expect(rows().map((row) => [row.id, row.clientId])).toEqual([
            ['b', CLIENT_B],
            ['a', CLIENT_A],
        ]);
    });

    it('has no row for a run that belongs to no job', () => {
        updateSession(CLIENT_A, run({ jobConfigId: null }));
        expect(rows()).toEqual([]);
    });

    it('hands back the same list when an update changes nothing', () => {
        updateSession(CLIENT_A, run({ id: 'run-2', startTime: '2026-09-29T02:00:00.000Z' }));
        const before = rows();
        updateSession(CLIENT_A, run({ id: 'run-1' }));
        updateSession(CLIENT_A, run({ id: 'run-3', jobConfigId: null }));
        expect(rows()).toBe(before);
    });

    describe('for a client the caller does not know', () => {
        beforeEach(() => {
            clients = [];
        });

        it('adds the row without client columns', () => {
            updateSession(CLIENT_A, run());
            expect(rows()[0]).toMatchObject({ clientId: CLIENT_A, hostname: null, displayName: null });
        });

        it('does not blank out the names on an update of the same run', () => {
            latest = [restRow({ status: 'running' })];
            updateSession(CLIENT_A, run({ status: 'success' }));
            expect(rows()[0]).toMatchObject({ status: 'success', hostname: 'web01', displayName: 'Web 01' });
        });

        it('does not blank out the names when a newer run replaces the row', () => {
            latest = [restRow()];
            updateSession(CLIENT_A, run({ id: 'run-2', startTime: '2026-09-29T02:00:00.000Z' }));
            expect(rows()).toHaveLength(1);
            expect(rows()[0]).toMatchObject({ id: 'run-2', hostname: 'web01', displayName: 'Web 01' });
        });
    });

    it('prefers the names of the client it is handed over the ones on the row', () => {
        latest = [restRow({ hostname: 'old', displayName: 'Old' })];
        updateSession(CLIENT_A, run({ status: 'success' }));
        expect(rows()[0]).toMatchObject({ hostname: 'web01', displayName: 'Web 01' });
    });
});

const backupJob = (id: string, changes: Partial<BackupJob> = {}): BackupJob => ({
    id,
    name: `Job ${id}`,
    schedule: null,
    scheduleEnabled: false,
    archives: [{ path: '/home', name: 'home' }],
    excludes: [],
    repository: { baseUrl: 'pbs.example:8007', datastore: 'main', username: 'backup@pbs', secret: '' },
    ...changes,
});

const globalJob = (clientId: string, id: string, changes: Partial<BackupJob> = {}): GlobalJob => ({
    ...backupJob(id, changes),
    clientId,
});

describe('mergeTunnelState', () => {
    const state: TunnelState = { clientId: CLIENT_A, status: 'up', activeLeases: 1, forwards: [] };

    it('puts the state on the client it names and leaves the others alone', () => {
        const before = [client(CLIENT_A, 'web01'), client(CLIENT_B, 'db01')];
        const after = mergeTunnelState(before, state);
        expect(after[0].tunnel).toEqual(state);
        expect(after[1]).toBe(before[1]);
    });

    it('changes nothing for a client that is not in the list', () => {
        const before = [client(CLIENT_B, 'db01')];
        expect(mergeTunnelState(before, state)).toEqual(before);
    });
});

describe('replaceClientJobs', () => {
    it('replaces the jobs of one client and keeps the rows of the others', () => {
        const other = globalJob(CLIENT_B, 'job-9', { nextRunAt: '2026-09-29T02:00:00.000Z' });
        const after = replaceClientJobs(
            [globalJob(CLIENT_A, 'job-1'), other],
            CLIENT_A,
            [backupJob('job-2'), backupJob('job-3')],
        );
        expect(after.map((j) => [j.clientId, j.id])).toEqual([
            [CLIENT_B, 'job-9'],
            [CLIENT_A, 'job-2'],
            [CLIENT_A, 'job-3'],
        ]);
        expect(after[0]).toBe(other);
    });

    it('drops every job of a client that reports none, as one that went offline does', () => {
        const after = replaceClientJobs([globalJob(CLIENT_A, 'job-1'), globalJob(CLIENT_B, 'job-9')], CLIENT_A, []);
        expect(after.map((j) => j.clientId)).toEqual([CLIENT_B]);
    });

    it('adds the jobs of a client the list did not hold yet', () => {
        const after = replaceClientJobs([], CLIENT_A, [backupJob('job-1')]);
        expect(after).toEqual([globalJob(CLIENT_A, 'job-1')]);
    });
});

describe('setJobNextRun', () => {
    const NEXT = '2026-09-29T02:00:00.000Z';

    it('sets the next run of the job on the client it names', () => {
        const after = setJobNextRun([globalJob(CLIENT_A, 'job-1'), globalJob(CLIENT_A, 'job-2')], CLIENT_A, 'job-1', NEXT);
        expect(after.map((j) => j.nextRunAt)).toEqual([NEXT, undefined]);
    });

    it('keeps the same job id of another client apart', () => {
        const after = setJobNextRun([globalJob(CLIENT_A, 'job-1'), globalJob(CLIENT_B, 'job-1')], CLIENT_B, 'job-1', NEXT);
        expect(after.map((j) => j.nextRunAt)).toEqual([undefined, NEXT]);
    });

    it('matches by the job alone in a list that names no client', () => {
        const after = setJobNextRun([backupJob('job-1'), backupJob('job-2')], CLIENT_A, 'job-2', NEXT);
        expect(after.map((j) => j.nextRunAt)).toEqual([undefined, NEXT]);
    });

    it('clears the next run of a job that is no longer scheduled', () => {
        const after = setJobNextRun([backupJob('job-1', { nextRunAt: NEXT })], CLIENT_A, 'job-1', null);
        expect(after[0].nextRunAt).toBeUndefined();
    });
});

describe('upsertRun', () => {
    it('puts a run the history does not hold yet in front', () => {
        const after = upsertRun([run({ id: 'run-1' })], run({ id: 'run-2' }));
        expect(after.map((j) => j.id)).toEqual(['run-2', 'run-1']);
    });

    it('updates the run it already holds, in place', () => {
        const after = upsertRun(
            [run({ id: 'run-2' }), run({ id: 'run-1' })],
            run({ id: 'run-1', status: 'success', exitCode: 0 }),
        );
        expect(after.map((j) => [j.id, j.status])).toEqual([
            ['run-2', 'running'],
            ['run-1', 'success'],
        ]);
    });
});

describe('recentRuns', () => {
    const NOW = new Date('2026-09-29T12:00:00.000Z').getTime();
    const ended = (id: string, endTime: string) =>
        run({ id, status: 'success', startTime: '2026-09-01T00:00:00.000Z', endTime });

    it('keeps the runs that ended within the last 24 hours', () => {
        const history = [ended('in', '2026-09-28T12:00:01.000Z'), ended('out', '2026-09-28T12:00:00.000Z')];
        expect(recentRuns(history, NOW).map((j) => j.id)).toEqual(['in']);
    });

    it('counts a run that is still running by when it started', () => {
        const history = [
            run({ id: 'running', startTime: '2026-09-29T11:00:00.000Z' }),
            run({ id: 'stuck', startTime: '2026-09-27T11:00:00.000Z' }),
        ];
        expect(recentRuns(history, NOW).map((j) => j.id)).toEqual(['running']);
    });

    it('stops at ten, in the order of the history', () => {
        const history = Array.from({ length: 12 }, (_, i) => ended(`run-${i}`, '2026-09-29T11:00:00.000Z'));
        expect(recentRuns(history, NOW).map((j) => j.id)).toEqual(history.slice(0, 10).map((j) => j.id));
    });
});

describe('applySchedulerUpdate', () => {
    const idle = { isRunning: false, nextRun: '2026-09-29T00:00:00.000Z', lastRun: null };
    const schedulers: SchedulerStatuses = { 'token-cleanup': idle, 'job-history-cleanup': idle };

    it('replaces the scheduler the update names and keeps the other', () => {
        const after = applySchedulerUpdate(schedulers, {
            scheduler: 'token-cleanup',
            status: { ...idle, isRunning: true },
        });
        expect(after['token-cleanup'].isRunning).toBe(true);
        expect(after['job-history-cleanup']).toBe(schedulers['job-history-cleanup']);
    });
});
