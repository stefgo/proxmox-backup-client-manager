import { create } from "zustand";
import { BackupJob, HistoryEntry } from "@pbcm/shared";

export interface GlobalJob extends BackupJob {
    clientId: string;
}

interface GlobalJobsState {
    globalJobs: GlobalJob[];
    lastHistory: HistoryEntry[];
    isLoading: boolean;
    error: string | null;

    fetchAllJobs: (token: string) => Promise<void>;
    updateSession: (job: HistoryEntry) => void;
    updateJobNextRunAt: (
        clientId: string,
        jobId: string,
        nextRunAt: string | null,
    ) => void;
}

export const useGlobalJobsStore = create<GlobalJobsState>((set) => ({
    globalJobs: [],
    lastHistory: [],
    isLoading: false,
    error: null,

    fetchAllJobs: async (token) => {
        set({ isLoading: true, error: null });
        try {
            const [jobsRes, historyRes] = await Promise.all([
                fetch("/api/v1/jobs", {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetch("/api/v1/history", {
                    headers: { Authorization: `Bearer ${token}` },
                }),
            ]);

            if (!jobsRes.ok) throw new Error("Failed to fetch jobs");
            if (!historyRes.ok) throw new Error("Failed to fetch history");

            const data: { clientId: string; jobs: BackupJob[] }[] =
                await jobsRes.json();

            const historyData = await historyRes.json();
            const allHistory = historyData.success ? historyData.data : [];

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

            const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
            const initLastHistory = allHistory
                .filter((j: any) => {
                    const timeToCheck = j.endTime
                        ? new Date(j.endTime).getTime()
                        : new Date(j.startTime).getTime();
                    return timeToCheck > twentyFourHoursAgo;
                })
                .slice(0, 10);

            set({
                globalJobs: flattenedJobs,
                lastHistory: initLastHistory,
                isLoading: false,
            });
        } catch (e: any) {
            set({ error: e.message, isLoading: false });
        }
    },

    updateSession: (job: HistoryEntry) =>
        set((state) => {
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
    updateJobNextRunAt: (clientId, jobId, nextRunAt) =>
        set((state) => ({
            globalJobs: state.globalJobs.map((j) =>
                j.clientId === clientId && j.id === jobId
                    ? { ...j, nextRunAt: nextRunAt ?? undefined }
                    : j,
            ),
        })),
}));
