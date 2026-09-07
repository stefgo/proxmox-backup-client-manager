import { Input } from '@stefgo/react-ui-components';
import { OutboundForm } from '../useAddClientForm';

interface StepOutboundDetailsProps {
    form: OutboundForm;
    onPatch: (patch: Partial<OutboundForm>) => void;
    /** A failed create. This is the last step, so without it the failure would have nowhere to appear. */
    error?: string | null;
}

/**
 * Where the server finds the agent and what proves it may talk to it — and nothing else.
 *
 * No SSH credentials here on purpose. Adding a client establishes the connection, which is
 * fixed once it is made; the route to the PBS is a separate, reversible decision and is set
 * up from the client list afterwards, for inbound and outbound clients alike.
 */
export const StepOutboundDetails = ({ form, onPatch, error }: StepOutboundDetailsProps) => (
    <div className="space-y-4">
        <Input
            label="Display Name (optional)"
            value={form.hostname}
            onChange={(e) => onPatch({ hostname: e.target.value })}
            placeholder="Derived from the target address if left empty"
        />
        <Input
            label="Target Address (host:port of the agent)"
            required
            value={form.targetAddress}
            onChange={(e) => onPatch({ targetAddress: e.target.value })}
            placeholder="192.168.1.50:3001"
        />
        <Input
            label="Registration Secret"
            required
            value={form.registrationSecret}
            onChange={(e) => onPatch({ registrationSecret: e.target.value })}
            hint="One-time secret from the agent's config.yaml. It is consumed on the first successful registration."
        />

        {error && <div className="text-sm text-error break-words">{error}</div>}
    </div>
);
