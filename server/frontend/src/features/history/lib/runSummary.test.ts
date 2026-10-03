import { describe, expect, it } from 'vitest';
import { JOB_STATUS, type RunSnapshotDetails } from '@pbcm/shared';
import { runSummary, type RunSummaryInput } from './runSummary';

const details = (size?: number): RunSnapshotDetails => ({
    backupType: 'host',
    backupId: 'web01',
    backupTime: 1,
    files: [],
    size,
});

const run = (fields: Partial<RunSummaryInput>): RunSummaryInput => ({
    type: 'backup',
    status: JOB_STATUS.SUCCESS,
    startTime: '2026-10-03 12:00:00',
    endTime: '2026-10-03 12:03:12',
    ...fields,
});

describe('runSummary', () => {
    it('gives a successful backup its duration and its size', () => {
        expect(runSummary(run({ snapshotDetails: details(50 * 1024 ** 3) }))).toEqual({
            duration: '3m 12s',
            size: '50.0 GiB',
        });
    });

    it('gives a run that is still going neither', () => {
        expect(runSummary(run({ status: JOB_STATUS.RUNNING, endTime: null }))).toEqual({
            duration: null,
            size: null,
        });
    });

    it('gives a running run no duration even when an end is already stored', () => {
        // Reading back the snapshot: the CLI has exited, the run has not ended.
        expect(runSummary(run({ status: JOB_STATUS.RUNNING })).duration).toBeNull();
    });

    it('gives a failed run its duration and no size', () => {
        expect(runSummary(run({ status: JOB_STATUS.FAILED, snapshotDetails: details(1024) }))).toEqual({
            duration: '3m 12s',
            size: null,
        });
    });

    it('gives a restore no size', () => {
        expect(runSummary(run({ type: 'restore', snapshotDetails: details(1024) })).size).toBeNull();
    });

    it('gives a backup no size when its snapshot details are missing or carry none', () => {
        expect(runSummary(run({ snapshotDetails: null })).size).toBeNull();
        expect(runSummary(run({})).size).toBeNull();
        expect(runSummary(run({ snapshotDetails: details() })).size).toBeNull();
    });

    it('gives no duration for an end before the start', () => {
        expect(runSummary(run({ endTime: '2026-10-03 11:00:00' })).duration).toBeNull();
    });
});
