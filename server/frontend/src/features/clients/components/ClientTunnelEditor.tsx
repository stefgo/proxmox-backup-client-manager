import { Client } from '@pbcm/shared';
import { useClient } from '../../../queries/clients';
import { ClientTunnelCard } from './ClientTunnelCard';

interface ClientTunnelEditorProps {
    client: Client;
}

/**
 * Sets up, changes or removes a client's SSH reverse tunnel — a page below the client's
 * (`ROUTES.clientTunnel`), reached from the client list and the client page for a client
 * of either connection mode.
 *
 * Its own surface rather than a card inside the client editor, because it answers its own
 * question. The client editor is about what the client *is*; this is about how the PBS is
 * reached from it, a decision that is made long after the client exists, revisited when a
 * host is reinstalled, and taken back when a route opens up. Giving it one entry point in
 * the list — "Add" or "Edit", depending on whether credentials are stored — says that in
 * the one place where the operator is looking at clients.
 *
 * The work is all in `ClientTunnelCard`, the way out included: the card ends with a key
 * field and a host setup snippet, and its header is the only place that stays reachable
 * across all of it. What this adds is the client the card is about, kept current.
 *
 * No heading of its own: the card is the top-level element here, exactly as in
 * {@link ClientEditor}. A page heading above it repeated the card's title and put the
 * client's name in a second place — the card header carries both now, and the two client
 * editors open the same way.
 */
export const ClientTunnelEditor = ({ client }: ClientTunnelEditorProps) => {
    // The caller holds a snapshot from when the editor opened; the tunnel state arrives
    // over the socket afterwards, so read it from the cache instead of the prop.
    const live = useClient(client.id) ?? client;

    return (
        <div className="space-y-6">
            <ClientTunnelCard
                clientId={live.id}
                clientName={live.displayName || live.hostname}
                state={live.tunnel}
            />
        </div>
    );
};
