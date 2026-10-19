import { Input } from '@stefgo/react-ui-components';
import { InboundForm, isAllowedIpValid } from '../useAddClientForm';

interface StepInboundDetailsProps {
    form: InboundForm;
    onPatch: (patch: Partial<InboundForm>) => void;
    /** A failed create — it is the wizard that issues the token, so it reports back here. */
    error?: string | null;
}

/**
 * The client that is created at once and waits for its agent, with the token the agent
 * registers with. The name is required -- until the agent reports a hostname it is all the
 * client is known by; the address is optional.
 */
export const StepInboundDetails = ({ form, onPatch, error }: StepInboundDetailsProps) => {
    const ipInvalid = !isAllowedIpValid(form.allowedIp);

    return (
        <div className="space-y-4">
            <p className="text-sm text-text-muted">
                The client is added now and waits for its agent. The token you get next
                registers the agent under it.
            </p>
            <Input
                label="Display Name"
                value={form.displayName}
                onChange={(e) => onPatch({ displayName: e.target.value })}
                placeholder="pve-01"
                hint="What the client is listed as. The agent reports its hostname when it registers."
                required
            />
            <Input
                label="Allowed IP or Network (optional)"
                value={form.allowedIp}
                onChange={(e) => onPatch({ allowedIp: e.target.value })}
                placeholder="192.168.1.50 or 192.168.1.0/24"
                error={ipInvalid ? 'Enter an IPv4 address or a network in CIDR notation.' : undefined}
                hint="Where the agent may register from, and what the client stays restricted to afterwards. Leave it empty to accept connections from any address — the client editor can add the restriction later."
            />

            {/* The wizard sets up the connection and nothing else: the tunnel stays
                revisable for the client's whole life, so it is offered on its own. */}
            <p className="text-xs text-text-muted">
                If this host cannot reach a PBS itself, add an SSH tunnel from the client
                list; each job and restore then chooses whether to take it.
            </p>

            {error && <div className="text-sm text-error break-words">{error}</div>}
        </div>
    );
};
