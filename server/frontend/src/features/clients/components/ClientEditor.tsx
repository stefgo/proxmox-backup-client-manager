import { useState } from 'react';
import { Client } from '@pbcm/shared';
import { Save, X } from 'lucide-react';
import { Card, Button, Input } from '@stefgo/react-ui-components';
import { ClientTunnelSettings } from './ClientTunnelSettings';

interface ClientEditorProps {
    client: Client;
    onSave: (id: string, data: { displayName?: string; outboundTargetAddress?: string }) => Promise<void>;
    onCancel: () => void;
}

export const ClientEditor = ({ client, onSave, onCancel }: ClientEditorProps) => {
    const [displayName, setDisplayName] = useState(client.displayName || '');
    const [targetAddress, setTargetAddress] = useState(client.outboundTargetAddress || '');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isOutbound = client.connectionMode === 'outbound';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setError(null);
        try {
            await onSave(client.id, {
                displayName: displayName.trim(),
                // Only sent for outbound clients: the backend rejects the field for
                // inbound ones, which have no target address to begin with.
                outboundTargetAddress: isOutbound ? targetAddress.trim() : undefined,
            });
            onCancel();
        } catch (e) {
            console.error(e);
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Card
            className="flex flex-col"
            title="Edit Client"
            action={
                <button onClick={onCancel} className="text-text-muted dark:text-text-muted-dark hover:text-text-primary transition-colors p-1 rounded-full hover:bg-hover dark:hover:bg-hover-dark">
                    <X size={20} />
                </button>
            }
            classNames={{ header: "py-6 px-7", headerTitle: "text-xl font-bold" }}
        >

            <div className="p-7 bg-card dark:bg-card-dark">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <Input
                        label="Display Name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder={client.hostname}
                        disabled={isSaving}
                        hint={`Leave empty to use hostname (${client.hostname})`}
                    />

                    {/* Connection mode is fixed at creation time and shown read-only. */}
                    <div className="text-sm text-text-muted dark:text-text-muted-dark">
                        Connection mode:{' '}
                        <span className="font-mono text-text-primary dark:text-text-primary-dark">
                            {isOutbound ? 'Outbound (server dials in, PBS through an SSH tunnel)' : 'Inbound (client dials in, PBS directly)'}
                        </span>
                        <div className="text-xs mt-1">Fixed at creation — switching requires deleting and re-adding the client.</div>
                    </div>

                    {/* The address itself stays editable: the agent's port may change. */}
                    {isOutbound && (
                        <Input
                            label="Target Address"
                            value={targetAddress}
                            onChange={(e) => setTargetAddress(e.target.value)}
                            placeholder="192.168.1.50:3001"
                            disabled={isSaving}
                            hint="Host and port the agent is reachable on. Saving reconnects."
                        />
                    )}

                    {error && (
                        <div className="text-sm text-red-500">{error}</div>
                    )}

                    {client.connectionMode === 'outbound' && (
                        <ClientTunnelSettings clientId={client.id} />
                    )}

                    <div className="flex justify-end gap-3 pt-2">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={onCancel}
                            disabled={isSaving}
                            icon={<X size={16} />}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            isLoading={isSaving}
                            icon={<Save size={16} />}
                            className="shadow-glow-accent"
                        >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </div>
                </form>
            </div>
        </Card>
    );
};
