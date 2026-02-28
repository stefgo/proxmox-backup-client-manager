import { create } from 'zustand';
import { BackupJob, HistoryEntry } from '@pbcm/shared';

export interface GlobalJob extends BackupJob {
    clientId: string;
}

interface GlobalJobsState {
    globalJobs: GlobalJob[];
    sessionHistory: HistoryEntry[];
    isLoading: boolean;
    error: string | null;

    fetchAllJobs: (token: string) => Promise<void>;
    updateSession: (job: HistoryEntry) => void;
}

export const useGlobalJobsStore = create<GlobalJobsState>((set) => ({
    globalJobs: [],
    sessionHistory: [],
    isLoading: false,
    error: null,

    fetchAllJobs: async (token) => {
        set({ isLoading: true, error: null });
        try {
            const res = await fetch('/api/v1/jobs', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) throw new Error('Failed to fetch jobs');

            const data: { clientId: string, jobs: BackupJob[] }[] = await res.json();

            // Flatten the array of { clientId, jobs[] } into GlobalJob[]
            const flattenedJobs: GlobalJob[] = [];
            for (const clientJobs of data) {
                for (const job of clientJobs.jobs) {
                    flattenedJobs.push({
                        ...job,
                        clientId: clientJobs.clientId
                    });
                }
            }

            set({ globalJobs: flattenedJobs, isLoading: false });
        } catch (e: any) {
            set({ error: e.message, isLoading: false });
        }
    },

    updateSession: (job: HistoryEntry) => set((state) => {
        const exists = state.sessionHistory.find((j) => j.id === job.id);
        if (exists) {
            return { sessionHistory: state.sessionHistory.map((j) => j.id === job.id ? { ...j, ...job } : j) };
        } else {
            return { sessionHistory: [job, ...state.sessionHistory] };
        }
    })
}));
