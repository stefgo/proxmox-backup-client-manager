/**
 * The visual states a status dot has, independent of what the domain calls them — which is
 * why this lives here and not in `@pbcm/shared`: it is a palette, not part of the wire
 * contract. `ClientTunnelCard` maps `TunnelStatus` onto it precisely because the two
 * vocabularies are allowed to differ.
 *
 * Derived from the constant like every status vocabulary in `shared`, so the tone table in
 * `StatusDot` cannot fall behind it. It sits in its own module rather than next to that
 * component because a value export beside a component costs Fast Refresh — see the
 * `react-refresh/only-export-components` note in `eslint.config.js`.
 */
export const STATUS_TONE = {
    ONLINE: 'online',
    CONNECTING: 'connecting',
    ERROR: 'error',
    OFFLINE: 'offline',
} as const;

export type StatusTone = (typeof STATUS_TONE)[keyof typeof STATUS_TONE];
