import { describe, expect, it } from 'vitest';
import {
    activeJobCount,
    clientCount,
    clientSummary,
    hasOfflineClient,
    describeActiveJobs,
    describeOnlineCount,
    describeUnseen,
    formatOnlineCount,
    problemSummary,
    repositoryCount,
    repositorySummary,
} from './dashboard';

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

describe('the counts in words', () => {
    it('says how many of how many are online', () => {
        expect(describeOnlineCount({ online: 3, total: 5 })).toBe('3 of 5 online');
        expect(describeOnlineCount(clientCount([]))).toBe('0 of 0 online');
    });

    it('counts jobs in the singular where there is one', () => {
        expect(describeActiveJobs(0)).toBe('0 jobs active');
        expect(describeActiveJobs(1)).toBe('1 job active');
        expect(describeActiveJobs(2)).toBe('2 jobs active');
    });
});

describe('activeJobCount', () => {
    it('counts the jobs of online clients only', () => {
        expect(activeJobCount([{ clientId: 'a' }, { clientId: 'a' }, { clientId: 'b' }, { clientId: 'gone' }], clients)).toBe(2);
    });
});

describe('problemSummary', () => {
    it('names what the count is made of', () => {
        expect(problemSummary(2, 3)).toBe('3 failed · 2 missed');
    });

    it('leaves out a part that is zero', () => {
        expect(problemSummary(0, 3)).toBe('3 failed');
        expect(problemSummary(2, 0)).toBe('2 missed');
    });

    it('says so when there is nothing', () => {
        expect(problemSummary(0, 0)).toBe('Nothing to report');
    });
});

describe('describeUnseen', () => {
    it('says what is left to mark as seen', () => {
        expect(describeUnseen(1, 2)).toBe('2 failed · 1 missed, not marked as seen');
        expect(describeUnseen(1, 0)).toBe('1 missed, not marked as seen');
    });

    it('says nothing when nothing is left', () => {
        expect(describeUnseen(0, 0)).toBeUndefined();
    });
});

describe('clientSummary', () => {
    const at = '2026-10-25T10:00:00.000Z';

    it('names the offline clients apart from those that wait for their agent', () => {
        const clients = [
            { status: 'online', connectionMode: 'inbound', lastSeen: at },
            { status: 'offline', connectionMode: 'inbound', lastSeen: at },
            { status: 'offline', connectionMode: 'inbound', lastSeen: null },
        ] as const;
        expect(clientSummary(clients)).toBe('1 offline · 1 awaiting registration');
        expect(hasOfflineClient(clients)).toBe(true);
    });

    it('does not warn of a client that has never been there', () => {
        const clients = [{ status: 'offline', connectionMode: 'inbound', lastSeen: null }] as const;
        expect(clientSummary(clients)).toBe('1 awaiting registration');
        expect(hasOfflineClient(clients)).toBe(false);
    });

    it('says when everyone is there, and when there is nobody', () => {
        expect(clientSummary([{ status: 'online', connectionMode: 'outbound', lastSeen: at }])).toBe('All connected');
        expect(clientSummary([])).toBe('None added yet');
    });
});

describe('repositorySummary', () => {
    it('counts what does not answer before what is still being checked', () => {
        expect(repositorySummary([{ status: 'offline' }, { status: 'loading' }])).toBe('1 not answering');
        expect(repositorySummary([{ status: 'online' }, { status: 'loading' }])).toBe('Checking…');
        expect(repositorySummary([{ status: 'online' }])).toBe('All answering');
        expect(repositorySummary([])).toBe('None added yet');
    });
});
