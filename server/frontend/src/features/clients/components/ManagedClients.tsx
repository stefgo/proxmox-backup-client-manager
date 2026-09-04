import { Client } from "@pbcm/shared";
import { ClientList } from "./ClientList";
import { ClientEditor } from "./ClientEditor";
import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { AddClientWizard } from "./add-client/AddClientWizard";
import { apiFetch } from "../../../lib/apiFetch";

interface ManagedClientsProps {
    clients: Client[];
    onSelect: (client: Client | null) => void;
    onRefresh: () => void;
    onDelete: (clientId: string) => void;
    onUpdate: (
        clientId: string,
        data: { displayName?: string; outboundTargetAddress?: string },
    ) => Promise<void>;
}

export const ManagedClients = ({
    clients,
    onSelect,
    onRefresh,
    onDelete,
    onUpdate,
}: ManagedClientsProps) => {
    const { token } = useAuth();
    const [editingClient, setEditingClient] = useState<Client | null>(null);
    const [isWizardOpen, setIsWizardOpen] = useState(false);

    const handleDeleteClient = async (client: Client) => {
        const extra =
            client.connectionMode === "outbound"
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

    const handleSaveClient = async (
        id: string,
        data: { displayName?: string; outboundTargetAddress?: string },
    ) => {
        await onUpdate(id, data);
        setEditingClient(null);
    };

    // The list, the editor and the add wizard share the work area: one of the
    // three is on screen at a time, none of them floats above the others.
    return (
        <div id="client-list-section">
            {isWizardOpen ? (
                <AddClientWizard
                    token={token}
                    onClose={() => setIsWizardOpen(false)}
                    onCreated={onRefresh}
                />
            ) : editingClient ? (
                <ClientEditor
                    client={editingClient}
                    onSave={handleSaveClient}
                    onCancel={() => setEditingClient(null)}
                />
            ) : (
                <ClientList
                    clients={clients}
                    setSelectedClient={onSelect}
                    deleteClient={handleDeleteClient}
                    editClient={setEditingClient}
                    addClient={() => setIsWizardOpen(true)}
                    reconnectClient={handleReconnect}
                />
            )}
        </div>
    );
};
