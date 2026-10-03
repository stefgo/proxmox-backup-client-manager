import { create } from 'zustand';
import { ClientListSchema, type Client, type TunnelState } from '@pbcm/shared';
import { getErrorMessage } from '../utils';
import { api } from '../lib/api';

interface ClientsState {
    clients: Client[];
    isLoading: boolean;
    /**
     * Whether the list has arrived once, by fetch or by broadcast -- also after a failed
     * fetch, so a route waiting on it does not wait forever. An empty list before that
     * says nothing about whether a client exists.
     */
    loaded: boolean;
    error: string | null;

    fetchClients: () => Promise<void>;
    deleteClient: (clientId: string) => Promise<void>;
    updateClient: (
        clientId: string,
        data: {
            displayName?: string;
            outboundTargetAddress?: string;
            /** `null` switches the check off; absent leaves the stored value alone. */
            inboundAllowedIp?: string | null;
        },
    ) => Promise<void>;
    setClients: (clients: Client[]) => void;
    setTunnelState: (state: TunnelState) => void;
}

export const useClientStore = create<ClientsState>((set, get) => ({
    clients: [],
    isLoading: false,
    loaded: false,
    error: null,

    /**
     * Fetches the complete list of registered clients from the backend.
     * Updates loading and error states during the network request.
     */
    fetchClients: async () => {
        set({ isLoading: true, error: null });
        try {
            const clients = await api.get('/api/v1/clients', ClientListSchema, {
                fallback: 'Failed to fetch clients',
            });
            set({ clients });
        } catch (e: unknown) {
            set({ error: getErrorMessage(e) });
        } finally {
            set({ isLoading: false, loaded: true });
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
            await api.delete(`/api/v1/clients/${clientId}`, { fallback: 'Failed to delete client' });
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
            await api.put(`/api/v1/clients/${clientId}`, data, undefined, {
                fallback: 'Failed to update client',
            });
        } catch (e: unknown) {
            // Revert
            set({ clients: oldClients, error: getErrorMessage(e) });
            throw e;
        }
    },

    setClients: (clients) => {
        set({ clients, loaded: true });
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
