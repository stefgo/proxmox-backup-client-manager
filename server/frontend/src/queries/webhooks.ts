import { queryOptions, useQuery } from '@tanstack/react-query';
import { WebhookListSchema, type Webhook } from '@pbcm/shared';
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
