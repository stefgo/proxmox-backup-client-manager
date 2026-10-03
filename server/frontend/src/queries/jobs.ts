import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    GeneratedEncryptionKeySchema,
    GlobalHistorySchema,
    GlobalJobListSchema,
    type BackupJob,
    type BackupJobSchema,
    type RestoreRequest,
} from '@pbcm/shared';
import type { z } from 'zod';
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

/**
 * Starts a restore on a client. Nothing to invalidate: the run reports itself over the
 * socket, like one the scheduler started.
 */
export function useStartRestore() {
    return useMutation({
        mutationFn: ({ clientId, request }: { clientId: string; request: RestoreRequest }) =>
            api.post(`/api/v1/clients/${clientId}/restore`, request, undefined, {
                fallback: 'Failed to start the restore',
            }),
    });
}

/**
 * Asks a client's agent to end a run that is under way. Nothing is written into the cache:
 * the run ends through its own `JOB_UPDATE`, as every run does.
 */
export function useAbortRun() {
    return useMutation({
        mutationFn: ({ clientId, runId }: { clientId: string; runId: string }) =>
            api.post(`/api/v1/clients/${clientId}/runs/${runId}/abort`, undefined, undefined, {
                fallback: 'Failed to abort the run',
            }),
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

/**
 * Creates a job on a client, or changes the one the request names by its id. Both job
 * lists read the cache and neither is mounted while the editor is; invalidating them here
 * is what makes the saved job visible on arrival.
 */
export function useSaveJob() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ clientId, job }: { clientId: string; job: z.input<typeof BackupJobSchema> }) =>
            api.post(`/api/v1/clients/${clientId}/jobs`, job, undefined, { fallback: 'Failed to save job' }),
        onSuccess: (_, { clientId }) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.list() });
            void queryClient.invalidateQueries({ queryKey: queryKeys.clients.jobs(clientId) });
        },
    });
}

/**
 * Has the client's agent make an encryption key. Not cached: the answer is the one moment
 * the key is in the browser, and the job editor holds it until the job is saved.
 */
export const generateEncryptionKey = (clientId: string) =>
    api.post(`/api/v1/clients/${clientId}/key`, {}, GeneratedEncryptionKeySchema);
