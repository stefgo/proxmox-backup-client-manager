import { STATUS_TONE, type StatusTone } from './statusTone';

export type { StatusTone };

interface StatusDotProps {
    tone: StatusTone;
    /**
     * The domain's own word for the state — "online", "up", "connecting". The dot carries it
     * for anything that cannot see colour, which is why no badge beside it has to repeat it.
     */
    label: string;
    /** `md` for a card header, `sm` for a row in a list. */
    size?: 'sm' | 'md';
}

const TONE_CLASSES: Record<StatusTone, string> = {
    // The glow exists only in the success variant of the preset, so the other tones make do
    // with the plain pulse — the same pairing `RepositoryList` has used all along.
    [STATUS_TONE.ONLINE]: 'bg-success shadow-glow-success animate-pulse-glow',
    [STATUS_TONE.CONNECTING]: 'bg-warning animate-pulse',
    [STATUS_TONE.ERROR]: 'bg-error',
    [STATUS_TONE.OFFLINE]: 'bg-border',
};

/**
 * The connection indicator used across the client surfaces: a coloured dot, and the state's
 * word on it rather than beside it.
 *
 * A `span`, not a `div`, so it is valid inside a heading as well as inside a `div` title —
 * as a flex child it is blockified either way.
 */
export const StatusDot = ({ tone, label, size = 'md' }: StatusDotProps) => (
    <span
        className={`rounded-full shrink-0 ${size === 'md' ? 'w-3 h-3' : 'w-2 h-2'} ${TONE_CLASSES[tone]}`}
        role="img"
        aria-label={label}
        title={label}
    />
);
