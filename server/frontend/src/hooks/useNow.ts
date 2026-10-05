import { useSyncExternalStore } from 'react';
import { createClock } from '../lib/clock';

/** How often a distance moves on. Nothing below a minute is shown (`formatRelativeTime`). */
const TICK_MS = 60_000;

// One clock for the whole page: every component that shows a distance reads the same value
// and re-renders on the same tick. Each used to keep an interval of its own.
const clock = createClock(TICK_MS);

/**
 * The current time in milliseconds, renewed once a minute. For what is shown as a distance
 * from now (`formatRelativeDate`): the dashboard does not poll, so nothing else would
 * re-render a "3 minutes ago" until a message happened to arrive, and `Date.now()` during
 * render is impure.
 */
export function useNow(): number {
    return useSyncExternalStore(clock.subscribe, clock.getSnapshot);
}
