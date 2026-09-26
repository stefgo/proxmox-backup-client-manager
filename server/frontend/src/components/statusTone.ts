import type { StatusDotProps } from '@stefgo/react-ui-components';

/**
 * The visual states a status dot has, independent of what the domain calls them — which is
 * why this lives here and not in `@pbcm/shared`: it is a palette, not part of the wire
 * contract. `ClientTunnelCard` maps `TunnelStatus` onto it precisely because the two
 * vocabularies are allowed to differ.
 */
export const STATUS_TONE = {
    ONLINE: 'online',
    CONNECTING: 'connecting',
    ERROR: 'error',
    OFFLINE: 'offline',
} as const;

export type StatusTone = (typeof STATUS_TONE)[keyof typeof STATUS_TONE];

/**
 * How each tone is drawn by the library's `StatusDot`: `<StatusDot {...STATUS_DOT[tone]} />`.
 * Connecting pulses without the glow, which the library reserves for success.
 */
export const STATUS_DOT: Record<StatusTone, Pick<StatusDotProps, 'tone' | 'pulse'>> = {
    [STATUS_TONE.ONLINE]: { tone: 'success' },
    [STATUS_TONE.CONNECTING]: { tone: 'warning', pulse: true },
    [STATUS_TONE.ERROR]: { tone: 'error' },
    [STATUS_TONE.OFFLINE]: { tone: 'neutral' },
};
