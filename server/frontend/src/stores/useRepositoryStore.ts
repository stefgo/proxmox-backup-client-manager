import { create } from 'zustand';
import {
    CertificateCheckSchema,
    DistributeResultSchema,
    ManagedRepositoryListSchema,
    REPOSITORY_STATUS,
    RepositoryStatusResponseSchema,
    type CertificateCheck,
    type DistributeResult,
    type ManagedRepository as Repository,
    type RepositoryInput,
} from '@pbcm/shared';
import { getErrorMessage } from '../utils';
import { api } from '../lib/api';

interface RepositoriesState {
    repositories: Repository[];
    isLoading: boolean;
    /**
     * Whether the list has arrived once -- also after a failed fetch, so a route waiting
     * on it does not wait forever. An empty list before that says nothing about whether a
     * repository exists.
     */
    loaded: boolean;
    error: string | null;

    fetchRepositories: () => Promise<void>;
    addRepository: (repo: RepositoryInput) => Promise<void>;
    updateRepository: (
        id: string | number,
        repo: RepositoryInput,
    ) => Promise<void>;
    deleteRepository: (id: string | number) => Promise<void>;
    checkRepositoryStatus: (
        id: string | number,
    ) => Promise<void>;
    probeCertificate: (
        id: string | number,
    ) => Promise<CertificateCheck>;
    /** Pushes the stored fingerprint and secret to the jobs on connected clients. */
    distribute: (
        id: string | number,
    ) => Promise<DistributeResult>;
}

export const useRepositoryStore = create<RepositoriesState>((set, get) => ({
    repositories: [],
    isLoading: false,
    loaded: false,
    error: null,

    fetchRepositories: async () => {
        set({ isLoading: true, error: null });
        try {
            const data = await api.get('/api/v1/repositories', ManagedRepositoryListSchema, {
                fallback: 'Failed to fetch repositories',
            });
            set({ repositories: data });

            // Check status for all
            data.forEach((repo) => {
                get().checkRepositoryStatus(repo.id);
            });
        } catch (e: unknown) {
            set({ error: getErrorMessage(e) });
        } finally {
            set({ isLoading: false, loaded: true });
        }
    },

    checkRepositoryStatus: async (id) => {
        set((state) => ({
            repositories: state.repositories.map((r) =>
                r.id === id ? { ...r, status: REPOSITORY_STATUS.LOADING } : r,
            ),
        }));

        try {
            const { status } = await api.get(
                `/api/v1/repositories/${id}/status`,
                RepositoryStatusResponseSchema,
            );
            set((state) => ({
                repositories: state.repositories.map((r) =>
                    r.id === id ? { ...r, status } : r,
                ),
            }));
        } catch {
            // A refusal and an unreachable server read the same here: not online.
            set((state) => ({
                repositories: state.repositories.map((r) =>
                    r.id === id ? { ...r, status: REPOSITORY_STATUS.OFFLINE } : r,
                ),
            }));
        }
    },

    probeCertificate: (id) =>
        api.get(`/api/v1/repositories/${id}/certificate`, CertificateCheckSchema, {
            fallback: 'Certificate check failed',
        }),

    distribute: (id) =>
        api.post(`/api/v1/repositories/${id}/distribute`, undefined, DistributeResultSchema, {
            fallback: 'Distribution failed',
        }),

    addRepository: async (repo) => {
        await api.post('/api/v1/repositories', repo, undefined, {
            fallback: 'Failed to add repository',
        });
        // Refresh
        await get().fetchRepositories();
    },

    updateRepository: async (id, repo) => {
        await api.put(`/api/v1/repositories/${id}`, repo, undefined, {
            fallback: 'Failed to update repository',
        });
        // Refresh
        await get().fetchRepositories();
    },

    deleteRepository: async (id) => {
        await api.delete(`/api/v1/repositories/${id}`, { fallback: 'Failed to delete repository' });
        // Removed once the server confirmed it, not before: nothing to roll back.
        set((state) => ({
            repositories: state.repositories.filter((r) => r.id !== id),
        }));
    },
}));
