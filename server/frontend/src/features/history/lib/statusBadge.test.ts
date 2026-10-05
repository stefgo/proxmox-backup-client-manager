import { describe, expect, it } from 'vitest';
import { JOB_PHASE, JOB_STATUS } from '@pbcm/shared';
import { runStatusLabel, statusBadgeVariant } from './statusBadge';

describe('statusBadgeVariant', () => {
    it('marks a failure as an error and a missed schedule as a warning', () => {
        expect(statusBadgeVariant(JOB_STATUS.FAILED)).toBe('error');
        expect(statusBadgeVariant(JOB_STATUS.MISSED)).toBe('warning');
    });

    it('is neutral for a status it does not know', () => {
        expect(statusBadgeVariant(JOB_STATUS.SKIPPED)).toBe('neutral');
        expect(statusBadgeVariant('from-a-newer-agent')).toBe('neutral');
    });
});

describe('runStatusLabel', () => {
    it('names a run by its status, starting with a capital', () => {
        expect(runStatusLabel(JOB_STATUS.SUCCESS)).toBe('Success');
        expect(runStatusLabel(JOB_STATUS.RUNNING)).toBe('Running');
        expect(runStatusLabel(JOB_STATUS.RUNNING, null)).toBe('Running');
    });

    it('capitalises a status it does not know, and leaves an empty one empty', () => {
        expect(runStatusLabel('from-a-newer-agent')).toBe('From-a-newer-agent');
        expect(runStatusLabel('')).toBe('');
    });

    it('says so while a running run reads back its snapshot', () => {
        expect(runStatusLabel(JOB_STATUS.RUNNING, JOB_PHASE.SNAPSHOT)).toBe('Reading snapshot');
    });

    it('keeps the status of a run that is over, whatever phase it ended in', () => {
        expect(runStatusLabel(JOB_STATUS.FAILED, JOB_PHASE.SNAPSHOT)).toBe('Failed');
    });
});
