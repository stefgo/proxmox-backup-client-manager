import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    ClientListSchema,
    TunnelInfoSchema,
    TunnelTestResultSchema,
    type Client,
    type TunnelCreateSchema,
    type TunnelInfo,
    type TunnelUpdateSchema,
} from '@pbcm/shared';
import type { z } from 'zod';
import { api, ApiError } from '../lib/api';
import { queryClient } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';

const NO_CLIENTS: Client[] = [];

/**
 * Never stale by age: the server sends the whole list as `CLIENTS_UPDATE` whenever a
 * client connects, drops or changes, and again on every socket connect. What the socket
 * missed while it was down is covered by the invalidation on reconnect.
 */
export const clientListOptions = queryOptions({
    queryKey: queryKeys.clients.list(),
    queryFn: () => api.get('/api/v1/clients', ClientListSchema, { fallback: 'Failed to fetch clients' }),
    staleTime: Infinity,
});

/**
 * The registered clients. `isPending` is true until the list has arrived once -- by fetch
 * or by broadcast, and also after a failed fetch. An empty list before that says nothing
 * about whether a client exists.
 */
export function useClients() {
    const { data = NO_CLIENTS, isPending, error, refetch } = useQuery(clientListOptions);
    return { clients: data, isPending, error, refetch };
}

/** One client out of the list, kept current by the socket. `undefined` while unknown. */
export function useClient(clientId: string | null | undefined): Client | undefined {
    return useQuery({
        ...clientListOptions,
        select: (clients) => clients.find((c) => c.id === clientId),
    }).data;
}

/** For code outside React's render, such as a socket handler: the client as cached now. */
export function getCachedClient(clientId: string): Client | undefined {
    return queryClient.getQueryData(clientListOptions.queryKey)?.find((c) => c.id === clientId);
}

export interface ClientUpdate {
    displayName?: string;
    outboundTargetAddress?: string;
    /** `null` switches the check off; absent leaves the stored value alone. */
    inboundAllowedIp?: string | null;
}

/**
 * Both mutations below change the list at once and put the previous one back when the
 * server refuses. A fetch still in flight is cancelled first: its answer was read before
 * the change and would otherwise overwrite it.
 */
function useOptimisticClientList<TVariables>(
    mutationFn: (variables: TVariables) => Promise<void>,
    apply: (clients: Client[], variables: TVariables) => Client[],
) {
    const queryClient = useQueryClient();
    const key = clientListOptions.queryKey;
    return useMutation({
        mutationFn,
        onMutate: async (variables: TVariables) => {
            await queryClient.cancelQueries({ queryKey: key });
            const previous = queryClient.getQueryData(key);
            queryClient.setQueryData(key, (clients) => clients && apply(clients, variables));
            return { previous };
        },
        onError: (_error, _variables, context) => {
            if (context?.previous) queryClient.setQueryData(key, context.previous);
        },
    });
}

export function useUpdateClient() {
    return useOptimisticClientList(
        ({ clientId, data }: { clientId: string; data: ClientUpdate }) =>
            api.put(`/api/v1/clients/${clientId}`, data, undefined, { fallback: 'Failed to update client' }),
        (clients, { clientId, data }) => clients.map((c) => (c.id === clientId ? { ...c, ...data } : c)),
    );
}

export function useDeleteClient() {
    return useOptimisticClientList(
        (clientId: string) => api.delete(`/api/v1/clients/${clientId}`, { fallback: 'Failed to delete client' }),
        (clients, clientId) => clients.filter((c) => c.id !== clientId),
    );
}

/**
 * The SSH credentials stored for a client's tunnel, without the secret. `null` when the
 * client has none: a 404 is an answer here, not a failure -- a client without a tunnel is
 * an ordinary state, and the card offers to set one up.
 *
 * Dropped as soon as nothing shows it: the tunnel card seeds a form from the first
 * answer, and one left over from an earlier visit would seed it with what may have
 * changed since.
 */
