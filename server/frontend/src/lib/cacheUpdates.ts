import type { Client, TunnelState } from '@pbcm/shared';

/**
 * What a dashboard message makes of a cache entry: `(what is cached, what arrived) => what
 * is cached now`. Pure, so every rule here is tested without a socket or a component --
 * `WebSocketProvider` only decides which entry a message belongs to.
 */

/**
 * Merges a live tunnel update into the client it belongs to. The tunnel state is
 * runtime-only on the server, so it arrives by broadcast rather than with the list.
 */
export function mergeTunnelState(clients: Client[], state: TunnelState): Client[] {
    return clients.map((c) => (c.id === state.clientId ? { ...c, tunnel: state } : c));
}
