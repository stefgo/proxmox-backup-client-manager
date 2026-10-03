import { create } from 'zustand';
import { SnapshotListSchema, type ManagedRepository as Repository, type Snapshot } from '@pbcm/shared';
import { getErrorMessage } from '../utils';
import { api } from '../lib/api';

interface RepositorySnapshotsState {
    snapshots: Snapshot[];
    isLoading: boolean;
    error: string | null;
    selectedRepository: Repository | null;

    fetchSnapshots: (repo: Repository) => Promise<void>;
    selectRepository: (repo: Repository | null) => void;
}

export const useRepositorySnapshotStore = create<RepositorySnapshotsState>(
    (set) => ({
        snapshots: [],
        isLoading: false,
        error: null,
        selectedRepository: null,

        selectRepository: (repo) =>
            set({ selectedRepository: repo, snapshots: [], error: null }),

        fetchSnapshots: async (repo) => {
            set({ isLoading: true, error: null });
            try {
                const data = await api.get(
                    `/api/v1/repositories/${repo.id}/snapshots`,
                    SnapshotListSchema,
                    { fallback: 'Failed to fetch snapshots' },
                );
                // Sort by time new to old
                data.sort((a, b) => b.backupTime - a.backupTime);
                set({ snapshots: data });
            } catch (e: unknown) {
                set({ error: getErrorMessage(e) });
            } finally {
                set({ isLoading: false });
            }
        },
    }),
);
