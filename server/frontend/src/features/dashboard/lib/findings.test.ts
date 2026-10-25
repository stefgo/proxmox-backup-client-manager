import { describe, expect, it } from 'vitest';
import type { BackupJob, Client, GlobalHistoryEntry } from '@pbcm/shared';
import type { GlobalJob } from '../../../lib/cacheUpdates';
import { backupStatus, buildFindings, findingAge, findingSummary, type FindingsInput } from './findings';

const NOW = Date.parse('2026-10-25T12:00:00.000Z');
const HOUR = 3_600_000;
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const client = (id: string, changes: Partial<Client> = {}): Client => ({
    id,
    hostname: id,
    displayName: null,
    status: 'online',
    lastSeen: iso(-HOUR),
    connectionMode: 'inbound',
    ...changes,
});

const job = (clientId: string, id: string, changes: Partial<BackupJob> = {}): GlobalJob => ({
    id,
    name: `job ${id}`,
    schedule: { interval: 1, unit: 'days', weekdays: [] },
    scheduleEnabled: true,
    nextRunAt: iso(HOUR),
    archives: [],
    excludes: [],
    repository: { baseUrl: 'https://pbs:8007', datastore: 'store', username: 'u@pbs', secret: '' },
    ...changes,
    clientId,
});

const run = (clientId: string, jobId: string, changes: Partial<GlobalHistoryEntry> = {}): GlobalHistoryEntry => ({
    id: `run-${clientId}-${jobId}`,
    clientId,
    jobId,
    name: `job ${jobId}`,
    type: 'backup',
    status: 'success',
    startTime: iso(-2 * HOUR),
    endTime: iso(-HOUR),
    exitCode: 0,
    stdout: null,
    stderr: null,
    hostname: clientId,
    displayName: null,
    ...changes,
});

const input = (changes: Partial<FindingsInput>): FindingsInput => ({
    clients: [],
    repositories: [],
    jobs: [],
    knownClients: [],
    latest: [],
    now: NOW,
    ...changes,
});

const types = (changes: Partial<FindingsInput>) => buildFindings(input(changes)).map((f) => f.type);

