import { useEffect, useState } from 'react';

const TICK_MS = 60_000;

/**
 * The current time, renewed once a minute. For what is shown as a distance from now
 * (`formatRelativeDate`): the dashboard does not poll, so nothing else would re-render a
 * "3 minutes ago" until a message happened to arrive.
 */
export function useNow(): Date {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), TICK_MS);
        return () => clearInterval(timer);
    }, []);

    return now;
}
