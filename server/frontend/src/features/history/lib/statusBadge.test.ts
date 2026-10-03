import { describe, expect, it } from 'vitest';
import { JOB_STATUS } from '@pbcm/shared';
import { statusBadgeVariant } from './statusBadge';

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
