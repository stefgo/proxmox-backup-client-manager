import { describe, expect, it, vi } from 'vitest';
import { createDashboardMessageReader, historyUpdateFrom } from './dashboardMessages';

const tunnelUpdate = JSON.stringify({
    type: 'TUNNEL_UPDATE',
    payload: { clientId: 'c1', status: 'up', activeLeases: 0, forwards: [] },
});

describe('createDashboardMessageReader', () => {
    it('returns a message that matches the contract', () => {
        const report = vi.fn();
        const read = createDashboardMessageReader(report);
        expect(read(tunnelUpdate)).toMatchObject({ type: 'TUNNEL_UPDATE', payload: { clientId: 'c1' } });
        expect(report).not.toHaveBeenCalled();
    });

    it('drops a message whose payload has the wrong shape', () => {
        const report = vi.fn();
        const read = createDashboardMessageReader(report);
        expect(read(JSON.stringify({ type: 'TUNNEL_UPDATE', payload: { clientId: 'c1' } }))).toBeNull();
        expect(report).toHaveBeenCalledTimes(1);
        expect(report.mock.calls[0][0]).toContain('TUNNEL_UPDATE');
    });

    it('drops a type it does not know and names it', () => {
        const report = vi.fn();
        const read = createDashboardMessageReader(report);
        expect(read(JSON.stringify({ type: 'FROM_A_NEWER_SERVER', payload: 1 }))).toBeNull();
        expect(report.mock.calls[0][0]).toContain('FROM_A_NEWER_SERVER');
    });

    it('drops what is not JSON', () => {
        const report = vi.fn();
        const read = createDashboardMessageReader(report);
        expect(read('{')).toBeNull();
        expect(report).toHaveBeenCalledTimes(1);
    });

    it('drops JSON that is not a message at all', () => {
        const report = vi.fn();
        const read = createDashboardMessageReader(report);
        expect(read('null')).toBeNull();
        expect(read('"CLIENTS_UPDATE"')).toBeNull();
        // Both are "(no type)", so the second is not reported again.
        expect(report).toHaveBeenCalledTimes(1);
    });

    // A broken LOG_UPDATE arrives many times a second.
    it('reports a broken type once, and another type on its own', () => {
        const report = vi.fn();
        const read = createDashboardMessageReader(report);
        const broken = JSON.stringify({ type: 'LOG_UPDATE', payload: {} });
        read(broken);
        read(broken);
        read(broken);
        expect(report).toHaveBeenCalledTimes(1);

        read(JSON.stringify({ type: 'JOB_UPDATE', payload: {} }));
        expect(report).toHaveBeenCalledTimes(2);
    });

    it('keeps reading valid messages of a type after a broken one', () => {
        const read = createDashboardMessageReader(vi.fn());
        expect(read(JSON.stringify({ type: 'TUNNEL_UPDATE' }))).toBeNull();
        expect(read(tunnelUpdate)).not.toBeNull();
    });
});

describe('historyUpdateFrom', () => {
    const running = {
        id: 'run-1',
        jobId: 'job-1',
        name: 'Daily /home',
        status: 'running',
        type: 'backup',
        startTime: '2026-10-03T02:00:00.000Z',
    };

    it('names the job the way a history row does', () => {
        expect(historyUpdateFrom(running)).toMatchObject({ jobId: 'job-1', jobConfigId: 'job-1' });
    });

    it('says null where a running job has nothing to report yet', () => {
        expect(historyUpdateFrom(running)).toMatchObject({
            endTime: null,
            exitCode: null,
            stdout: null,
            stderr: null,
        });
    });

    it('keeps what a finished job reports', () => {
        const finished = {
            ...running,
            status: 'failed',
            endTime: '2026-10-03T02:10:00.000Z',
            exitCode: 255,
            stderr: 'connection refused',
            error: 'backup failed',
        };
        expect(historyUpdateFrom(finished)).toMatchObject({
            endTime: '2026-10-03T02:10:00.000Z',
            exitCode: 255,
            stderr: 'connection refused',
            error: 'backup failed',
        });
    });

    // An exit code of 0 is a value, not a missing one.
    it('keeps an exit code of zero', () => {
        expect(historyUpdateFrom({ ...running, exitCode: 0 }).exitCode).toBe(0);
    });

    it('belongs to no job when the run carries no job id', () => {
        const { jobId: _jobId, ...restore } = running;
        expect(historyUpdateFrom(restore).jobConfigId).toBeNull();
    });
});
