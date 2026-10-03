import { create } from 'zustand';
import {
    ClientHistorySchema,
    ClientJobListSchema,
    SnapshotListSchema,
    type BackupJob,
    type HistoryEntry,
    type ManagedRepository,
    type Snapshot,
} from '@pbcm/shared';
import { getErrorMessage } from '../utils';
import { api } from '../lib/api';
import { SessionExpiredError } from '../lib/apiFetch';

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

/**
 * The snapshot endpoint is per repository, so the repository a snapshot came from
 * is only known while fetching. We attach it here; the restore editor needs it and
 * would otherwise have to look it up again from the id.
 */
export type SnapshotWithRepository = Snapshot & { repository: ManagedRepository };

interface ClientDataState {
    history: HistoryEntry[];
    configuredJobs: BackupJob[];
    lastHistory: HistoryEntry[];
    clientSnapshots: SnapshotWithRepository[];
    /**
     * Set when one or more repositories could not be read. The snapshots of the others are
     * still shown, so a partial list does not pass for the complete one without a word.
     */
    snapshotsError: string | null;
    isLoading: boolean;
    error: string | null;

    fetchClientData: (clientId: string) => Promise<void>;
    fetchClientSnapshots: (
        clientId: string,
        repositories: ManagedRepository[],
    ) => Promise<void>;

    // Configured Job Actions
    addBackupJob: (job: BackupJob) => void;
    updateBackupJob: (job: BackupJob) => void;
    removeBackupJob: (jobId: string | null) => void;

    // Async Job Actions
    deleteBackupJob: (
        clientId: string,
        jobId: string,
    ) => Promise<void>;
    triggerBackupJob: (
        clientId: string,
        jobId: string,
    ) => Promise<void>;

    // Realtime Updates
    updateHistory: (job: HistoryEntry) => void;
    updateLastHistory: (job: HistoryEntry) => void;
}

export const useClientDetailStore = create<ClientDataState>((set, get) => ({
    history: [],
    configuredJobs: [],
    lastHistory: [],
    clientSnapshots: [],
    snapshotsError: null,
    isLoading: false,
    error: null,

    fetchClientData: async (clientId: string) => {
        set({ isLoading: true, error: null, lastHistory: [] });
        try {
            const [history, backupJobs] = await Promise.all([
                listOrEmpty(api.get(`/api/v1/clients/${clientId}/history`, ClientHistorySchema)),
                listOrEmpty(api.get(`/api/v1/clients/${clientId}/jobs`, ClientJobListSchema)),
            ]);

            const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
            const initLastHistory = history
                .filter((j) => {
                    const timeToCheck = j.endTime
                        ? new Date(j.endTime).getTime()
                        : new Date(j.startTime).getTime();
                    return timeToCheck > twentyFourHoursAgo;
                })
                .slice(0, 10);

            set({
                history: history,
                configuredJobs: backupJobs,
                lastHistory: initLastHistory,
            });
        } catch (e: unknown) {
            set({ error: getErrorMessage(e) });
        } finally {
            set({ isLoading: false });
        }
    },

    fetchClientSnapshots: async (
        clientId: string,
        repositories: ManagedRepository[],
    ) => {
        // Each repository answers on its own; one that fails is recorded rather than
        // turned into an empty list, so the view can say which part is missing.
        const failed: string[] = [];
        const results = await Promise.all(
            repositories.map(async (repo): Promise<SnapshotWithRepository[]> => {
                try {
                    const snaps = await api.get(
                        `/api/v1/repositories/${repo.id}/snapshots`,
                        SnapshotListSchema,
                    );
                    return snaps.map((s) => ({ ...s, repository: repo }));
                } catch (e) {
                    console.error('Failed to fetch client snapshots', repo.id, e);
                    failed.push(`${repo.baseUrl}:${repo.datastore}`);
                    return [];
                }
            }),
        );

        const allSnapshots = results
            .flat()
            .filter((s) => s.backupId === clientId);

        // Sort by time desc
        allSnapshots.sort((a, b) => b.backupTime - a.backupTime);

        set({
            clientSnapshots: allSnapshots,
            snapshotsError: failed.length > 0
                ? `Could not read the snapshots of ${failed.join(', ')}.`
                : null,
        });
    },

    deleteBackupJob: async (
        clientId: string,
        jobId: string | null,
    ) => {
        try {
            await api.delete(`/api/v1/clients/${clientId}/jobs/${jobId}`, {
                fallback: 'Failed to delete job',
            });
            get().removeBackupJob(jobId);
        } catch (e: unknown) {
            console.error(e);
            throw e;
        }
    },

    triggerBackupJob: async (
        clientId: string,
        jobId: string | null,
    ) => {
        try {
            await api.post(`/api/v1/clients/${clientId}/jobs/${jobId}/run`, {}, undefined, {
                fallback: 'Failed to trigger job',
            });
        } catch (e: unknown) {
            console.error(e);
            throw e;
        }
    },

    addBackupJob: (job: BackupJob) =>
        set((state: ClientDataState) => ({
            configuredJobs: [...state.configuredJobs, job],
        })),

    updateBackupJob: (job: BackupJob) =>
        set((state: ClientDataState) => ({
            configuredJobs: state.configuredJobs.map((j) =>
                j.id === job.id ? job : j,
            ),
        })),

    removeBackupJob: (jobId: string | null) =>
        set((state: ClientDataState) => ({
            configuredJobs: state.configuredJobs.filter((j) => j.id !== jobId),
        })),

    updateHistory: (job: HistoryEntry) =>
        set((state: ClientDataState) => {
            const exists = state.history.find((j) => j.id === job.id);
            if (exists) {
                return {
                    history: state.history.map((j) =>
                        j.id === job.id ? { ...j, ...job } : j,
                    ),
                };
            } else {
                return { history: [job, ...state.history] };
            }
        }),

    updateLastHistory: (job: HistoryEntry) =>
        set((state: ClientDataState) => {
            const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
            const isWithin24Hours = (j: HistoryEntry) => {
                const timeToCheck = j.endTime
                    ? new Date(j.endTime).getTime()
                    : new Date(j.startTime).getTime();
                return timeToCheck > twentyFourHoursAgo;
            };

            let updatedHistory;
            const exists = state.lastHistory.find((j) => j.id === job.id);
            if (exists) {
                updatedHistory = state.lastHistory.map((j) =>
                    j.id === job.id ? { ...j, ...job } : j,
                );
            } else {
                updatedHistory = [job, ...state.lastHistory];
            }

            updatedHistory = updatedHistory
                .filter(isWithin24Hours)
                .slice(0, 10);
            return { lastHistory: updatedHistory };
        }),
}));
