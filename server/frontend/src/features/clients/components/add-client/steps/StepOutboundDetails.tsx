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
 * Where the server finds the agent, what proves it may talk to it — and whether SSH
 * credentials for a reverse tunnel are stored along with it.
 *
 * The tunnel switch lives here rather than in step 1: the connection mode is the decision
 * that cannot be revised, and putting a freely reversible one next to it would suggest
 * this one is final too. It is not — credentials can be added or removed in the client
 * editor at any time, and whether a backup actually takes the tunnel is set per job.
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
            label="Set up an SSH reverse tunnel"
            hint="Stores SSH credentials so this client's jobs can reach a PBS it has no route to. Each job then chooses whether to use it. Can be added later in the client editor."
            value={form.useTunnel}
            onChange={(useTunnel) => onPatch({ useTunnel })}
        />

        {!form.useTunnel && error && (
            <div className="text-sm text-error break-words">{error}</div>
        )}
    </div>
);
