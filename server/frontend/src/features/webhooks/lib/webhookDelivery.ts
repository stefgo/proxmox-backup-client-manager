import type { Webhook } from '@pbcm/shared';
import type { BadgeProps } from '@stefgo/react-ui-components';

type Delivery = Pick<Webhook, 'lastAttemptAt' | 'lastStatus' | 'lastError'>;

/** Whether the last delivery failed. An error that is recorded counts, even an empty one. */
export const deliveryFailed = (webhook: Delivery): boolean => webhook.lastError !== null;

/**
 * How the last delivery went, as a badge: the answer's status, "Failed" when nothing
 * answered, "Never sent" before the first attempt. The list and the editor read it here,
 * so they cannot disagree about which delivery failed.
 */
export const deliveryBadge = (
    webhook: Delivery,
): { label: string; variant: NonNullable<BadgeProps['variant']> } => {
    if (!webhook.lastAttemptAt) return { label: 'Never sent', variant: 'neutral' };
    return {
        label: webhook.lastStatus !== null ? `HTTP ${webhook.lastStatus}` : 'Failed',
        variant: deliveryFailed(webhook) ? 'error' : 'success',
    };
};