export const clientTunnelOptions = (clientId: string) =>
    queryOptions({
        queryKey: queryKeys.clients.tunnel(clientId),
        queryFn: async (): Promise<TunnelInfo | null> => {
            try {
                return await api.get(`/api/v1/clients/${clientId}/tunnel`, TunnelInfoSchema, {
                    fallback: 'Could not load the tunnel configuration',
                });
            } catch (e) {
                if (e instanceof ApiError && e.status === 404) return null;
                throw e;
            }
        },
        gcTime: 0,
    });

type TunnelCreateInput = z.input<typeof TunnelCreateSchema>;
type TunnelUpdateInput = z.input<typeof TunnelUpdateSchema>;

/**
 * Sets up a client's tunnel. The answer carries nothing, so the cache is told what the
 * server now holds -- and the client list is read again: whether a tunnel exists is part
 * of the client row (`tunnelConfigured`), which the list's action label reads.
 */
export function useCreateTunnel(clientId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: TunnelCreateInput) =>
            api.post(`/api/v1/clients/${clientId}/tunnel`, input, undefined, { fallback: 'Failed to set up the tunnel' }),
        onSuccess: (_, input) => {
            queryClient.setQueryData(clientTunnelOptions(clientId).queryKey, (): TunnelInfo => ({
                sshHost: input.sshHost,
                sshPort: input.sshPort ?? 22,
                sshUser: input.sshUser,
                hostKeySha256: input.hostKeySha256,
                // Not editable and not part of the request: the server binds forwards to loopback.
                remoteBindHost: '127.0.0.1',
            }));
            void queryClient.invalidateQueries({ queryKey: clientListOptions.queryKey });
        },
    });
}

/** Changes the stored credentials, or pins another host key. Only the keys sent are changed. */
export function useUpdateTunnel(clientId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: TunnelUpdateInput) =>
            api.put(`/api/v1/clients/${clientId}/tunnel`, input, undefined, {
                fallback: 'Failed to save the tunnel configuration',
            }),
        onSuccess: (_, input) => {
            queryClient.setQueryData(clientTunnelOptions(clientId).queryKey, (prev) =>
                prev
                    ? {
                          ...prev,
                          sshHost: input.sshHost ?? prev.sshHost,
                          sshPort: input.sshPort ?? prev.sshPort,
                          sshUser: input.sshUser ?? prev.sshUser,
                          hostKeySha256: input.hostKeySha256 ?? prev.hostKeySha256,
                      }
                    : prev,
            );
        },
    });
}

/** Removes the tunnel with its credentials. The client and its history stay. */
export function useDeleteTunnel(clientId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => api.delete(`/api/v1/clients/${clientId}/tunnel`, { fallback: 'Failed to remove the tunnel' }),
        onSuccess: () => {
            queryClient.setQueryData(clientTunnelOptions(clientId).queryKey, null);
            void queryClient.invalidateQueries({ queryKey: clientListOptions.queryKey });
        },
    });
}

/**
 * Tests credentials the request brings along, before anything is stored. Not cached: a
 * connection is tried now or not at all. A failed test is still an answer; `ok` says how
 * it went.
 */
export const testTunnelCredentials = (
    credentials: Omit<TunnelCreateInput, 'hostKeySha256'> & { expectedHostKeySha256?: string },
) => api.post('/api/v1/tunnel/test', credentials, TunnelTestResultSchema, { fallback: 'Tunnel test failed' });

/**
 * Tests with the stored key, which never leaves the backend: the server reads it from the
 * database and takes only host, port and user from the request.
 */
export const testStoredTunnel = (
    clientId: string,
    address: Pick<TunnelUpdateInput, 'sshHost' | 'sshPort' | 'sshUser'>,
) =>
    api.post(`/api/v1/clients/${clientId}/tunnel/test`, address, TunnelTestResultSchema, {
        fallback: 'Tunnel test failed',
    });
