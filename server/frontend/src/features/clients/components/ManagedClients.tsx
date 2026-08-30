import { Client } from "@pbcm/shared";
import { ClientList } from "./ClientList";
import { ClientEditor } from "./ClientEditor";
import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { TokenModal } from "../../tokens/components/TokenModal";
import { OutboundClientWizard } from "./OutboundClientWizard";

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
    const [createdToken, setCreatedToken] = useState<{
        token: string;
        expiresAt: string;
    } | null>(null);
    const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
    const [editingClient, setEditingClient] = useState<Client | null>(null);
    const [isWizardOpen, setIsWizardOpen] = useState(false);

    const handleGenerateToken = async () => {
        try {
            const res = await fetch("/api/v1/tokens", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setCreatedToken(data);
                setIsTokenModalOpen(true);
                onRefresh();
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleDeleteClient = async (client: Client) => {
        const extra =
            client.connectionMode === "outbound"
                ? "\n\nHinweis: Die Verbindungsart ist nicht änderbar. Beim Löschen geht die Job-Historie dieses Clients verloren."
                : "";
        if (!confirm(`Delete this client?${extra}`)) return;
        onDelete(client.id);
    };

    /** Immediate reconnect attempt for an outbound client, bypassing the backoff. */
    const handleReconnect = async (client: Client) => {
        try {
            const res = await fetch(`/api/v1/clients/${client.id}/reconnect`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (!data.connected) {
                alert(
                    "Verbindung zum Client konnte nicht hergestellt werden. Der Server versucht es weiterhin im Hintergrund.",
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

    return (
        <div id="client-list-section">
            {editingClient ? (
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
                    generateToken={handleGenerateToken}
                    editClient={setEditingClient}
                    addOutboundClient={() => setIsWizardOpen(true)}
                    reconnectClient={handleReconnect}
                />
            )}

            {isWizardOpen && (
                <OutboundClientWizard
                    token={token}
                    onClose={() => setIsWizardOpen(false)}
                    onCreated={onRefresh}
                />
            )}

            {/* Token Modal */}
            {isTokenModalOpen && createdToken && (
                <TokenModal
                    token={createdToken.token}
                    expiresAt={createdToken.expiresAt}
                    onClose={() => setIsTokenModalOpen(false)}
                />
            )}
        </div>
    );
};
