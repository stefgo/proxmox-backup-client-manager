import { create } from "zustand";
import { Client, TunnelState } from "@pbcm/shared";
import { getErrorMessage } from "../utils";
import { apiFetch } from "../lib/apiFetch";

interface ClientsState {
    clients: Client[];
    isLoading: boolean;
    error: string | null;

    fetchClients: () => Promise<void>;
    deleteClient: (clientId: string) => Promise<void>;
    updateClient: (
        clientId: string,
        data: { displayName?: string; outboundTargetAddress?: string },
    ) => Promise<void>;
    setClients: (clients: Client[]) => void;
    setTunnelState: (state: TunnelState) => void;
}

export const useClientStore = create<ClientsState>((set, get) => ({
    clients: [],
    isLoading: false,
    error: null,

    /**
     * Fetches the complete list of registered clients from the backend.
     * Updates loading and error states during the network request.
     */
    fetchClients: async () => {
        set({ isLoading: true, error: null });
        try {
            const res = await apiFetch("/api/v1/clients");
            if (!res.ok) throw new Error("Failed to fetch clients");
            const data = await res.json();
            set({ clients: data });
        } catch (e: unknown) {
            set({ error: getErrorMessage(e) });
        } finally {
            set({ isLoading: false });
        }
    },

    /**
     * Deletes a client by ID. Uses optimistic UI updates to instantly remove
     * the client from the list, reverting if the API call fails.
     * @param clientId - The UUID of the client to delete
     */
    deleteClient: async (clientId) => {
        // Optimistic update not strictly necessary if we refetch, but good for UX
        const oldClients = get().clients;
        set({ clients: oldClients.filter((c) => c.id !== clientId) });

        try {
            const res = await apiFetch(`/api/v1/clients/${clientId}`, {
                method: "DELETE",
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to delete client");
            }
        } catch (e: unknown) {
            // Revert on error
            set({ clients: oldClients, error: getErrorMessage(e) });
            throw e;
        }
    },

    updateClient: async (clientId, data) => {
        const oldClients = get().clients;
        // Optimistic update
        set({
            clients: oldClients.map((c) =>
                c.id === clientId ? { ...c, ...data } : c,
            ),
        });

        try {
            const res = await apiFetch(`/api/v1/clients/${clientId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(data),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Failed to update client");
            }
        } catch (e: unknown) {
            // Revert
            set({ clients: oldClients, error: getErrorMessage(e) });
            throw e;
        }
    },

    setClients: (clients) => {
        set({ clients });
    },

    /**
     * Merges a live tunnel update into the client it belongs to. The tunnel state is
     * runtime-only on the server, so it arrives by broadcast rather than with the list.
     */
    setTunnelState: (state) => {
        set({
            clients: get().clients.map((c) =>
                c.id === state.clientId ? { ...c, tunnel: state } : c,
            ),
        });
    },
}));
