import { describe, expect, it } from 'vitest';
import { deliveryBadge, deliveryFailed } from './webhookDelivery';

const AT = '2026-01-01T00:00:00.000Z';

describe('deliveryBadge', () => {
    it('says so when nothing was ever sent', () => {
        expect(deliveryBadge({ lastAttemptAt: null, lastStatus: null, lastError: null })).toEqual({
            label: 'Never sent',
            variant: 'neutral',
        });
    });

    it('shows the status of an answer that was accepted', () => {
        expect(deliveryBadge({ lastAttemptAt: AT, lastStatus: 204, lastError: null })).toEqual({
            label: 'HTTP 204',
            variant: 'success',
        });
    });

    it('shows the status of an answer that was an error', () => {
        expect(deliveryBadge({ lastAttemptAt: AT, lastStatus: 500, lastError: 'HTTP 500' })).toEqual({
            label: 'HTTP 500',
            variant: 'error',
        });
    });

    it('reads "Failed" when nothing answered', () => {
        expect(deliveryBadge({ lastAttemptAt: AT, lastStatus: null, lastError: 'ECONNREFUSED' })).toEqual({
            label: 'Failed',
            variant: 'error',
        });
    });
});

describe('deliveryFailed', () => {
    it('counts an error without a text as a failure', () => {
        expect(deliveryFailed({ lastAttemptAt: AT, lastStatus: null, lastError: '' })).toBe(true);
    });

    it('does not count a delivery without an error', () => {
        expect(deliveryFailed({ lastAttemptAt: AT, lastStatus: 200, lastError: null })).toBe(false);
    });
});