describe('buildFindings', () => {
    it('finds nothing where every client is there, has a job and ran it', () => {
        expect(
            buildFindings(
                input({
                    clients: [client('a')],
                    jobs: [job('a', 'j1')],
                    knownClients: ['a'],
                    latest: [run('a', 'j1')],
                }),
            ),
        ).toEqual([]);
    });

    it('reports a registered client that is offline, and nothing else of its own', () => {
        const findings = buildFindings(
            input({
                clients: [client('a', { status: 'offline', lastSeen: iso(-5 * HOUR) })],
                // A leftover job, overdue -- not to be judged while its agent is away.
                jobs: [job('a', 'j1', { nextRunAt: iso(-3 * HOUR) })],
            }),
        );
        expect(findings).toMatchObject([
            { type: 'client-offline', severity: 'error', text: 'a is offline', since: iso(-5 * HOUR) },
        ]);
    });

    it('leaves out a client that still waits for its agent', () => {
        expect(types({ clients: [client('a', { status: 'offline', lastSeen: null })] })).toEqual([]);
    });

    it('still reports the failed last run of a client that is offline', () => {
        expect(
            types({
                clients: [client('a', { status: 'offline' })],
                latest: [run('a', 'j1', { status: 'failed' })],
            }),
        ).toEqual(['client-offline', 'run-failed']);
    });

    it('takes a failed run as an error and an aborted or missed one as a warning', () => {
        const findings = buildFindings(
            input({
                clients: [client('a', { displayName: 'web01' })],
                jobs: [job('a', 'j1'), job('a', 'j2'), job('a', 'j3')],
                knownClients: ['a'],
                latest: [
                    run('a', 'j1', { status: 'missed' }),
                    run('a', 'j2', { status: 'failed', name: 'etc' }),
                    run('a', 'j3', { status: 'abort' }),
                ],
            }),
        );
        expect(findings.map((f) => [f.type, f.severity])).toEqual([
            ['run-failed', 'error'],
            ['run-aborted', 'warning'],
            ['run-missed', 'warning'],
        ]);
        expect(findings[0].text).toBe('The last run of "etc" on web01 failed');
    });

    it('drops the runs of a client that no longer exists', () => {
        expect(types({ latest: [run('gone', 'j1', { status: 'failed' })] })).toEqual([]);
    });

    it('reports a scheduled run that is overdue by more than the grace', () => {
        const findings = buildFindings(
            input({
                clients: [client('a')],
                jobs: [job('a', 'j1', { nextRunAt: iso(-HOUR) }), job('a', 'j2', { nextRunAt: iso(-60_000) })],
                knownClients: ['a'],
            }),
        );
        expect(findings).toMatchObject([{ type: 'run-overdue', id: 'run-overdue:a:j1', since: iso(-HOUR) }]);
    });

    it('does not call a run overdue that is under way, or a job whose schedule is off', () => {
        expect(
            types({
                clients: [client('a')],
                jobs: [
                    job('a', 'j1', { nextRunAt: iso(-HOUR) }),
                    job('a', 'j2', { nextRunAt: iso(-HOUR), scheduleEnabled: false }),
                    job('a', 'j3', { nextRunAt: iso(-HOUR), schedule: null }),
                ],
                knownClients: ['a'],
                latest: [run('a', 'j1', { status: 'running', endTime: null })],
            }),
        ).toEqual([]);
    });

    it('reports an online client without a job once its list has arrived', () => {
        expect(types({ clients: [client('a')], knownClients: ['a'] })).toEqual(['client-without-jobs']);
        // Just connected: the list is on its way, not empty.
        expect(types({ clients: [client('a')], knownClients: [] })).toEqual([]);
    });

    it('reports a tunnel that is down, with what it last said', () => {
        const findings = buildFindings(
            input({
                clients: [
                    client('a', {
                        tunnel: { clientId: 'a', status: 'error', activeLeases: 0, forwards: [], lastError: 'refused' },
                    }),
                ],
                jobs: [job('a', 'j1')],
                knownClients: ['a'],
            }),
        );
        expect(findings).toMatchObject([{ type: 'tunnel-error', text: 'The SSH tunnel of a is down: refused' }]);
    });

    it('reports a repository that does not answer, not one that is not checked yet', () => {
        const repo = { baseUrl: 'https://pbs:8007', datastore: 'store' };
        expect(
            types({
                repositories: [
                    { ...repo, id: 1, status: 'offline' },
                    { ...repo, id: 2, status: 'loading' },
                    { ...repo, id: 3, status: 'unknown' },
                ],
            }),
        ).toEqual(['repository-offline']);
    });

    it('puts errors first, hosts before jobs, then by text', () => {
        expect(
            types({
                clients: [client('b'), client('a', { status: 'offline' })],
                knownClients: ['b'],
                jobs: [job('b', 'j1', { nextRunAt: iso(-HOUR) })],
                latest: [run('b', 'j1', { status: 'failed' })],
                repositories: [{ id: 1, baseUrl: 'x', datastore: 'y', status: 'offline' }],
            }),
        ).toEqual(['client-offline', 'repository-offline', 'run-failed', 'run-overdue']);
    });
});

describe('backupStatus', () => {
    const registered = [client('a')];

    it('is unknown without a registered client', () => {
        expect(backupStatus([], [])).toBe('unknown');
        expect(backupStatus([], [client('a', { lastSeen: null })])).toBe('unknown');
    });

    it('follows the worst finding', () => {
        const error = { id: 'e', type: 'client-offline', severity: 'error', text: '' } as const;
        const warning = { id: 'w', type: 'run-overdue', severity: 'warning', text: '' } as const;
        expect(backupStatus([], registered)).toBe('healthy');
        expect(backupStatus([warning], registered)).toBe('degraded');
        expect(backupStatus([warning, error], registered)).toBe('critical');
    });
});

describe('findingSummary', () => {
    it('counts the findings, or says what the status means', () => {
        const one = { id: 'w', type: 'run-overdue', severity: 'warning', text: '' } as const;
        expect(findingSummary([one], 'degraded')).toBe('1 finding');
        expect(findingSummary([one, one], 'degraded')).toBe('2 findings');
        expect(findingSummary([], 'healthy')).toBe('Nothing needs attention');
    });
});

describe('findingAge', () => {
    it('says how long, in the largest unit that fits', () => {
        expect(findingAge({ since: iso(-30_000) }, NOW)).toBe('For less than a minute');
        expect(findingAge({ since: iso(-60_000) }, NOW)).toBe('For 1 minute');
        expect(findingAge({ since: iso(-5 * HOUR) }, NOW)).toBe('For 5 hours');
        expect(findingAge({ since: iso(-49 * HOUR) }, NOW)).toBe('For 2 days');
    });

    it('reads the time SQLite writes, which carries no zone', () => {
        expect(findingAge({ since: '2026-10-25 09:00:00' }, NOW)).toBe('For 3 hours');
    });

    it('says nothing without a start, or with one ahead', () => {
        expect(findingAge({ since: null }, NOW)).toBeNull();
        expect(findingAge({}, NOW)).toBeNull();
        expect(findingAge({ since: iso(HOUR) }, NOW)).toBeNull();
    });
});
