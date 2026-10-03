import { describe, expect, it } from 'vitest';
import { canAbortRun } from './runAbort';

describe('canAbortRun', () => {
    it('offers it for a run that is under way', () => {
        expect(canAbortRun({ status: 'running' })).toBe(true);
        expect(canAbortRun({ status: 'running', phase: null })).toBe(true);
    });

    it('offers it for a run queued behind another one of its job', () => {
        expect(canAbortRun({ status: 'queued' })).toBe(true);
    });

    it('does not offer it while the run reads back its snapshot: the backup is done', () => {
        expect(canAbortRun({ status: 'running', phase: 'snapshot' })).toBe(false);
    });

    it('does not offer it for a run that is over', () => {
        for (const status of ['success', 'failed', 'abort', 'skipped']) {
            expect(canAbortRun({ status })).toBe(false);
        }
    });
});
