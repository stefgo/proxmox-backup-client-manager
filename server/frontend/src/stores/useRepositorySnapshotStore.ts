import { create } from "zustand";
import { ManagedRepository as Repository, Snapshot } from "@pbcm/shared";
import { getErrorMessage } from "../utils";

interface RepositorySnapshotsState {
    snapshots: Snapshot[];
    isLoading: boolean;
    error: string | null;
    selectedRepository: Repository | null;

    fetchSnapshots: (repo: Repository, token: string) => Promise<void>;
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

        fetchSnapshots: async (repo, token) => {
            set({ isLoading: true, error: null });
            try {
                const res = await fetch(
                    `/api/v1/repositories/${repo.id}/snapshots`,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                    },
                );
                if (res.ok) {
                    const data = await res.json();
                    // Sort by time new to old
                    data.sort(
                        (a: Snapshot, b: Snapshot) =>
                            b.backupTime - a.backupTime,
                    );
                    set({ snapshots: data });
                } else {
                    const err = await res.json();
                    set({ error: err.error || "Failed to fetch snapshots" });
                }
            } catch (e: unknown) {
                set({ error: getErrorMessage(e) });
            } finally {
                set({ isLoading: false });
            }
        },
    }),
);
