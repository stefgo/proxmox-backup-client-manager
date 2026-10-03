import { create } from 'zustand';
import { WebhookListSchema, type Webhook } from '@pbcm/shared';
import { getErrorMessage } from '../utils';
import { api } from '../lib/api';

/**
 * The webhooks the server reports runs and client connections to, with their last delivery.
 *
 * `WEBHOOKS_UPDATE` carries no payload: it says the list changed -- a webhook was saved or a
 * delivery went out -- and the store fetches it again. The list is short, and a fetch
 * is the one way the page and the editor cannot disagree about what the server holds.
 */
interface WebhookStoreState {
    webhooks: Webhook[];
    /** Whether the list has arrived once; an empty list before that says nothing. */
    loaded: boolean;
    error: string | null;
    fetchWebhooks: () => Promise<void>;
}

/** Bumped per fetch, so an answer that arrives after a newer one does not overwrite it. */
let latestFetch = 0;

export const useWebhookStore = create<WebhookStoreState>((set) => ({
    webhooks: [],
    loaded: false,
    error: null,

    fetchWebhooks: async () => {
        const fetchId = ++latestFetch;
        try {
            const webhooks = await api.get('/api/v1/webhooks', WebhookListSchema, {
                fallback: 'Failed to fetch webhooks',
            });
            if (fetchId === latestFetch) set({ webhooks, error: null });
        } catch (e: unknown) {
            if (fetchId === latestFetch) set({ error: getErrorMessage(e) });
        } finally {
            if (fetchId === latestFetch) set({ loaded: true });
        }
    },
}));
