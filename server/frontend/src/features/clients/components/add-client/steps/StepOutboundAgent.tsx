import { Input } from '@stefgo/react-ui-components';
import { OutboundForm } from '../useAddClientForm';

interface StepOutboundAgentProps {
    form: OutboundForm;
    onPatch: (patch: Partial<OutboundForm>) => void;
}

/** Where the server finds the agent, and what proves it may talk to it. */
export const StepOutboundAgent = ({ form, onPatch }: StepOutboundAgentProps) => (
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
    </div>
);
