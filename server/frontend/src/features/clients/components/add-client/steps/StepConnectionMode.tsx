import { RadioGroup, Radio, cn } from '@stefgo/react-ui-components';
import { ConnectionMode } from '../useAddClientForm';

interface StepConnectionModeProps {
    mode: ConnectionMode | null;
    onModeChange: (mode: ConnectionMode) => void;
}

const OPTIONS: { value: ConnectionMode; title: string; summary: string }[] = [
    {
        value: 'inbound',
        title: 'Inbound',
        summary: 'the client dials the server — the default, for a host that may open outbound connections.',
    },
    {
        value: 'outbound',
        title: 'Outbound',
        summary: 'the server dials the client — for a host that must not dial out, or is not allowed to.',
    },
];

const CARD = 'rounded-lg border p-4 items-start transition-colors';

/**
 * The first decision, and the one that cannot be revised: the connection mode is
 * fixed when the client is created, and changing it later means deleting the
 * client and losing its job history with it. So it gets a step of its own,
 * rather than being implied by which button was pressed.
 */
export const StepConnectionMode = ({ mode, onModeChange }: StepConnectionModeProps) => (
    <div className="space-y-4">
        <RadioGroup
            label="How do the client and the server reach each other?"
            value={mode ?? undefined}
            onChange={(next) => onModeChange(next as ConnectionMode)}
            classNames={{ options: 'gap-3' }}
        >
            {OPTIONS.map((option) => (
                <Radio
                    key={option.value}
                    value={option.value}
                    className={cn(
                        CARD,
                        mode === option.value
                            ? 'border-primary bg-hover'
                            : 'border-border hover:border-primary/50',
                    )}
                    label={
                        <span className="block">
                            <span className="block text-sm font-semibold text-text-primary">
                                {option.title}
                            </span>
                            <span className="block text-xs text-text-muted">
                                {option.summary}
                            </span>
                        </span>
                    }
                />
            ))}
        </RadioGroup>

        <p className="text-xs text-text-muted">
            This is only about who dials whom. How the client reaches the PBS is a separate
            question — an SSH reverse tunnel can be used with either mode, and switched on
            or off at any time.
        </p>
        <p className="text-xs text-text-muted">
            The mode itself is fixed once the client exists. Changing it later means
            deleting the client — and its job history goes with it.
        </p>
    </div>
);
