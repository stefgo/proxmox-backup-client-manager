import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { WebhookListSchema, WebhookTestResultSchema, type Webhook, type WebhookInput } from '@pbcm/shared';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';

const NO_WEBHOOKS: Webhook[] = [];

/**
 * The webhooks the server reports runs and client connections to, with their last delivery.
 *
 * `WEBHOOKS_UPDATE` carries no payload: it says the list changed -- a webhook was saved or a
 * delivery went out -- and the entry is invalidated. The list is short, and a fetch is the
 * one way the page and the editor cannot disagree about what the server holds.
 */
export const webhookListOptions = queryOptions({
    queryKey: queryKeys.webhooks.list(),
    queryFn: () => api.get('/api/v1/webhooks', WebhookListSchema, { fallback: 'Failed to fetch webhooks' }),
});

/** `isPending` until the list has arrived once; an empty list before that says nothing. */
export function useWebhooks() {
    const { data = NO_WEBHOOKS, isPending, error } = useQuery(webhookListOptions);
    return { webhooks: data, isPending, error };
}

/** Creates a webhook, or changes the one `id` names. */
export function useSaveWebhook() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, input }: { id?: string; input: WebhookInput }) =>
            id ? api.put(`/api/v1/webhooks/${id}`, input) : api.post('/api/v1/webhooks', input),
        onSuccess: () => {
            // Not awaited: the list the editor returns to reads it again as it mounts.
            void queryClient.invalidateQueries({ queryKey: webhookListOptions.queryKey });
        },
    });
}

/**
 * Delivers the sample event with the webhook as it stands in the editor, saved or not.
 * Not cached: a delivery is made now or not at all.
 */
export const testWebhook = (input: WebhookInput) =>
    api.post('/api/v1/webhooks/test', input, WebhookTestResultSchema);
