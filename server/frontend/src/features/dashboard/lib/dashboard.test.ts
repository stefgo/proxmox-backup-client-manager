import { describe, expect, it } from 'vitest';
import {
    activeJobCount,
    clientCount,
    formatOnlineCount,
    MISSED_GRACE_MS,
    missedJobs,
    problemSummary,
    repositoryCount,
} from './dashboard';

const NOW = Date.parse('2026-10-03T12:00:00Z');
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const clients = [
    { id: 'a', status: 'online' },
    { id: 'b', status: 'offline' },
];

describe('clientCount and repositoryCount', () => {
    it('count what is online against all', () => {
        expect(clientCount(clients)).toEqual({ online: 1, total: 2 });
        expect(repositoryCount([{ status: 'online' }, { status: 'loading' }, { status: 'offline' }])).toEqual({
            online: 1,
            total: 3,
        });
    });

    it('are zero of zero for an empty list', () => {
        expect(formatOnlineCount(clientCount([]))).toBe('0 / 0');
    });
});

describe('activeJobCount', () => {
    it('counts the jobs of online clients only', () => {
        expect(activeJobCount([{ clientId: 'a' }, { clientId: 'a' }, { clientId: 'b' }, { clientId: 'gone' }], clients)).toBe(2);
    });
});

describe('missedJobs', () => {
    const job = (changes: object = {}) => ({
        id: 'j1',
        clientId: 'a',
        scheduleEnabled: true,
        nextRunAt: at(10 * 60_000),
        ...changes,
    });
    const noRun = () => undefined;
    const missed = (j: ReturnType<typeof job>, lastRunOf: () => { status: string; phase?: string } | undefined = noRun) =>
        missedJobs([j], clients, lastRunOf, NOW).length === 1;

    it('finds a scheduled job whose time is past', () => {
        expect(missed(job())).toBe(true);
    });

    it('leaves out a job that is due only now: the agent starts it on its next tick', () => {
        expect(missed(job({ nextRunAt: at(MISSED_GRACE_MS) }))).toBe(false);
        expect(missed(job({ nextRunAt: at(MISSED_GRACE_MS + 1) }))).toBe(true);
    });

    it('leaves out a job whose next run lies ahead', () => {
        expect(missed(job({ nextRunAt: at(-60 * 60_000) }))).toBe(false);
    });

    it('leaves out a job that is run by hand only, or has no time to miss', () => {
        expect(missed(job({ scheduleEnabled: false }))).toBe(false);
        expect(missed(job({ nextRunAt: undefined }))).toBe(false);
        expect(missed(job({ nextRunAt: 'not a date' }))).toBe(false);
    });

    it('leaves out the jobs of an offline client: that it is offline is said elsewhere', () => {
        expect(missed(job({ clientId: 'b' }))).toBe(false);
    });

    it('leaves out a job whose run is under way or queued', () => {
        expect(missed(job(), () => ({ status: 'running' }))).toBe(false);
        expect(missed(job(), () => ({ status: 'queued' }))).toBe(false);
    });

    it('keeps a job whose last run is over, however it ended', () => {
        expect(missed(job(), () => ({ status: 'success' }))).toBe(true);
        expect(missed(job(), () => ({ status: 'failed' }))).toBe(true);
    });
});

describe('problemSummary', () => {
    it('names what the count is made of', () => {
        expect(problemSummary(2, 3)).toBe('2 missed · 3 failed');
    });

    it('leaves out a part that is zero', () => {
        expect(problemSummary(0, 3)).toBe('3 failed');
        expect(problemSummary(2, 0)).toBe('2 missed');
    });

    it('says so when there is nothing', () => {
        expect(problemSummary(0, 0)).toBe('Nothing to report');
    });
});
