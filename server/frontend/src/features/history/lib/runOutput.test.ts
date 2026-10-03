import { describe, expect, it } from 'vitest';
import { JOB_STATUS } from '@pbcm/shared';
import { runOutput, type RunOutputInput } from './runOutput';

const run = (fields: Partial<RunOutputInput>): RunOutputInput => ({
    type: 'backup',
    status: JOB_STATUS.SUCCESS,
    ...fields,
});

describe('runOutput', () => {
    it('shows the live lines of a running run, joined as they came', () => {
        expect(runOutput(run({ status: JOB_STATUS.RUNNING }), ['one\n', 'two'])).toEqual({
            kind: 'live',
            text: 'one\ntwo',
        });
    });

    it('says a running run without output is waiting, not that it has none', () => {
        expect(runOutput(run({ status: JOB_STATUS.RUNNING }), undefined)).toEqual({ kind: 'waiting' });
        expect(runOutput(run({ status: JOB_STATUS.RUNNING }), [])).toEqual({ kind: 'waiting' });
    });

    it('shows what a running run has stored when no live line has arrived', () => {
        expect(runOutput(run({ status: JOB_STATUS.RUNNING, stdout: 'so far\n' }), [])).toEqual({
            kind: 'log',
            text: 'so far',
            failed: false,
        });
    });

    it('says an ended run without output has none', () => {
        expect(runOutput(run({}), undefined)).toEqual({ kind: 'none' });
        expect(runOutput(run({ status: JOB_STATUS.FAILED }), undefined)).toEqual({ kind: 'none' });
    });

    it('ignores live lines once the run has ended', () => {
        expect(runOutput(run({ stdout: 'done' }), ['live'])).toEqual({
            kind: 'log',
            text: 'done',
            failed: false,
        });
    });

    it('marks the log of a failed run as the reason, error before stderr before stdout', () => {
        expect(
            runOutput(run({ status: JOB_STATUS.FAILED, error: 'refused', stderr: 'err', stdout: 'out' }), undefined),
        ).toEqual({ kind: 'log', text: 'refused', failed: true });
        expect(runOutput(run({ status: JOB_STATUS.FAILED, stderr: 'err', stdout: 'out' }), undefined)).toEqual({
            kind: 'log',
            text: 'err',
            failed: true,
        });
    });

    it('does not mark a failed run that only has stdout', () => {
        expect(runOutput(run({ status: JOB_STATUS.FAILED, stdout: 'out' }), undefined)).toEqual({
            kind: 'log',
            text: 'out',
            failed: false,
        });
    });

    it('puts the snapshot of a successful backup below the output', () => {
        expect(runOutput(run({ stdout: 'out\n', snapshot: 'host/web01/2026-10-03T10:00:00Z' }), undefined)).toEqual({
            kind: 'log',
            text: 'out\nReading Snapshot host/web01/2026-10-03T10:00:00Z',
            failed: false,
        });
    });

    it('leaves the snapshot out for a restore and for a backup that failed', () => {
        expect(runOutput(run({ type: 'restore', snapshot: 'host/web01/x' }), undefined)).toEqual({ kind: 'none' });
        expect(runOutput(run({ status: JOB_STATUS.FAILED, snapshot: 'host/web01/x' }), undefined)).toEqual({
            kind: 'none',
        });
    });
});
