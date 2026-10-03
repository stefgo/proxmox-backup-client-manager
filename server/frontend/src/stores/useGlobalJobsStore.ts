import { create } from 'zustand';
import {
    BackupJob,
    GlobalHistoryEntry,
    GlobalHistoryResponseSchema,
    HistoryEntry,
} from '@pbcm/shared';
import { getErrorMessage } from '../utils';
import { apiFetch } from '../lib/apiFetch';
import { useClientStore } from './useClientStore';

export interface GlobalJob extends BackupJob {
    clientId: string;
}

/**
 * latestPerJob mixes two shapes: rows fetched from GET /api/v1/history/latest and
 * entries pushed over the WebSocket, which arrive in the agent's HistoryEntry form.
 * Both satisfy the list's BaseHistoryItem contract; the one field where they differ
 * and that is read here -- the job's id, jobId vs jobConfigId -- goes through jobIdOf.
 *
 * The list does read hostname/displayName, though (`showClientName`), and only the
 * REST rows carry them -- an agent knows neither. updateSession therefore fills them
 * in from the client store, so a job started here is not labelled "Unknown Client"
 * until the next refetch.
 */
export type SessionHistoryItem =
    | GlobalHistoryEntry
    | (HistoryEntry & {
          clientId: string;
          hostname: string | null;
          displayName: string | null;
      });

/** The job a history row belongs to, null for a row that belongs to none. */
export const jobIdOf = (item: SessionHistoryItem): string | null =>
    'jobId' in item ? item.jobId : item.jobConfigId;

const isSameJob = (a: SessionHistoryItem, b: SessionHistoryItem) =>
    a.clientId === b.clientId && jobIdOf(a) === jobIdOf(b);

const byStartTimeDesc = (a: SessionHistoryItem, b: SessionHistoryItem) =>
    new Date(b.startTime).getTime() - new Date(a.startTime).getTime();

interface GlobalJobsState {
    globalJobs: GlobalJob[];
    /** The newest history row of every job, newest first. */
    latestPerJob: SessionHistoryItem[];
    isLoading: boolean;
    error: string | null;

    fetchAllJobs: () => Promise<void>;
    setClientJobs: (clientId: string, jobs: BackupJob[]) => void;
    updateSession: (clientId: string, job: HistoryEntry) => void;
    updateJobNextRunAt: (
        clientId: string,
        jobId: string,
        nextRunAt: string | null,
    ) => void;
}

export const useGlobalJobsStore = create<GlobalJobsState>((set) => ({
    globalJobs: [],
    latestPerJob: [],
    isLoading: false,
    error: null,

    fetchAllJobs: async () => {
        set({ isLoading: true, error: null });
        try {
            const [jobsRes, historyRes] = await Promise.all([
                apiFetch('/api/v1/jobs'),
                apiFetch('/api/v1/history/latest'),
            ]);

            if (!jobsRes.ok) throw new Error('Failed to fetch jobs');
            if (!historyRes.ok) throw new Error('Failed to fetch history');

            const data: { clientId: string; jobs: BackupJob[] }[] =
                await jobsRes.json();

            // res.json() is any, so the rows are validated here rather than being
            // asserted downstream. A shape change is reported once and degrades to
            // an empty list instead of throwing inside the store.
            const parsedHistory = GlobalHistoryResponseSchema.safeParse(
                await historyRes.json(),
            );
            if (!parsedHistory.success) {
                console.error(
                    'Unexpected /api/v1/history/latest payload:',
                    parsedHistory.error.issues,
                );
            }
            const latestPerJob: GlobalHistoryEntry[] = parsedHistory.success
                ? parsedHistory.data.data
                : [];

            // Flatten the array of { clientId, jobs[] } into GlobalJob[]
            const flattenedJobs: GlobalJob[] = [];
            for (const clientJobs of data) {
                for (const job of clientJobs.jobs) {
                    flattenedJobs.push({
                        ...job,
                        clientId: clientJobs.clientId,
                    });
                }
            }

            set({
                globalJobs: flattenedJobs,
                latestPerJob,
                isLoading: false,
            });
        } catch (e: unknown) {
            set({ error: getErrorMessage(e), isLoading: false });
        }
    },

    /**
     * Replaces one client's jobs, fed by the server's JOBS_UPDATE broadcast.
     *
     * The server caches an agent's jobs only while it is connected, so the list a
     * dashboard fetched on mount goes stale the moment a client comes online or drops.
     * Replacing per client rather than refetching everything keeps the other clients'
     * rows -- including their live nextRunAt -- untouched.
     */
    setClientJobs: (clientId, jobs) =>
        set((state) => ({
            globalJobs: [
                ...state.globalJobs.filter((j) => j.clientId !== clientId),
                ...jobs.map((job) => ({ ...job, clientId })),
            ],
        })),

    updateSession: (clientId: string, job: HistoryEntry) =>
        set((state) => {
            const client = useClientStore
                .getState()
                .clients.find((c) => c.id === clientId);
            const entry: SessionHistoryItem = {
                ...job,
                clientId,
                hostname: client?.hostname ?? null,
                displayName: client?.displayName ?? null,
            };

            // An existing row may already carry the client columns from the REST
            // fetch, so the resolved ones only win where they actually resolved --
            // an unknown client must not blank out a name that was already there.
            const withNamesOf = (j: SessionHistoryItem): SessionHistoryItem => ({
                ...entry,
                hostname: entry.hostname ?? j.hostname,
                displayName: entry.displayName ?? j.displayName,
            });
            const merge = (j: SessionHistoryItem): SessionHistoryItem => ({
                ...j,
                ...withNamesOf(j),
            });

            // A run that belongs to no job has no row here.
            if (jobIdOf(entry) === null) return {};

            // Same run: a status update of the row already shown.
            if (state.latestPerJob.some((j) => j.id === job.id)) {
                return {
                    latestPerJob: state.latestPerJob.map((j) =>
                        j.id === job.id ? merge(j) : j,
                    ),
                };
            }

            // Another run of a job already shown replaces its row -- unless it is older,
            // which a late status update of an earlier run can be.
            const current = state.latestPerJob.find((j) => isSameJob(j, entry));
            if (current && byStartTimeDesc(entry, current) > 0) return {};

            // The row it replaces is of the same client, so its names still hold.
            return {
                latestPerJob: [
                    current ? withNamesOf(current) : entry,
                    ...state.latestPerJob.filter((j) => !isSameJob(j, entry)),
                ].sort(byStartTimeDesc),
            };
        }),
    updateJobNextRunAt: (clientId, jobId, nextRunAt) =>
        set((state) => ({
            globalJobs: state.globalJobs.map((j) =>
                j.clientId === clientId && j.id === jobId
                    ? { ...j, nextRunAt: nextRunAt ?? undefined }
                    : j,
            ),
        })),
}));
