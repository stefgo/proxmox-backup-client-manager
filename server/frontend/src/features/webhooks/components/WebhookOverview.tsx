import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Webhook } from '@pbcm/shared';
import { useConfirm } from '@stefgo/react-ui-components';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { useWebhooks, webhookListOptions } from '../../../queries/webhooks';
import { describeDeleteWebhook } from '../confirmations';
import { WebhookList } from './WebhookList';

/** The page at `/webhooks`. Adding and editing happen on pages of their own. */
export const WebhookOverview = () => {
    const navigate = useNavigate();
    const { pathname, search } = useLocation();
    const { confirm } = useConfirm();
    // Kept current by WEBHOOKS_UPDATE, which invalidates the list.
    const { webhooks, isPending } = useWebhooks();
    const queryClient = useQueryClient();
    /** Resolves once the list has been read again. */
    const reload = () => queryClient.invalidateQueries({ queryKey: webhookListOptions.queryKey });
    /** The switch moves at once, before the server has answered. */
    const [pendingEnabled, setPendingEnabled] = useState<Record<string, boolean>>({});

    // The editor goes back to where it was opened from, search included.
    const open = (to: string) => navigate(to, { state: { from: pathname + search } });

    const requestDelete = (webhook: Webhook) =>
        confirm({
            ...describeDeleteWebhook(webhook.name),
            onConfirm: async () => {
                await api.delete(`/api/v1/webhooks/${webhook.id}`, { fallback: 'Failed to delete the webhook' });
                await reload();
            },
        });

    // The reload afterwards shows what the server holds, which puts the switch back if the
    // change was refused. PUT takes the whole webhook, so the row is sent as is.
    const toggleEnabled = async (webhook: Webhook, enabled: boolean) => {
        setPendingEnabled((p) => ({ ...p, [webhook.id]: enabled }));
        try {
            await api.put(`/api/v1/webhooks/${webhook.id}`, { ...webhook, enabled });
        } catch (e) {
            console.error(e);
        } finally {
            await reload();
            setPendingEnabled((p) => {
                const next = { ...p };
                delete next[webhook.id];
                return next;
            });
        }
    };

    const shown = webhooks.map((w) => (w.id in pendingEnabled ? { ...w, enabled: pendingEnabled[w.id] } : w));

    return (
        <div className="space-y-6">
            <WebhookList
                webhooks={shown}
                isLoading={isPending}
                onAdd={() => open('/webhooks/new')}
                onEdit={(webhook) => open(`/webhooks/${webhook.id}`)}
                onDelete={requestDelete}
                onToggleEnabled={toggleEnabled}
            />
        </div>
    );
};
