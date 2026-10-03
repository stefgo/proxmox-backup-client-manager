import {
    keepPreviousData,
    queryOptions,
    useMutation,
    useQuery,
    useQueryClient,
    type QueryClient,
} from '@tanstack/react-query';
import { GlobalHistoryPageSchema, HistorySeenSchema, type HistorySeen } from '@pbcm/shared';
import { api } from '../lib/api';
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
 * What this user has yet to mark as seen -- the number on the dashboard's card and the dot
 * on "History" in the sidebar. The record lives on the server (`/api/v1/history/seen`), so
 * it follows the user to another browser and survives a reload.
 *
 * Never stale by age: a run that fails or is missed invalidates it, a mark is answered
 * with the new state, and `HISTORY_SEEN` brings what another tab of the same user did.
 */
export const historySeenOptions = queryOptions({
    queryKey: queryKeys.history.seen(),
    queryFn: () => api.get('/api/v1/history/seen', HistorySeenSchema),
    staleTime: Infinity,
});

export interface UnseenCounts {
    failed: number;
    missed: number;
}

const unseenCounts = (seen: HistorySeen): UnseenCounts => ({ failed: seen.unseenFailed, missed: seen.unseenMissed });

/** `isPending` until the server has answered; a card would otherwise say "0" for "not known yet". */
export function useUnseen() {
    const { data, isPending, error } = useQuery({ ...historySeenOptions, select: unseenCounts });
    return { unseen: data, isPending, error };
}

/**
 * A run failed or was missed, so there is one more to mark as seen. Asked rather than
 * counted here: an agent that reconnects sends a run again, and a count kept in the
 * browser would then say two for what the server holds as one. Called from the socket's
 * side, outside React's render.
 */
export function refreshUnseen(): void {
    void queryClient.invalidateQueries({ queryKey: historySeenOptions.queryKey }, { cancelRefetch: false });
}

/** The server's answer to a mark is the new state; the lists hold `unseen` per run and are read again. */
function seenChanged(client: QueryClient, seen: HistorySeen): void {
    client.setQueryData(historySeenOptions.queryKey, seen);
    void client.invalidateQueries({ queryKey: queryKeys.history.lists() });
}

/** Marks one run as seen for this user. */
export function useMarkRunSeen() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: (runId: string) =>
            api.put(`/api/v1/history/${encodeURIComponent(runId)}/seen`, undefined, HistorySeenSchema),
        onSuccess: (seen) => seenChanged(client, seen),
    });
}

/** Marks everything that has happened up to now as seen for this user. */
export function useMarkAllSeen() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: () => api.put('/api/v1/history/seen', undefined, HistorySeenSchema),
        onSuccess: (seen) => seenChanged(client, seen),
    });
}
