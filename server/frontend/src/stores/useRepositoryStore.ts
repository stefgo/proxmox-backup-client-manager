import { create } from "zustand";
import { ManagedRepository as Repository } from "@pbcm/shared";
import { getErrorMessage } from "../utils";

export interface CertificateCheck {
    storedFingerprint: string | null;
    measuredFingerprint: string | null;
    matches: boolean;
    caValid: boolean;
    reachable: boolean;
    notAfter: string | null;
    error: string | null;
}

export interface DistributeResult {
    updated: { clientId: string; jobId: string; jobName: string }[];
    failed: { clientId: string; jobId: string; error: string }[];
    skippedOffline: { clientId: string; hostname: string }[];
}

interface RepositoriesState {
    repositories: Repository[];
    isLoading: boolean;
    error: string | null;

    fetchRepositories: (token: string) => Promise<void>;
    addRepository: (repo: Partial<Repository>, token: string) => Promise<void>; // Partial for creation
    updateRepository: (
        id: string | number,
        repo: Partial<Repository>,
        token: string,
    ) => Promise<void>;
    deleteRepository: (id: string | number, token: string) => Promise<void>;
    checkRepositoryStatus: (
        id: string | number,
        token: string,
    ) => Promise<void>;
    probeCertificate: (
        id: string | number,
        token: string,
    ) => Promise<CertificateCheck>;
    distributeFingerprint: (
        id: string | number,
        token: string,
    ) => Promise<DistributeResult>;
}

export const useRepositoryStore = create<RepositoriesState>((set, get) => ({
    repositories: [],
    isLoading: false,
    error: null,

    fetchRepositories: async (token) => {
        set({ isLoading: true, error: null });
        try {
            const res = await fetch("/api/v1/repositories", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                set({ repositories: data });

                // Check status for all
                data.forEach((repo: Repository) => {
                    get().checkRepositoryStatus(repo.id, token);
                });
            } else {
                throw new Error("Failed to fetch repositories");
            }
        } catch (e: unknown) {
            set({ error: getErrorMessage(e) });
        } finally {
            set({ isLoading: false });
        }
    },

    checkRepositoryStatus: async (id, token) => {
        set((state) => ({
            repositories: state.repositories.map((r) =>
                r.id === id ? { ...r, status: "loading" } : r,
            ),
        }));

        try {
            const res = await fetch(`/api/v1/repositories/${id}/status`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (res.ok) {
                const { status } = await res.json();
                set((state) => ({
                    repositories: state.repositories.map((r) =>
                        r.id === id ? { ...r, status } : r,
                    ),
                }));
            } else {
                set((state) => ({
                    repositories: state.repositories.map((r) =>
                        r.id === id ? { ...r, status: "offline" } : r,
                    ),
                }));
            }
        } catch (e) {
            set((state) => ({
                repositories: state.repositories.map((r) =>
                    r.id === id ? { ...r, status: "offline" } : r,
                ),
            }));
        }
    },

    probeCertificate: async (id, token) => {
        const res = await fetch(`/api/v1/repositories/${id}/certificate`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || "Zertifikatsprüfung fehlgeschlagen");
        }
        return (await res.json()) as CertificateCheck;
    },

    distributeFingerprint: async (id, token) => {
        const res = await fetch(`/api/v1/repositories/${id}/distribute`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || "Verteilen fehlgeschlagen");
        }
        return (await res.json()) as DistributeResult;
    },

    addRepository: async (repo, token) => {
        try {
            const res = await fetch("/api/v1/repositories", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(repo),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Failed to add repository");
            }

            // Refresh
            await get().fetchRepositories(token);
        } catch (e: unknown) {
            throw e;
        }
    },

    updateRepository: async (id, repo, token) => {
        try {
            const res = await fetch(`/api/v1/repositories/${id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(repo),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Failed to update repository");
            }

            // Refresh
            await get().fetchRepositories(token);
        } catch (e: unknown) {
            throw e;
        }
    },

    deleteRepository: async (id, token) => {
        try {
            const res = await fetch(`/api/v1/repositories/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Failed to delete repository");
            }

            // Optimistic update
            set((state) => ({
                repositories: state.repositories.filter((r) => r.id !== id),
            }));
        } catch (e: unknown) {
            throw e;
        }
    },
}));
