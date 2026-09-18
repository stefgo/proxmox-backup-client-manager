import { Client } from "@pbcm/shared";
import { useConfirm } from "@stefgo/react-ui-components";
import { ClientList } from "./ClientList";
import { apiFetch } from "../../../lib/apiFetch";
import { describeDeleteClient } from "../confirmations";

interface ManagedClientsProps {
    clients: Client[];
    onSelect: (client: Client | null) => void;
    onRefresh: () => void;
    /** Resolves once the row is gone, so the dialog can hold its spinner until then; rejects on failure. */
    onDelete: (clientId: string) => Promise<void>;
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
    const { confirm, alert } = useConfirm();

    // A failed delete keeps the dialog open with the message in it: the store reverts its
    // optimistic removal, so the row comes back, and closing would hide both the failure
    // and the button that retries it.
    const requestDelete = (client: Client) =>
        confirm({ ...describeDeleteClient(client), onConfirm: () => onDelete(client.id) });

    /** Immediate reconnect attempt for an outbound client, bypassing the backoff. */
    const handleReconnect = async (client: Client) => {
        try {
            const res = await apiFetch(`/api/v1/clients/${client.id}/reconnect`, {
                method: "POST",
            });
            const data = await res.json();
            if (!data.connected) {
                alert({
                    title: "Could not reach the client",
                    description: "The server keeps retrying in the background.",
                });
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
                deleteClient={requestDelete}
                editClient={onEdit}
                addClient={onAdd}
                editTunnel={onEditTunnel}
                reconnectClient={handleReconnect}
            />
        </div>
    );
};
