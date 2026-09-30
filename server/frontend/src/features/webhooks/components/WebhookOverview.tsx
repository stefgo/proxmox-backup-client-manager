import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Webhook } from '@pbcm/shared';
import { useConfirm } from '@stefgo/react-ui-components';
import { apiFetch } from '../../../lib/apiFetch';
import { useWebhookStore } from '../../../stores/useWebhookStore';
import { describeDeleteWebhook } from '../confirmations';
import { useClientName } from '../lib/useClientName';
import { WebhookList } from './WebhookList';

/** The page at `/webhooks`. Adding and editing happen on pages of their own. */
export const WebhookOverview = () => {
    const navigate = useNavigate();
    const { pathname, search } = useLocation();
    const { confirm } = useConfirm();
    const { webhooks, loaded, fetchWebhooks } = useWebhookStore();
    const clientName = useClientName();
    /** The switch moves at once, before the server has answered. */
    const [pendingEnabled, setPendingEnabled] = useState<Record<string, boolean>>({});

    // Kept current by WEBHOOKS_UPDATE from here on.
    useEffect(() => {
        fetchWebhooks();
    }, [fetchWebhooks]);

    // The editor goes back to where it was opened from, search included.
    const open = (to: string) => navigate(to, { state: { from: pathname + search } });

    const requestDelete = (webhook: Webhook) =>
        confirm({
            ...describeDeleteWebhook(webhook.name),
            onConfirm: async () => {
                const res = await apiFetch(`/api/v1/webhooks/${webhook.id}`, { method: 'DELETE' });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || 'Failed to delete the webhook');
                }
                await fetchWebhooks();
            },
        });

    // The reload afterwards shows what the server holds, which puts the switch back if the
    // change was refused. PUT takes the whole webhook, so the row is sent as is.
    const toggleEnabled = async (webhook: Webhook, enabled: boolean) => {
        setPendingEnabled((p) => ({ ...p, [webhook.id]: enabled }));
        try {
            const res = await apiFetch(`/api/v1/webhooks/${webhook.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...webhook, enabled }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                console.error(data.error || `The server answered ${res.status}`);
            }
        } catch (e) {
            console.error(e);
        } finally {
            await fetchWebhooks();
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
                isLoading={!loaded}
                clientName={clientName}
                onAdd={() => open('/webhooks/new')}
                onEdit={(webhook) => open(`/webhooks/${webhook.id}`)}
                onDelete={requestDelete}
                onToggleEnabled={toggleEnabled}
            />
        </div>
    );
};
