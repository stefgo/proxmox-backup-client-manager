import { useState } from "react";
import { Client, CONNECTION_MODE } from "@pbcm/shared";
import { ConfirmDialog } from "@stefgo/react-ui-components";
import { ClientList } from "./ClientList";
import { apiFetch } from "../../../lib/apiFetch";
import { getErrorMessage } from "../../../utils";

interface ManagedClientsProps {
    clients: Client[];
    onSelect: (client: Client | null) => void;
    onRefresh: () => void;
    /** Resolves once the row is gone, so the dialog can hold its spinner until then. */
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
    // The client itself, not a boolean: one dialog serves every row, and the text names
    // the host it is about.
    const [pendingDelete, setPendingDelete] = useState<Client | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const confirmDelete = async () => {
        if (!pendingDelete) return;
        setIsDeleting(true);
        try {
            await onDelete(pendingDelete.id);
            setPendingDelete(null);
        } catch (e: unknown) {
            // The store reverts its optimistic removal, so the row comes back. The dialog
            // stays open with it -- closing it here would hide both the failure and the
            // button that retries it.
            alert(getErrorMessage(e));
        } finally {
            setIsDeleting(false);
        }
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
                deleteClient={setPendingDelete}
                editClient={onEdit}
                addClient={onAdd}
                editTunnel={onEditTunnel}
                reconnectClient={handleReconnect}
            />

            {/*
              * The history and the tunnel go with the row -- both tables reference
              * clients(id) ON DELETE CASCADE. What does not go is the agent: it runs its
              * downloaded jobs from its own database and keeps doing so offline, which is
              * the part an operator does not expect and therefore the part named first.
              */}
            <ConfirmDialog
                isOpen={!!pendingDelete}
                onClose={() => setPendingDelete(null)}
                onConfirm={confirmDelete}
                title={`Delete "${pendingDelete?.displayName || pendingDelete?.hostname}"?`}
                description={
                    "Its entire job history is deleted with it, along with the SSH tunnel and the key stored for it. The agent on the host keeps the jobs it has already downloaded and goes on running them offline until it is uninstalled." +
                    (pendingDelete?.connectionMode === CONNECTION_MODE.OUTBOUND
                        ? " The connection mode cannot be changed, so bringing this host back means registering it again from scratch."
                        : "")
                }
                confirmLabel="Delete client"
                variant="danger"
                isConfirming={isDeleting}
            />
        </div>
    );
};
