import { create } from "zustand";
import {
    BackupJob,
    GlobalHistoryEntry,
    GlobalHistoryResponseSchema,
    HistoryEntry,
} from "@pbcm/shared";
import { getErrorMessage } from "../utils";
import { apiFetch } from "../lib/apiFetch";
import { useClientStore } from "./useClientStore";

export interface GlobalJob extends BackupJob {
    clientId: string;
}

/**
 * lastHistory mixes two shapes: rows fetched from GET /api/v1/history and entries
 * pushed over the WebSocket, which arrive in the agent's HistoryEntry form. Both
 * satisfy the list's BaseHistoryItem contract; nothing reads the fields where they
 * differ (jobId vs jobConfigId).
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

interface GlobalJobsState {
    globalJobs: GlobalJob[];
    lastHistory: SessionHistoryItem[];
    isLoading: boolean;
    error: string | null;

    fetchAllJobs: () => Promise<void>;
    updateSession: (clientId: string, job: HistoryEntry) => void;
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

    fetchAllJobs: async () => {
        set({ isLoading: true, error: null });
        try {
            const [jobsRes, historyRes] = await Promise.all([
                apiFetch("/api/v1/jobs"),
                apiFetch("/api/v1/history"),
            ]);

            if (!jobsRes.ok) throw new Error("Failed to fetch jobs");
            if (!historyRes.ok) throw new Error("Failed to fetch history");

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
                    "Unexpected /api/v1/history payload:",
                    parsedHistory.error.issues,
                );
            }
            const allHistory: GlobalHistoryEntry[] = parsedHistory.success
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

            const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
            const initLastHistory = allHistory
                .filter((j) => {
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
        } catch (e: unknown) {
            set({ error: getErrorMessage(e), isLoading: false });
        }
    },

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

            const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
            const isWithin24Hours = (j: SessionHistoryItem) => {
                const timeToCheck = j.endTime
                    ? new Date(j.endTime).getTime()
                    : new Date(j.startTime).getTime();
                return timeToCheck > twentyFourHoursAgo;
            };

            // An existing row may already carry the client columns from the REST
            // fetch, so the resolved ones only win where they actually resolved --
            // an unknown client must not blank out a name that was already there.
            const merge = (j: SessionHistoryItem): SessionHistoryItem => ({
                ...j,
                ...entry,
                hostname: entry.hostname ?? j.hostname,
                displayName: entry.displayName ?? j.displayName,
            });

            let updatedHistory: SessionHistoryItem[];
            const exists = state.lastHistory.some((j) => j.id === job.id);
            if (exists) {
                updatedHistory = state.lastHistory.map((j) =>
                    j.id === job.id ? merge(j) : j,
                );
            } else {
                updatedHistory = [entry, ...state.lastHistory];
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
