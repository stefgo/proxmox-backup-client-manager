import { Input, Switch } from '@stefgo/react-ui-components';
import { OutboundForm } from '../useAddClientForm';

interface StepOutboundAgentProps {
    form: OutboundForm;
    onPatch: (patch: Partial<OutboundForm>) => void;
    /**
     * A failed create. Only ever shown here when the tunnel is off: then this is the
     * last step, and without it the failure would have nowhere to appear.
     */
    error?: string | null;
}

/**
 * Where the server finds the agent, what proves it may talk to it — and whether it also
 * needs a route to the PBS opened for it.
 *
 * The tunnel switch lives here rather than in step 1: the connection mode is the decision
 * that cannot be revised, and putting a freely reversible one next to it would suggest
 * this one is final too. It is not — a tunnel can be added, switched or removed in the
 * client editor at any time.
 */
export const StepOutboundAgent = ({ form, onPatch, error }: StepOutboundAgentProps) => (
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
        <Switch
            label="Reach the PBS through an SSH reverse tunnel"
            hint="Needed when this host cannot reach the PBS itself. Off means it backs up directly — you can change this later."
            value={form.useTunnel}
            onChange={(useTunnel) => onPatch({ useTunnel })}
        />

        {!form.useTunnel && error && (
            <div className="text-sm text-error break-words">{error}</div>
        )}
    </div>
);
