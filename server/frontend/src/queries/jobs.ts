import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GlobalHistorySchema, GlobalJobListSchema, type BackupJob } from '@pbcm/shared';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import type { GlobalJob, SessionHistoryItem } from '../lib/cacheUpdates';
import { forgetJobRunAsked, markJobRunAsked } from '../hooks/useJobResultToasts';

const NO_JOBS: GlobalJob[] = [];
const NO_RUNS: SessionHistoryItem[] = [];

/**
 * Every client's jobs, flattened. Never stale by age: `JOBS_UPDATE` replaces a client's
 * jobs whenever it connects, drops or changes them, and `JOB_NEXT_RUN_UPDATE` moves a
 * single job's next run.
 */
export const globalJobsOptions = queryOptions({
    queryKey: queryKeys.jobs.list(),
    queryFn: async (): Promise<GlobalJob[]> => {
        const perClient = await api.get('/api/v1/jobs', GlobalJobListSchema, { fallback: 'Failed to fetch jobs' });
        return perClient.flatMap(({ clientId, jobs }) => jobs.map((job) => ({ ...job, clientId })));
    },
    staleTime: Infinity,
});

/** The newest run of every job, newest first. Kept current by `JOB_UPDATE`. */
export const latestPerJobOptions = queryOptions({
    queryKey: queryKeys.history.latest(),
    queryFn: (): Promise<SessionHistoryItem[]> =>
        api.get('/api/v1/history/latest', GlobalHistorySchema, { fallback: 'Failed to fetch history' }),
    staleTime: Infinity,
});

/**
 * `isPending` is true until the list has answered once, also with an error: only then is
 * a job that is not in it really gone.
 */
export function useGlobalJobs() {
    const { data = NO_JOBS, isPending, error } = useQuery(globalJobsOptions);
    return { jobs: data, isPending, error };
}

export function useLatestPerJob() {
    const { data = NO_RUNS, isPending, error } = useQuery(latestPerJobOptions);
    return { latestPerJob: data, isPending, error };
}

interface JobRef {
    clientId: string;
    jobId: string;
}

/**
 * Starts a job now. The one place this is done: the client page and the list across all
 * clients used to carry a copy each, and only one of them told the toasts to expect a result.
 */
export function useTriggerJob() {
    return useMutation({
        mutationFn: ({ clientId, jobId }: JobRef) =>
            api.post(`/api/v1/clients/${clientId}/jobs/${jobId}/run`, undefined, undefined, {
                fallback: 'Failed to trigger job',
            }),
        // Before the request: a run that is skipped at once can report before it returns.
        onMutate: ({ clientId, jobId }) => markJobRunAsked(clientId, jobId),
        onError: (_error, { clientId, jobId }) => forgetJobRunAsked(clientId, jobId),
    });
}

/** Deletes a job on its client. The row leaves both job lists once the server confirmed it. */
export function useDeleteJob() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ clientId, jobId }: JobRef) =>
            api.delete(`/api/v1/clients/${clientId}/jobs/${jobId}`, { fallback: 'Failed to delete job' }),
        onSuccess: (_, { clientId, jobId }) => {
            queryClient.setQueryData(globalJobsOptions.queryKey, (jobs) =>
                jobs?.filter((j) => !(j.clientId === clientId && j.id === jobId)),
            );
            queryClient.setQueryData<BackupJob[]>(queryKeys.clients.jobs(clientId), (jobs) =>
                jobs?.filter((j) => j.id !== jobId),
            );
        },
    });
}
