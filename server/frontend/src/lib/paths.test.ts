import { describe, expect, it } from 'vitest';
import { matchPath } from 'react-router-dom';
import { ROUTES, paths } from './paths';

const CLIENT = '11111111-1111-4111-8111-111111111111';

describe('ROUTES', () => {
    it('holds every pattern once', () => {
        const patterns = Object.values(ROUTES);
        expect(new Set(patterns).size).toBe(patterns.length);
    });

    it('uses the plural for a list and for what lies below it', () => {
        for (const pattern of Object.values(ROUTES)) {
            expect(pattern).not.toMatch(/^\/(client|repository|job|webhook)(\/|$)/);
        }
    });

    it('has a builder for every pattern that takes a parameter, and for no other', () => {
        const withParameter = Object.entries(ROUTES)
            .filter(([, pattern]) => pattern.includes(':'))
            .map(([name]) => name);
        expect(Object.keys(paths).sort()).toEqual(withParameter.sort());
    });
});

describe('paths', () => {
    it('fills in every parameter', () => {
        const built = [
            paths.client(CLIENT),
            paths.clientEdit(CLIENT),
            paths.clientTunnel(CLIENT),
            paths.clientJobNew(CLIENT),
            paths.clientJob(CLIENT, 'job-1'),
            paths.clientRestore(CLIENT, 3, 'host', 1790000000),
            paths.repository(3),
            paths.repositoryEdit(3),
            paths.repositoryRestore(3, 'host', CLIENT, 1790000000),
            paths.job(CLIENT, 'job-1'),
            paths.webhook('hook-1'),
        ];
        for (const path of built) expect(path).not.toContain(':');
    });

    it('builds what its own pattern matches, with the values it was given', () => {
        expect(matchPath(ROUTES.clientJob, paths.clientJob(CLIENT, 'job-1'))?.params).toEqual({
            clientId: CLIENT,
            jobId: 'job-1',
        });
        expect(matchPath(ROUTES.clientRestore, paths.clientRestore(CLIENT, 3, 'host', 1790000000))?.params).toEqual({
            clientId: CLIENT,
            repoId: '3',
            backupType: 'host',
            backupTime: '1790000000',
        });
        expect(
            matchPath(ROUTES.repositoryRestore, paths.repositoryRestore(3, 'host', CLIENT, 1790000000))?.params,
        ).toEqual({ repoId: '3', backupType: 'host', backupId: CLIENT, backupTime: '1790000000' });
    });

    it('takes a numeric repository id', () => {
        expect(paths.repository(7)).toBe('/repositories/7');
        expect(paths.repositoryEdit('7')).toBe('/repositories/7/edit');
    });

    it('keeps the two job editor families apart', () => {
        expect(paths.clientJob(CLIENT, 'job-1')).toBe(`/clients/${CLIENT}/jobs/job-1`);
        expect(paths.job(CLIENT, 'job-1')).toBe(`/jobs/${CLIENT}/job-1`);
    });

    it('keeps a backup id that needs escaping in one segment', () => {
        // The router decodes the location before it matches, so the id arrives as given.
        expect(paths.repositoryRestore(3, 'host', 'a b/c', 1)).toBe('/repositories/3/restore/host/a%20b%2Fc/1');
    });
});
