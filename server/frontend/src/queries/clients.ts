import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClientListSchema, type Client } from '@pbcm/shared';
import { api } from '../lib/api';
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
