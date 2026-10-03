import { beforeEach, describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';

const CLIENT = '11111111-1111-4111-8111-111111111111';

/** Whether invalidating `prefix` reaches `key` -- asked of the cache itself, not rebuilt here. */
function reaches(prefix: readonly unknown[], key: readonly unknown[]): boolean {
    const queryClient = new QueryClient();
    queryClient.setQueryData(key, 'cached');
    return queryClient.getQueryCache().findAll({ queryKey: prefix }).length === 1;
}

describe('queryKeys', () => {
    it('reaches everything of every client from clients.all', () => {
        expect(reaches(queryKeys.clients.all, queryKeys.clients.list())).toBe(true);
        expect(reaches(queryKeys.clients.all, queryKeys.clients.jobs(CLIENT))).toBe(true);
        expect(reaches(queryKeys.clients.all, queryKeys.clients.history(CLIENT))).toBe(true);
        expect(reaches(queryKeys.clients.all, queryKeys.clients.tunnel(CLIENT))).toBe(true);
        expect(reaches(queryKeys.clients.all, queryKeys.clients.fs(CLIENT, '/home'))).toBe(true);
    });

    it('reaches list, statuses and snapshots from repositories.all', () => {
        expect(reaches(queryKeys.repositories.all, queryKeys.repositories.list())).toBe(true);
        expect(reaches(queryKeys.repositories.all, queryKeys.repositories.status(1))).toBe(true);
        expect(reaches(queryKeys.repositories.all, queryKeys.repositories.snapshots(1))).toBe(true);
    });

    it('reaches the snapshots of every repository from allSnapshots, and nothing else', () => {
        const snapshots = queryKeys.repositories.allSnapshots();
        expect(reaches(snapshots, queryKeys.repositories.snapshots(1))).toBe(true);
        expect(reaches(snapshots, queryKeys.repositories.snapshots(2))).toBe(true);
        expect(reaches(snapshots, queryKeys.repositories.snapshotsOf(2, 'c1'))).toBe(true);
        expect(reaches(snapshots, queryKeys.repositories.list())).toBe(false);
        expect(reaches(snapshots, queryKeys.repositories.status(1))).toBe(false);
    });

    it('keeps one client apart from another', () => {
        const other = '22222222-2222-4222-8222-222222222222';
        expect(reaches(queryKeys.clients.jobs(CLIENT), queryKeys.clients.jobs(other))).toBe(false);
    });

    it('keeps one directory apart from another', () => {
        expect(reaches(queryKeys.clients.fs(CLIENT, '/home'), queryKeys.clients.fs(CLIENT, '/etc'))).toBe(false);
    });

    it('reaches the snapshots of one backup id from those of its repository, and of no other', () => {
        expect(reaches(queryKeys.repositories.snapshots(1), queryKeys.repositories.snapshotsOf(1, 'c1'))).toBe(true);
        expect(reaches(queryKeys.repositories.snapshots(2), queryKeys.repositories.snapshotsOf(1, 'c1'))).toBe(false);
    });

    it('addresses a repository the same by its number and by the id in the URL', () => {
        expect(queryKeys.repositories.status(7)).toEqual(queryKeys.repositories.status('7'));
        expect(queryKeys.repositories.snapshots(7)).toEqual(queryKeys.repositories.snapshots('7'));
    });

    it('does not reach the seen state or the latest runs from the history list', () => {
        const list = queryKeys.history.list({ page: 1, pageSize: 20 });
        expect(reaches(list, queryKeys.history.seen())).toBe(false);
        expect(reaches(list, queryKeys.history.latest())).toBe(false);
    });

    it('reaches every page and filter of the history from the lists, and nothing beside them', () => {
        const lists = queryKeys.history.lists();
        expect(reaches(lists, queryKeys.history.list({ page: 1, pageSize: 20 }))).toBe(true);
        expect(reaches(lists, queryKeys.history.list({ page: 3, pageSize: 50, status: 'failed' }))).toBe(true);
        expect(reaches(lists, queryKeys.history.seen())).toBe(false);
        expect(reaches(lists, queryKeys.history.latest())).toBe(false);
    });
});

/**
 * What the socket handler relies on: an update is written with a function that receives
 * what is cached, and an entry that was never read is not created by it.
 */
describe('an update to an entry that was never read', () => {
    let queryClient: QueryClient;
    const key = queryKeys.clients.jobs(CLIENT);

    beforeEach(() => {
        queryClient = new QueryClient();
    });

    it('creates no entry', () => {
        queryClient.setQueryData<string[]>(key, (jobs) => jobs && [...jobs, 'job-1']);
        expect(queryClient.getQueryData(key)).toBeUndefined();
        expect(queryClient.getQueryCache().find({ queryKey: key })).toBeUndefined();
    });

    it('changes one that was', () => {
        queryClient.setQueryData<string[]>(key, []);
        queryClient.setQueryData<string[]>(key, (jobs) => jobs && [...jobs, 'job-1']);
        expect(queryClient.getQueryData(key)).toEqual(['job-1']);
    });
});
