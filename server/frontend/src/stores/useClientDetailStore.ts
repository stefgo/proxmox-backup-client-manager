import { create } from 'zustand';
import { BackupJob, HistoryEntry, Snapshot } from '@pbcm/shared';

interface ClientDataState {
    history: HistoryEntry[];
    configuredJobs: BackupJob[];
    sessionHistory: HistoryEntry[];
    clientSnapshots: Snapshot[];
    isLoading: boolean;
    error: string | null;

    fetchClientData: (clientId: string, token: string) => Promise<void>;
    fetchClientSnapshots: (clientId: string, repositories: any[], token: string) => Promise<void>;

    // Configured Job Actions
    addBackupJob: (job: BackupJob) => void;
    updateBackupJob: (job: BackupJob) => void;
    removeBackupJob: (jobId: string) => void;

    // Async Job Actions
    deleteBackupJob: (clientId: string, jobId: string, token: string) => Promise<void>;
    triggerBackupJob: (clientId: string, jobId: string, token: string) => Promise<void>;

    // Realtime Updates
    updateHistory: (job: any) => void;
    updateSession: (job: any) => void;
}

export const useClientDetailStore = create<ClientDataState>((set, get) => ({
    history: [],
    configuredJobs: [],
    sessionHistory: [],
    clientSnapshots: [],
    isLoading: false,
    error: null,

    fetchClientData: async (clientId, token) => {
        set({ isLoading: true, error: null, sessionHistory: [] });
        try {
            const [historyRes, backupJobsRes] = await Promise.all([
                fetch(`/api/v1/clients/${clientId}/history`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`/api/v1/clients/${clientId}/jobs`, { headers: { 'Authorization': `Bearer ${token}` } }),
            ]);

            const history = historyRes.ok ? await historyRes.json() : [];
            const backupJobs = backupJobsRes.ok ? await backupJobsRes.json() : [];

            set({
                history: history,
                configuredJobs: backupJobs,
            });
        } catch (e: any) {
            set({ error: e.message });
        } finally {
            set({ isLoading: false });
        }
    },

    fetchClientSnapshots: async (clientId, repositories, token) => {
        try {
            const promises = repositories.map(repo =>
                fetch(`/api/v1/repositories/${repo.id}/snapshots`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }).then(res => res.ok ? res.json() : [])
                    .then(snaps => snaps.map((s: any) => ({ ...s, repository: repo })))
                    .catch(() => [])
            );

            const results = await Promise.all(promises);
            const allSnapshots = results.flat().filter((s: any) => s.backupId === clientId);

            // Sort by time desc
            allSnapshots.sort((a: any, b: any) => b.backupTime - a.backupTime);

            set({ clientSnapshots: allSnapshots });
        } catch (e) {
            console.error("Failed to fetch client snapshots", e);
        }
    },

    deleteBackupJob: async (clientId, jobId, token) => {
        try {
            const res = await fetch(`/api/v1/clients/${clientId}/jobs/${jobId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                get().removeBackupJob(jobId);
            } else {
                const data = await res.json();
                throw new Error(data.error || 'Failed to delete job');
            }
        } catch (e: any) {
            console.error(e);
            throw e;
        }
    },

    triggerBackupJob: async (clientId, jobId, token) => {
        try {
            const res = await fetch(`/api/v1/clients/${clientId}/jobs/${jobId}/run`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to trigger job');
            }
        } catch (e: any) {
            console.error(e);
            throw e;
        }
    },

    addBackupJob: (job) => set((state) => ({ configuredJobs: [...state.configuredJobs, job] })),

    updateBackupJob: (job) => set((state) => ({
        configuredJobs: state.configuredJobs.map(j => j.id === job.id ? job : j)
    })),

    removeBackupJob: (jobId) => set((state) => ({
        configuredJobs: state.configuredJobs.filter(j => j.id !== jobId)
    })),

    updateHistory: (job: any) => set((state) => {
        const exists = state.history.find((j: any) => j.id === job.id);
        if (exists) {
            return { history: state.history.map((j: any) => j.id === job.id ? { ...j, ...job } : j) };
        } else {
            return { history: [job, ...state.history] };
        }
    }),

    updateSession: (job: any) => set((state) => {
        const exists = state.sessionHistory.find((j: any) => j.id === job.id);
        if (exists) {
            return { sessionHistory: state.sessionHistory.map((j: any) => j.id === job.id ? { ...j, ...job } : j) };
        } else {
            return { sessionHistory: [job, ...state.sessionHistory] };
        }
    })
}));
