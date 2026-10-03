import { useCallback, useMemo } from 'react';
import { queryOptions, useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
    ClientHistorySchema,
    ClientJobListSchema,
    type BackupJob,
    type HistoryEntry,
    type ManagedRepository,
    type Snapshot,
} from '@pbcm/shared';
import { api } from '../lib/api';
import { SessionExpiredError } from '../lib/apiFetch';
import { recentRuns } from '../lib/cacheUpdates';
import { queryKeys } from '../lib/queryKeys';
import { repositorySnapshotsOptions } from './repositories';

const NO_RUNS: HistoryEntry[] = [];
const NO_JOBS: BackupJob[] = [];

/**
 * The list, or an empty one when the request is refused -- an offline client answers its
 * history and its jobs with an error, and the page then shows it without either rather
 * than failing as a whole. An expired session is not that case and is passed on.
 */
async function listOrEmpty<T>(request: Promise<T[]>): Promise<T[]> {
    try {
        return await request;
    } catch (e) {
        if (e instanceof SessionExpiredError) throw e;
        return [];
    }
}

/** A client's runs, newest first. `JOB_UPDATE` takes each status update into it. */
export const clientHistoryOptions = (clientId: string) =>
    queryOptions({
        queryKey: queryKeys.clients.history(clientId),
        queryFn: () => listOrEmpty(api.get(`/api/v1/clients/${clientId}/history`, ClientHistorySchema)),
    });

/**
 * A client's configured jobs, as its agent reports them. `JOBS_UPDATE` replaces the list
 * when the client connects, drops or changes a job -- which is also what fills in the
 * empty answer an offline client gave.
 */
export const clientJobsOptions = (clientId: string) =>
    queryOptions({
        queryKey: queryKeys.clients.jobs(clientId),
        queryFn: (): Promise<BackupJob[]> =>
            listOrEmpty(api.get(`/api/v1/clients/${clientId}/jobs`, ClientJobListSchema)),
    });

/**
 * The history, and the part of it the job tab shows: the last 24 hours. The window is cut
 * at the moment the entry last changed -- by a fetch or by a run's update -- not on a
 * timer, so a row leaves it with the next update. That moment is the cache's own
 * `dataUpdatedAt`, which also keeps the clock out of the render.
 */
export function useClientHistory(clientId: string) {
    const { data: history = NO_RUNS, dataUpdatedAt } = useQuery(clientHistoryOptions(clientId));
    const lastHistory = useMemo(() => recentRuns(history, dataUpdatedAt), [history, dataUpdatedAt]);
    return { history, lastHistory };
}

export function useClientJobs(clientId: string) {
    const { data: jobs = NO_JOBS } = useQuery(clientJobsOptions(clientId));
    return { jobs };
}

/**
 * The snapshot endpoint is per repository, so the repository a snapshot came from
 * is only known while fetching. We attach it here; the restore editor needs it and
 * would otherwise have to look it up again from the id.
 */
export type SnapshotWithRepository = Snapshot & { repository: ManagedRepository };

/**
 * A client's snapshots across every repository, newest first.
 *
 * Each repository answers on its own, into the same cache entry its own page reads. One
 * that fails is named in `error` rather than turned into an empty list, so a partial list
 * does not pass for the complete one without a word.
 */
export function useClientSnapshots(clientId: string, repositories: ManagedRepository[]) {
    // Stable for as long as its inputs are: `useQueries` runs `combine` again only when
    // it or a result changes.
    const combine = useCallback(
        (results: UseQueryResult<Snapshot[]>[]) => {
            const failed = repositories.filter((_, i) => results[i]?.isError);
            const snapshots = results
                .flatMap((result, i): SnapshotWithRepository[] =>
                    (result.data ?? [])
                        .filter((s) => s.backupId === clientId)
                        .map((s) => ({ ...s, repository: repositories[i] })),
                )
                .sort((a, b) => b.backupTime - a.backupTime);
            return {
                snapshots,
                error:
                    failed.length > 0
                        ? `Could not read the snapshots of ${failed.map((r) => `${r.baseUrl}:${r.datastore}`).join(', ')}.`
                        : null,
            };
        },
        [clientId, repositories],
    );

    return useQueries({
        queries: repositories.map((repo) => repositorySnapshotsOptions(repo.id)),
        combine,
    });
}
