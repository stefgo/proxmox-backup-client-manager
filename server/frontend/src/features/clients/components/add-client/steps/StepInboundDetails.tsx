import { Input } from '@stefgo/react-ui-components';
import { InboundForm, isAllowedIpValid } from '../useAddClientForm';

interface StepInboundDetailsProps {
    form: InboundForm;
    onPatch: (patch: Partial<InboundForm>) => void;
    /** A failed create — it is the wizard that issues the token, so it reports back here. */
    error?: string | null;
}

/**
 * What the agent cannot tell the server about itself.
 *
 * Both values are carried by the registration token, because this step is the
 * only moment an operator is present: the agent registers unattended, and
 * anything not decided here has to be corrected by hand afterwards.
 */
export const StepInboundDetails = ({ form, onPatch, error }: StepInboundDetailsProps) => {
    const ipInvalid = !isAllowedIpValid(form.allowedIp);

    return (
        <div className="space-y-4">
            <Input
                label="Display Name (optional)"
                value={form.displayName}
                onChange={(e) => onPatch({ displayName: e.target.value })}
                placeholder="The agent's hostname is used if left empty"
            />
            <Input
                label="Allowed IP or Network (optional)"
                value={form.allowedIp}
                onChange={(e) => onPatch({ allowedIp: e.target.value })}
                placeholder="192.168.1.50 or 192.168.1.0/24"
                error={ipInvalid ? 'Enter an IPv4 address or a network in CIDR notation.' : undefined}
                hint="Where the token may be redeemed from, and what the client stays pinned to. Leave it empty to pin the client to the address it registers from."
            />

            {/* Doubly true in this mode: no client is set up with a tunnel, and an
                inbound one does not even exist as a row until its agent has redeemed
                the token — there would be nothing to attach the credentials to. */}
            <p className="text-xs text-text-muted">
                If this host cannot reach a PBS itself, add an SSH tunnel from the client
                list once the agent has registered; each job and restore then chooses
                whether to take it.
            </p>

            {error && <div className="text-sm text-error break-words">{error}</div>}
        </div>
    );
};
