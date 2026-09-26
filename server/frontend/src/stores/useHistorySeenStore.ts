import { create } from 'zustand';
import { HistorySeen } from '@pbcm/shared';
import { apiFetch } from '../lib/apiFetch';

interface HistorySeenState {
    /** When this user last opened the history, by the server's record; null if never. */
    seenAt: string | null;
    /**
     * Failed runs since then. The server's count, raised by the failures that arrive over
     * the socket afterwards -- a failure the server had already counted and an agent syncs
     * again can raise it twice, which is harmless: only "above zero" is shown.
     */
    unseenFailed: number;
    fetchSeen: () => Promise<void>;
    markSeen: () => Promise<void>;
    /** The server's answer, from a fetch, a PUT or another tab's `HISTORY_SEEN`. */
    applySeen: (state: HistorySeen) => void;
    noteFailure: (endTime: string) => void;
}

/**
 * Whether failures happened that this user has not looked at yet -- what the dot on
 * "History" in the sidebar shows. The record lives on the server (`/api/v1/history/seen`),
 * so it follows the user to another browser and survives a reload.
 */
export const useHistorySeenStore = create<HistorySeenState>((set, get) => ({
    seenAt: null,
    unseenFailed: 0,

    // A failure here leaves the dot off rather than reporting: the dot is a hint, and the
    // history page itself still shows every failure.
    fetchSeen: async () => {
        try {
            const res = await apiFetch('/api/v1/history/seen');
            if (res.ok) get().applySeen(await res.json());
        } catch (e) {
            console.error('Failed to fetch the history seen state', e);
        }
    },

    markSeen: async () => {
        // Cleared at once: the page is open, so its failures are in view whatever the
        // request makes of it.
        set({ unseenFailed: 0 });
        try {
            const res = await apiFetch('/api/v1/history/seen', { method: 'PUT' });
            if (res.ok) get().applySeen(await res.json());
        } catch (e) {
            console.error('Failed to mark the history as seen', e);
        }
    },

    applySeen: ({ seenAt, unseenFailed }) => set({ seenAt, unseenFailed }),

    noteFailure: (endTime) => {
        const { seenAt } = get();
        if (seenAt !== null && endTime <= seenAt) return;
        set((s) => ({ unseenFailed: s.unseenFailed + 1 }));
    },
}));
