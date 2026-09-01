import { create } from "zustand";
import {
    BackupJob,
    HistoryEntry,
    ManagedRepository,
    Snapshot,
} from "@pbcm/shared";
import { getErrorMessage } from "../utils";
import { apiFetch } from "../lib/apiFetch";

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
    updateHistory: (job: any) => void;
    updateLastHistory: (job: any) => void;
}

export const useClientDetailStore = create<ClientDataState>((set, get) => ({
    history: [],
    configuredJobs: [],
    lastHistory: [],
    clientSnapshots: [],
    isLoading: false,
    error: null,

    fetchClientData: async (clientId: string) => {
        set({ isLoading: true, error: null, lastHistory: [] });
        try {
            const [historyRes, backupJobsRes] = await Promise.all([
                apiFetch(`/api/v1/clients/${clientId}/history`),
                apiFetch(`/api/v1/clients/${clientId}/jobs`),
            ]);

            const history = historyRes.ok ? await historyRes.json() : [];
            const backupJobs = backupJobsRes.ok
                ? await backupJobsRes.json()
                : [];

            const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
            const initLastHistory = history
                .filter((j: any) => {
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
        try {
            const promises = repositories.map((repo) =>
                apiFetch(`/api/v1/repositories/${repo.id}/snapshots`)
                    .then((res) =>
                        res.ok
                            ? (res.json() as Promise<Snapshot[]>)
                            : ([] as Snapshot[]),
                    )
                    .then((snaps): SnapshotWithRepository[] =>
                        snaps.map((s) => ({ ...s, repository: repo })),
                    )
                    .catch((): SnapshotWithRepository[] => []),
            );

            const results = await Promise.all(promises);
            const allSnapshots = results
                .flat()
                .filter((s) => s.backupId === clientId);

            // Sort by time desc
            allSnapshots.sort((a, b) => b.backupTime - a.backupTime);

            set({ clientSnapshots: allSnapshots });
        } catch (e) {
            console.error("Failed to fetch client snapshots", e);
        }
    },

    deleteBackupJob: async (
        clientId: string,
        jobId: string | null,
    ) => {
        try {
            const res = await apiFetch(
                `/api/v1/clients/${clientId}/jobs/${jobId}`,
                {
                    method: "DELETE",
                },
            );
            if (res.ok) {
                get().removeBackupJob(jobId);
            } else {
                const data = await res.json();
                throw new Error(data.error || "Failed to delete job");
            }
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
            const res = await apiFetch(
                `/api/v1/clients/${clientId}/jobs/${jobId}/run`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({}),
                },
            );
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to trigger job");
            }
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

    updateHistory: (job: any) =>
        set((state: ClientDataState) => {
            const exists = state.history.find((j: any) => j.id === job.id);
            if (exists) {
                return {
                    history: state.history.map((j: any) =>
                        j.id === job.id ? { ...j, ...job } : j,
                    ),
                };
            } else {
                return { history: [job, ...state.history] };
            }
        }),

    updateLastHistory: (job: any) =>
        set((state: ClientDataState) => {
            const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
            const isWithin24Hours = (j: any) => {
                const timeToCheck = j.endTime
                    ? new Date(j.endTime).getTime()
                    : new Date(j.startTime).getTime();
                return timeToCheck > twentyFourHoursAgo;
            };

            let updatedHistory;
            const exists = state.lastHistory.find((j: any) => j.id === job.id);
            if (exists) {
                updatedHistory = state.lastHistory.map((j: any) =>
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
