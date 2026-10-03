import { useEffect, useState } from 'react';

/**
 * A value once it has stood still for `delayMs`. For what is typed and then asked of the
 * server: the field follows every key, the request the pause after them.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
    const [settled, setSettled] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setSettled(value), delayMs);
        return () => clearTimeout(timer);
    }, [value, delayMs]);

    return settled;
}
