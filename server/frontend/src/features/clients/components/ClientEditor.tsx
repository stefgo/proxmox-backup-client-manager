import { Client } from '@pbcm/shared';
import { useClientStore } from '../../../stores/useClientStore';
import { ClientIdentityCard } from './ClientIdentityCard';
import { ClientTunnelCard } from './ClientTunnelCard';

interface ClientEditorProps {
    client: Client;
    onSave: (id: string, data: { displayName?: string; outboundTargetAddress?: string }) => Promise<void>;
    onCancel: () => void;
}

/**
 * Edits a client: one card per resource the backend actually exposes.
 *
 * The split is not cosmetic. `PUT /clients/:id` and `PUT /clients/:id/tunnel` are separate
 * endpoints with separate failure modes, and the previous single form gave them one
 * prominent save button that submitted only the first — SSH edits were lost without a
 * word. Two cards, two buttons, and no form spanning both.
 */
export const ClientEditor = ({ client, onSave, onCancel }: ClientEditorProps) => {
    // The caller may hold a snapshot from when the editor opened; the tunnel state arrives
    // over the socket afterwards, so read it from the store instead of the prop.
    const live = useClientStore((s) => s.clients.find((c) => c.id === client.id)) ?? client;
    const isOutbound = live.connectionMode === 'outbound';

    return (
        <div className="space-y-6">
            <ClientIdentityCard client={live} onSave={onSave} onClose={onCancel} />
            {isOutbound && <ClientTunnelCard clientId={live.id} state={live.tunnel} />}
        </div>
    );
};
