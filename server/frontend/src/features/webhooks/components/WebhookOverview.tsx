import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Webhook } from '@pbcm/shared';
import { useConfirm } from '@stefgo/react-ui-components';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { useWebhooks, webhookListOptions } from '../../../queries/webhooks';
import { describeDeleteWebhook } from '../confirmations';
import { ROUTES, paths } from '../../../lib/paths';
import { WebhookList } from './WebhookList';

/** The webhook list. Adding and editing happen on pages of their own, below it. */
export const WebhookOverview = () => {
    const navigate = useNavigate();
    const { search } = useLocation();
    const { confirm } = useConfirm();
    // Kept current by WEBHOOKS_UPDATE, which invalidates the list.
    const { webhooks, isPending } = useWebhooks();
    const queryClient = useQueryClient();
    /** Resolves once the list has been read again. */
    const reload = () => queryClient.invalidateQueries({ queryKey: webhookListOptions.queryKey });
    /** The switch moves at once, before the server has answered. */
    const [pendingEnabled, setPendingEnabled] = useState<Record<string, boolean>>({});

    // The editor closes onto this list; the query goes along so the search is still there.
    const open = (pathname: string) => navigate({ pathname, search });

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
                onAdd={() => open(ROUTES.webhookNew)}
                onEdit={(webhook) => open(paths.webhook(webhook.id))}
                onDelete={requestDelete}
                onToggleEnabled={toggleEnabled}
            />
        </div>
    );
};
