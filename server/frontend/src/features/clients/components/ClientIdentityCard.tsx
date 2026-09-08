import { ReactNode, useEffect, useState } from 'react';
import {
    Client,
    CLIENT_STATUS,
    CONNECTION_MODE,
    Ipv4OrCidrSchema,
    isIpAllowed,
    normaliseTargetAddress,
} from '@pbcm/shared';
import { Save } from 'lucide-react';
import { Badge, Button, Card, Checkbox, Input } from '@stefgo/react-ui-components';
import { StatusDot } from './StatusDot';
import { STATUS_TONE } from './statusTone';
import { formatDate } from '../../../utils';

interface ClientIdentityCardProps {
    client: Client;
    onSave: (
        id: string,
        data: { displayName?: string; outboundTargetAddress?: string; inboundAllowedIp?: string | null },
    ) => Promise<void>;
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
    const [restrictIp, setRestrictIp] = useState(!!client.inboundAllowedIp);
    const [allowedIp, setAllowedIp] = useState(client.inboundAllowedIp || '');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    const isOutbound = client.connectionMode === CONNECTION_MODE.OUTBOUND;

    // Validated here rather than only on the server: the same function decides both, so a
    // rejected address is caught in the field instead of coming back as a request error.
    const addressInvalid =
        isOutbound && !!targetAddress.trim() && !normaliseTargetAddress(targetAddress);

    // Same rule the backend applies, so a rejected value is caught in the field instead
    // of coming back as a request error. Only while the restriction is on: an unticked
    // box submits null and whatever is left in the field is not sent anywhere.
    const allowedIpTrimmed = allowedIp.trim();
    const allowedIpInvalid =
        !isOutbound &&
        restrictIp &&
        !!allowedIpTrimmed &&
        !Ipv4OrCidrSchema.safeParse(allowedIpTrimmed).success;

    /**
     * The agent cannot object to a value that shuts it out, and the mistake only surfaces
     * at its next reconnect -- possibly hours later. The address of its last connect is
     * the one piece of evidence available now, so the field says outright when the value
     * under the cursor would not let that address back in.
     */
    const wouldLockOut =
        !isOutbound &&
        restrictIp &&
        !!client.ipAddress &&
        !!allowedIpTrimmed &&
        !allowedIpInvalid &&
        !isIpAllowed(client.ipAddress, allowedIpTrimmed);

    const isDirty =
        displayName !== (client.displayName || '') ||
        (isOutbound && targetAddress !== (client.outboundTargetAddress || '')) ||
        // Turning the restriction off is a change in its own right, even though it leaves
        // the field untouched — otherwise unticking the box would not enable Save.
        (!isOutbound && restrictIp !== !!client.inboundAllowedIp) ||
        (!isOutbound && restrictIp && allowedIp !== (client.inboundAllowedIp || ''));

    const canSave =
        isDirty &&
        !addressInvalid &&
        !allowedIpInvalid &&
        !(isOutbound && !targetAddress.trim()) &&
        // Required only while the box is ticked: that is what ticking it means.
        !(!isOutbound && restrictIp && !allowedIpTrimmed);

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
                // Mirror image of the line above: the backend rejects this field for
                // outbound clients, which are dialed and never checked against one.
                // `null` is not "unchanged" here but "switch the check off" — only the
                // absent key leaves the stored value alone.
                inboundAllowedIp: isOutbound
                    ? undefined
                    : restrictIp
                      ? allowedIpTrimmed
                      : null,
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

    {/* The check is opt-in, so the box carries the decision and the field only the
                        value. A Checkbox rather than a Switch: this form is submitted by its
                        save button, and a switch would claim to take effect on the spot. */}
                    {!isOutbound && (
                        <div className="space-y-4">
                            <Checkbox
                                label="Restrict connections to an IP or network"
                                checked={restrictIp}
                                onChange={(e) => { setRestrictIp(e.target.checked); setSaved(false); }}
                                disabled={isSaving}
                                hint={
                                    restrictIp
                                        ? "The agent is rejected when it connects from anywhere else."
                                        : `Any address may connect with this client's token.${
                                              client.ipAddress ? ` It last connected from ${client.ipAddress}.` : ''
                                          }`
                                }
                            />

                            {restrictIp && (
                                <Input
                                    label="Allowed IP or Network"
                                    value={allowedIp}
                                    onChange={(e) => { setAllowedIp(e.target.value); setSaved(false); }}
                                    placeholder="192.168.1.50 or 192.168.1.0/24"
                                    disabled={isSaving}
                                    error={allowedIpInvalid ? 'Enter an IPv4 address or a network in CIDR notation.' : undefined}
                                    hint={
                                        client.ipAddress
                                            ? `Its last connection came from ${client.ipAddress}.`
                                            : undefined
                                    }
                                />
                            )}
                        </div>
                    )}

                    {/* Not the field's `error`: the value is well-formed and storable, and
                        the agent may well have moved on purpose. It is a consequence worth
                        seeing before saving, not a reason to refuse. */}
                    {wouldLockOut && (
                        <p className="-mt-4 text-xs text-error leading-relaxed ml-1">
                            This value would not let {client.ipAddress} back in — the agent
                            is rejected at its next reconnect.
                        </p>
                    )}

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
