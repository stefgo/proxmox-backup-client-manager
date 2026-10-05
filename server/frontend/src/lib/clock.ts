/** A clock that moves in steps: what `useSyncExternalStore` subscribes to and reads. */
export interface Clock {
    subscribe: (listener: () => void) => () => void;
    getSnapshot: () => number;
}

/**
 * One clock for everything that subscribes to it: every reader gets the same value and is
 * told on the same tick, instead of each keeping an interval of its own. The interval runs
 * only while something is subscribed; the first subscriber sets the clock, so a value left
 * over from before a pause is never shown as the time.
 */
export function createClock(tickMs: number): Clock {
    let now = Date.now();
    let timer: ReturnType<typeof setInterval> | null = null;
    const listeners = new Set<() => void>();

    return {
        subscribe(listener) {
            listeners.add(listener);
            if (!timer) {
                now = Date.now();
                timer = setInterval(() => {
                    now = Date.now();
                    listeners.forEach((l) => l());
                }, tickMs);
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0 && timer) {
                    clearInterval(timer);
                    timer = null;
                }
            };
        },
        getSnapshot: () => now,
    };
}
