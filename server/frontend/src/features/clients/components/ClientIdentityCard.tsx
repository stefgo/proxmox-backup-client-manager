import { ReactNode, useEffect, useState } from 'react';
import {
    Client,
    CLIENT_STATUS,
    CONNECTION_MODE,
    normaliseTargetAddress,
} from '@pbcm/shared';
import { Save } from 'lucide-react';
import { Badge, Button, Card, Input } from '@stefgo/react-ui-components';
import { StatusDot } from './StatusDot';
import { STATUS_TONE } from './statusTone';
import { formatDate } from '../../../utils';

interface ClientIdentityCardProps {
    client: Client;
    onSave: (id: string, data: { displayName?: string; outboundTargetAddress?: string }) => Promise<void>;
    /** Reported upwards so the page can ask before the operator leaves with unsaved work. */
    onDirtyChange?: (dirty: boolean) => void;
    /**
     * Placed in the card header. The page passes its close control here rather than
     * rendering one of its own: the header is the one part of a card that stays in reach
     * no matter how far down the form the operator has scrolled.
     */
    action?: ReactNode;
}

/**
 * Name and address of a client — everything `PUT /api/v1/clients/:id` owns, and nothing
 * else. The SSH tunnel is a separate resource with a separate endpoint and therefore a
 * separate card: one save button per resource is the only arrangement in which a button
 * cannot silently drop what the operator typed into a field it does not submit.
 *
 * The card does not decide what leaving means — the page does, and hands it in as
 * `action`. Save stays here, because it belongs to these fields; the way out belongs to
 * the surface that opened them.
 */
export const ClientIdentityCard = ({ client, onSave, onDirtyChange, action }: ClientIdentityCardProps) => {
    const [displayName, setDisplayName] = useState(client.displayName || '');
    const [targetAddress, setTargetAddress] = useState(client.outboundTargetAddress || '');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    const isOutbound = client.connectionMode === CONNECTION_MODE.OUTBOUND;

    // Validated here rather than only on the server: the same function decides both, so a
    // rejected address is caught in the field instead of coming back as a request error.
    const addressInvalid =
        isOutbound && !!targetAddress.trim() && !normaliseTargetAddress(targetAddress);

    const isDirty =
        displayName !== (client.displayName || '') ||
        (isOutbound && targetAddress !== (client.outboundTargetAddress || ''));

    const canSave = isDirty && !addressInvalid && !(isOutbound && !targetAddress.trim());

    useEffect(() => {
        onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSave) return;
        setIsSaving(true);
        setError(null);
        setSaved(false);
        try {
            await onSave(client.id, {
                displayName: displayName.trim(),
                // Only sent for outbound clients: the backend rejects the field for
                // inbound ones, which have no target address to begin with.
                outboundTargetAddress: isOutbound ? targetAddress.trim() : undefined,
            });
            setSaved(true);
        } catch (e) {
            console.error(e);
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Card
            title={
                <div className="flex items-center gap-4">
                    <StatusDot
                        tone={
                            client.status === CLIENT_STATUS.ONLINE
                                ? STATUS_TONE.ONLINE
                                : STATUS_TONE.OFFLINE
                        }
                        label={client.status}
                    />
                    <div>
                        <div className="text-xl font-bold">
                            {client.displayName || client.hostname}
                        </div>
                        {/* Same shape as the ClientOverview header: the id belongs to the
                            name it identifies, on its own line beneath it. */}
                        <div className="text-sm font-mono text-text-muted">
                            {client.id}
                        </div>
                        {/* Only while offline: for a connected client the pulsing dot
                            already says the agent is here, and a timestamp beside it just
                            invites the question whether it is stale. */}
                        {client.status !== CLIENT_STATUS.ONLINE && (
                            <div className="text-xs font-normal text-text-muted mt-1">
                                Last seen {formatDate(client.lastSeen)}
                            </div>
                        )}
                    </div>
                </div>
            }
            titleAs="div"
            action={action}
            classNames={{ header: 'py-5 px-7' }}
        >
            <div className="px-7 py-6 bg-card">
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Read-only, and first: it decides whether there is a target address
                        and a tunnel card at all, so it reads as context for the fields
                        below rather than as a footnote after them. */}
                    <div>
                        {/* Not a `FormField`: there is no control to label. The classes are
                            copied from its `stacked` label and hint so a read-only value
                            lines up with the editable fields under it. */}
                        <div className="block text-xs font-bold text-text-muted uppercase mb-1.5 ml-1">
                            Connection Mode
                        </div>
                        {/* `lg` is text-sm — the size the inputs and the agent version
                            below use, so the read-only value does not read as a footnote. */}
                        <Badge variant="info" size="lg">
                            {isOutbound ? 'Outbound' : 'Inbound'}
                        </Badge>
                        <p className="mt-1 text-xs text-text-muted leading-relaxed ml-1">
                            {isOutbound
                                ? 'The server dials the agent and reaches PBS through an SSH tunnel.'
                                : 'The agent dials the server and reaches PBS directly.'}
                        </p>
                    </div>

                    <div>
                        <div className="block text-xs font-bold text-text-muted uppercase mb-1.5 ml-1">
                            Agent Version
                        </div>
                        {/* Always rendered, even without a value: a field that vanishes reads
                            as "not applicable", while an agent that has never reported one is
                            a fact worth seeing. */}
                        <span className="ml-1 text-sm text-text-primary">
                            {client.version || 'Unknown'}
                        </span>
                        {!client.version && (
                            <p className="mt-1 text-xs text-text-muted leading-relaxed ml-1">
                                Reported by the agent on connect — an agent that has not
                                connected yet has none.
                            </p>
                        )}
                    </div>

                    <Input
                        label="Display Name"
                        value={displayName}
                        onChange={(e) => { setDisplayName(e.target.value); setSaved(false); }}
                        placeholder={client.hostname}
                        disabled={isSaving}
                        hint={`Leave empty to use the hostname (${client.hostname})`}
                        autoFocus
                    />

                    {isOutbound && (
                        <Input
                            label="Target Address"
                            value={targetAddress}
                            onChange={(e) => { setTargetAddress(e.target.value); setSaved(false); }}
                            placeholder="192.168.1.50:3001"
                            disabled={isSaving}
                            error={addressInvalid ? 'Must have the form host:port — no scheme, path or credentials.' : undefined}
                            hint="Host and port the agent is reachable on. Saving reconnects the agent."
                        />
                    )}

                    <div className="flex items-center justify-end gap-4 border-t border-border pt-5">
                        {error && <span className="text-sm text-error mr-auto">{error}</span>}
                        {!error && saved && <span className="text-sm text-success mr-auto">Client saved</span>}
                        <Button
                            type="submit"
                            variant="primary"
                            isLoading={isSaving}
                            disabled={!canSave}
                            icon={Save}
                            className="shadow-glow-accent"
                        >
                            Save Client
                        </Button>
                    </div>
                </form>
            </div>
        </Card>
    );
};
