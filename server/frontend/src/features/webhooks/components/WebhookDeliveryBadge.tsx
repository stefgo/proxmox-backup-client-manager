import type { Webhook } from '@pbcm/shared';
import { Badge } from '@stefgo/react-ui-components';
import { deliveryBadge } from '../lib/webhookDelivery';

/** How a webhook's last delivery went, in the list and in the editor. */
export const WebhookDeliveryBadge = ({ webhook }: { webhook: Webhook }) => {
    const badge = deliveryBadge(webhook);
    return <Badge variant={badge.variant}>{badge.label}</Badge>;
};
