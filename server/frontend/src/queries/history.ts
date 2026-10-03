import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query';
import { GlobalHistoryPageSchema, HistorySeenSchema, type HistorySeen } from '@pbcm/shared';
import { api } from '../lib/api';
import { noteFailure } from '../lib/cacheUpdates';
import { queryClient } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';
import { historyQueryString, type HistoryView } from '../features/history/lib/historyView';

/**
 * One page of the runs of every client, newest first, and how many the filter matches in
 * all. The server filters and pages; the browser holds the rows on screen and no more.
 *
 * Always stale, so the page reads it again each time it is opened. While it is open, a
 * `JOB_UPDATE` marks every page stale -- a list in pages cannot be patched in place: a new
 * run moves every row one down, and whether it belongs to the filter is the server's call.
 *
 * The page before stays on screen while the next one loads, so paging does not flash the
 * loading state between two full lists.
 */
export const globalHistoryOptions = (view: HistoryView) =>
    queryOptions({
        queryKey: queryKeys.history.list(view),
        queryFn: () => api.get(`/api/v1/history?${historyQueryString(view)}`, GlobalHistoryPageSchema),
        staleTime: 0,
        placeholderData: keepPreviousData,
    });

export function useGlobalHistory(view: HistoryView) {
    return useQuery(globalHistoryOptions(view));
}

/**
 * Whether failures happened that this user has not looked at yet -- what the dot on
 * "History" in the sidebar shows. The record lives on the server (`/api/v1/history/seen`),
 * so it follows the user to another browser and survives a reload.
 *
 * Never stale by age: this tab raises the count itself as failures arrive, and
 * `HISTORY_SEEN` brings what another tab of the same user did.
 */
export const historySeenOptions = queryOptions({
    queryKey: queryKeys.history.seen(),
    queryFn: () => api.get('/api/v1/history/seen', HistorySeenSchema),
    staleTime: Infinity,
});

/** Before the server has answered: never opened, nothing counted. */
const NOTHING_SEEN: HistorySeen = { seenAt: null, unseenFailed: 0 };

/**
 * A failed read leaves the dot off rather than reporting: the dot is a hint, and the
 * history page itself still shows every failure.
 */
export function useUnseenFailures(): boolean {
    return useQuery({ ...historySeenOptions, select: (seen) => seen.unseenFailed > 0 }).data ?? false;
}

/** A run failed at `endTime`. Called from the socket's side, outside React's render. */
export function noteHistoryFailure(endTime: string): void {
    queryClient.setQueryData(historySeenOptions.queryKey, (seen) => noteFailure(seen ?? NOTHING_SEEN, endTime));
}

/**
 * The history is on screen. A plain function rather than a mutation hook: the page calls
 * it on the way in and again on the way out, when no component is left to own one.
 */
export async function markHistorySeen(): Promise<void> {
    const key = historySeenOptions.queryKey;
    // Cleared at once: the page is open, so its failures are in view whatever the
    // request makes of it.
    queryClient.setQueryData(key, (seen) => ({ ...(seen ?? NOTHING_SEEN), unseenFailed: 0 }));
    try {
        queryClient.setQueryData(key, await api.put('/api/v1/history/seen', undefined, HistorySeenSchema));
    } catch (e) {
        console.error('Failed to mark the history as seen', e);
    }
}
