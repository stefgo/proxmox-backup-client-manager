import mitt from 'mitt';
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
 *
 * The registry underneath is `mitt` — about 200 bytes, and generic over the event map, so
 * the one cast the hand-written version needed is gone. What stays hand-written is the
 * two things mitt deliberately leaves out: an unsubscribe function and per-handler error
 * isolation.
 */

/**
 * Every event this channel carries, with the payload it carries.
 *
 * The payload types come from `@pbcm/shared`, the same contracts the WebSocket messages
 * are validated against — so the channel cannot drift from the socket that feeds it.
 *
 * A `type` and not an `interface`: mitt's parameter is constrained to
 * `Record<EventType, unknown>`, and an interface satisfies no index signature it does not
 * declare, while a type alias for an object literal gets one implicitly.
 */
export type RealtimeEvents = {
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
};

type Handler<K extends keyof RealtimeEvents> = (
    payload: RealtimeEvents[K],
) => void;

/**
 * One emitter for the whole app, created at module load.
 *
 * Module scope rather than a React context on purpose: the senders sit in
 * `WebSocketProvider`, the receivers in hooks several levels down, and a context would
 * make every one of them a subscriber to a value that never changes.
 */
const emitter = mitt<RealtimeEvents>();

/**
 * Registers a listener and returns the function that removes it again.
 *
 * An unsubscribe function rather than mitt's `off(type, handler)`: a `useEffect` can
 * return it directly, and there is no way to accidentally pass a different function
 * reference to the removal than was given to the registration — which is a silent leak.
 *
 * The handler is wrapped rather than registered directly, which also gives it the error
 * isolation mitt does not do: it calls its listeners in a plain loop, so one that throws
 * would stop the ones behind it. The wrapper is a fresh function on every call, so two
 * registrations of the same handler stay two independent subscriptions with two
 * independent unsubscribes.
 */
export function subscribe<K extends keyof RealtimeEvents>(
    type: K,
    handler: Handler<K>,
): () => void {
    const wrapped: Handler<K> = (payload) => {
        try {
            handler(payload);
        } catch (e) {
            console.error(`Realtime handler for "${String(type)}" threw`, e);
        }
    };

    emitter.on(type, wrapped);
    return () => {
        emitter.off(type, wrapped);
    };
}

/** Delivers an event to everyone listening for it. */
export function emit<K extends keyof RealtimeEvents>(
    type: K,
    payload: RealtimeEvents[K],
): void {
    emitter.emit(type, payload);
}
