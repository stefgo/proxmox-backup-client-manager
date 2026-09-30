import { useCallback } from 'react';
import { useClientStore } from '../../../stores/useClientStore';

/**
 * The name a client id is shown by. A webhook keeps the id of a client that was deleted --
 * dropped, a list naming only that client would become empty, and empty means every
 * client -- so an id nobody has any more reads as such rather than as a bare UUID.
 */
export function useClientName(): (clientId: string) => string {
    const clients = useClientStore((s) => s.clients);
    return useCallback(
        (clientId: string) => {
            const client = clients.find((c) => c.id === clientId);
            return client ? client.displayName || client.hostname : 'Deleted client';
        },
        [clients],
    );
}
