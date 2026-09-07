import { Client, CONNECTION_MODE } from "@pbcm/shared";
import { ClientList } from "./ClientList";
import { apiFetch } from "../../../lib/apiFetch";

interface ManagedClientsProps {
    clients: Client[];
    onSelect: (client: Client | null) => void;
    onRefresh: () => void;
    onDelete: (clientId: string) => void;
    /** Opens the add wizard — its own route, so the URL says what is on screen. */
    onAdd: () => void;
    /** Opens the client editor for this client. */
    onEdit: (client: Client) => void;
    /** Opens the tunnel editor — setting one up and changing one are the same route. */
    onEditTunnel: (client: Client) => void;
}

/**
 * The client list and the two things only the list can do: delete a client, and pull an
 * offline outbound client back in.
 *
 * Everything that opens a form — add, edit, tunnel — is a route of its own and therefore
 * a navigation, not a state flag here. This component used to swap four surfaces in and
 * out of the same `div`, which meant the URL described none of them and a reload dropped
 * the operator back on the list.
 */
export const ManagedClients = ({
    clients,
    onSelect,
    onRefresh,
    onDelete,
    onAdd,
    onEdit,
    onEditTunnel,
}: ManagedClientsProps) => {
    const handleDeleteClient = async (client: Client) => {
        const extra =
            client.connectionMode === CONNECTION_MODE.OUTBOUND
                ? "\n\nNote: the connection mode is fixed. Deleting this client also discards its job history."
                : "";
        if (!confirm(`Delete this client?${extra}`)) return;
        onDelete(client.id);
    };

    /** Immediate reconnect attempt for an outbound client, bypassing the backoff. */
    const handleReconnect = async (client: Client) => {
        try {
            const res = await apiFetch(`/api/v1/clients/${client.id}/reconnect`, {
                method: "POST",
            });
            const data = await res.json();
            if (!data.connected) {
                alert(
                    "Could not reach the client. The server keeps retrying in the background.",
                );
            }
            onRefresh();
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div id="client-list-section">
            <ClientList
                clients={clients}
                setSelectedClient={onSelect}
                deleteClient={handleDeleteClient}
                editClient={onEdit}
                addClient={onAdd}
                editTunnel={onEditTunnel}
                reconnectClient={handleReconnect}
            />
        </div>
    );
};
