import { HistoryEntry } from '@pbcm/shared';

/**
 * The second realtime channel, alongside the Zustand stores.
 *
 * `CLIENTS_UPDATE` and `TUNNEL_UPDATE` go into stores, because they are state: a handful
 * of updates describing something the whole app reads. The three events here are a stream
 * — log lines arrive many times a second for exactly one visible component, and putting
 * them in a store would re-render every subscriber on every chunk.
 *
 * That reasoning was sound; what was wrong was the delivery. This used to be
 * `window.dispatchEvent(new CustomEvent('pbcm:log_update', …))`, so the payload type was
 * *asserted* at each listener rather than guaranteed, the events were invisible to the
 * React DevTools, and every subscriber needed an `as EventListener` cast to compile.
 */

/**
 * Every event this channel carries, with the payload it carries.
 *
 * The payload types come from `@pbcm/shared`, the same contracts the WebSocket messages
 * are validated against — so the channel cannot drift from the socket that feeds it.
 */
export interface RealtimeEvents {
    /**
     * A job changed state. `clientId` travels alongside because the agent's status update
     * carries no client columns, and dropping it here is what once produced
     * "Unknown Client" in the history list.
     */
    jobUpdate: { clientId: string; job: HistoryEntry };

    /** One chunk of a running job's output. `jobId` is the run id, not the job config id. */
    logUpdate: {
        clientId: string;
        jobId: string;
        output: string;
        stream: 'stdout' | 'stderr';
    };

    /** The agent recalculated when a scheduled job runs next. */
    jobNextRunUpdate: {
        clientId: string;
        jobId: string;
        nextRunAt: string | null;
    };
}

type Handler<K extends keyof RealtimeEvents> = (
    payload: RealtimeEvents[K],
) => void;

/**
 * The registry, deliberately untyped inside.
 *
 * A `{ [K in keyof RealtimeEvents]?: Set<Handler<K>> }` cannot be written to through a
 * generic key — TypeScript has to assume `K` might be instantiated as any one member, so
 * the assignment is rejected. Every implementation of this pattern lands on one cast
 * somewhere; keeping it here, behind two fully typed functions, means no caller ever
 * needs one. That is the whole improvement over the `window` bus, where the cast sat at
 * every listener instead.
 */
const handlers = new Map<string, Set<(payload: never) => void>>();

/**
 * Registers a listener and returns the function that removes it again.
 *
 * An unsubscribe function rather than a matching `off(type, fn)`: a `useEffect` can return
 * it directly, and there is no way to accidentally pass a different function reference to
 * the removal than was given to the registration — which with `removeEventListener` is a
 * silent leak.
 */
export function subscribe<K extends keyof RealtimeEvents>(
    type: K,
    handler: Handler<K>,
): () => void {
    let set = handlers.get(type);
    if (!set) {
        set = new Set();
        handlers.set(type, set);
    }
    const entry = handler as (payload: never) => void;
    set.add(entry);
    return () => {
        set.delete(entry);
    };
}

/**
 * Delivers an event to everyone listening for it.
 *
 * Iterates over a copy: a handler that unsubscribes itself while being called would
 * otherwise mutate the set mid-iteration. One throwing handler must not stop the others,
 * so each is called in its own try.
 */
export function emit<K extends keyof RealtimeEvents>(
    type: K,
    payload: RealtimeEvents[K],
): void {
    const set = handlers.get(type) as Set<Handler<K>> | undefined;
    if (!set || set.size === 0) return;

    for (const handler of [...set]) {
        try {
            handler(payload);
        } catch (e) {
            console.error(`Realtime handler for "${type}" threw`, e);
        }
    }
}
