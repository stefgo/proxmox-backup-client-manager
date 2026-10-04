import { ReactNode } from 'react';
import { Client, CLIENT_STATUS, DEFAULT_AGENT_PORT, isIpAllowed } from '@pbcm/shared';
import { Save } from 'lucide-react';
import { Badge, Button, Card, Checkbox, DescriptionList, Input, StatusDot, FieldLabel } from '@stefgo/react-ui-components';
import { STATUS_DOT, STATUS_TONE } from '../../../components/statusTone';
import type { EntityForm } from '../../../hooks/useEntityForm';
import { formatRelativeDate } from '../../../utils';
import { useNow } from '../../../hooks/useNow';
import { isOutbound as isOutboundClient, type ClientDraft, type ClientUpdateInput } from '../lib/clientForm';

interface ClientIdentityCardProps {
    client: Client;
    /** The draft and its state. Held by the page, which also has to know whether it is dirty. */
    form: EntityForm<ClientDraft, ClientUpdateInput>;
    /** Saves the form. The card only says when. */
    onSubmit: () => void;
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
export const ClientIdentityCard = ({ client, form, onSubmit, action }: ClientIdentityCardProps) => {
    const { draft, set, errors, isSaving } = form;
    const now = useNow();
    const isOutbound = isOutboundClient(client);
    const allowedIpTrimmed = draft.allowedIp.trim();

    /**
     * The agent cannot object to a value that shuts it out, and the mistake only surfaces
     * at its next reconnect -- possibly hours later. The address of its last connect is
     * the one piece of evidence available now, so the field says outright when the value
     * under the cursor would not let that address back in.
     */
    const wouldLockOut =
        !isOutbound &&
        draft.restrictIp &&
        !!client.ipAddress &&
        !!allowedIpTrimmed &&
        !errors.allowedIp &&
        !isIpAllowed(client.ipAddress, allowedIpTrimmed);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit();
    };

    const footerError = form.saveError ?? form.formError;

    return (
        <Card
            title={
                <div className="flex items-center gap-4">
                    <StatusDot
                        size="md"
                        {...STATUS_DOT[client.status === CLIENT_STATUS.ONLINE
                                ? STATUS_TONE.ONLINE
                                : STATUS_TONE.OFFLINE]}
                        label={client.status}
                    />
                    <div>
                        <div className="text-xl font-bold">
                            {client.displayName || client.hostname}
                        </div>
                        {/* Only while offline: for a connected client the pulsing dot
                            already says the agent is here, and a timestamp beside it just
                            invites the question whether it is stale. */}
                        {client.status !== CLIENT_STATUS.ONLINE && (
                            <div className="text-xs font-normal text-text-muted mt-1">
                                Last seen {formatRelativeDate(client.lastSeen, now)}
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
                    {/* A `DescriptionList` for its copy button. The classes line its label
                        and value up with the read-only fields below. */}
                    <DescriptionList
                        columns={1}
                        items={[{ label: 'Client ID', value: client.id, copyable: client.id }]}
                        classNames={{ label: 'mb-1.5 ml-1', value: 'ml-1' }}
                    />

                    {/* Read-only, and first after the id: it decides whether there is a target
                        address and a tunnel card at all, so it reads as context for the fields
                        below rather than as a footnote after them. */}
                    <div>
                        {/* Not a `FormField`: there is no control to label. The classes are
                            copied from its `stacked` label and hint so a read-only value
                            lines up with the editable fields under it. */}
                        <FieldLabel as="div">
                            Connection Mode
                        </FieldLabel>
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
                        <FieldLabel as="div">
                            Agent Version
                        </FieldLabel>
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

                    <div>
                        <FieldLabel as="div">
                            Agent Time Zone
                        </FieldLabel>
                        <span className="ml-1 text-sm text-text-primary">
                            {client.timezone || 'Unknown'}
                        </span>
                        <p className="mt-1 text-xs text-text-muted leading-relaxed ml-1">
                            The clock the agent repeats job schedules on. Set with <code>TZ</code> on
                            the agent; UTC in a container without it.
                        </p>
                    </div>

                    <Input
                        label="Display Name"
                        value={draft.displayName}
                        onChange={(e) => set('displayName', e.target.value)}
                        placeholder={client.hostname}
                        disabled={isSaving}
                        error={errors.displayName}
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
                                checked={draft.restrictIp}
                                onChange={(e) => set('restrictIp', e.target.checked)}
                                disabled={isSaving}
                                hint={
                                    draft.restrictIp
                                        ? 'The agent is rejected when it connects from anywhere else.'
                                        : `Any address may connect with this client's token.${
                                              client.ipAddress ? ` Its last successful connection came from ${client.ipAddress}.` : ''
                                          }`
                                }
                            />

                            {draft.restrictIp && (
                                <Input
                                    label="Allowed IP or Network"
                                    value={draft.allowedIp}
                                    onChange={(e) => set('allowedIp', e.target.value)}
                                    placeholder="192.168.1.50 or 192.168.1.0/24"
                                    disabled={isSaving}
                                    error={errors.allowedIp}
                                    hint={
                                        client.ipAddress
                                            ? `Its last successful connection came from ${client.ipAddress}.`
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
                            value={draft.targetAddress}
                            onChange={(e) => set('targetAddress', e.target.value)}
                            placeholder={`192.168.1.50:${DEFAULT_AGENT_PORT}`}
                            disabled={isSaving}
                            error={errors.targetAddress}
                            hint={`Host and port the agent is reachable on. Without a port, :${DEFAULT_AGENT_PORT} is used. Saving reconnects the agent.`}
                        />
                    )}

                    <div className="flex items-center justify-end gap-4 border-t border-border pt-5">
                        {footerError && <span className="text-sm text-error mr-auto">{footerError}</span>}
                        {!footerError && form.saved && <span className="text-sm text-success mr-auto">Client saved</span>}
                        <Button
                            type="submit"
                            variant="primary"
                            isLoading={isSaving}
                            disabled={!form.canSave}
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
