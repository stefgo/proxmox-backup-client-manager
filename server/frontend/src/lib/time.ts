/**
 * A timestamp as the server and the agents send it, as a `Date` -- `null` for none and for
 * one that does not parse.
 *
 * SQLite's default format, `YYYY-MM-DD HH:MM:SS`, carries no zone and is UTC. Read as it
 * stands it would be taken for local time, and a run would start hours off.
 */
export function parseTimestamp(value: Date | string | number | null | undefined): Date | null {
    if (value === null || value === undefined || value === '') return null;
    const date =
        typeof value === 'string' && value.includes(' ') && !value.includes('T')
            ? new Date(value.replace(' ', 'T') + 'Z')
            : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * A span of time in the two units that say most about it: `45s`, `3m 12s`, `1h 04m`.
 * Whole seconds, rounded down -- a run of 900 ms took `0s`.
 */
export function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${pad(seconds % 60)}s`;
    return `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m`;
}

/**
 * How long something took that started at `start` and ended at `end`, in milliseconds.
 * `null` while it has not ended, and for an end before its start -- two clocks that
 * disagree are no duration.
 */
export function durationBetween(
    start: string | null | undefined,
    end: string | null | undefined,
): number | null {
    const from = parseTimestamp(start);
    const to = parseTimestamp(end);
    if (!from || !to) return null;
    const ms = to.getTime() - from.getTime();
    return ms >= 0 ? ms : null;
}

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How far `date` lies from `now`, in the one unit that says most about it: `3 minutes ago`,
 * `in 5 hours`, `yesterday`. Rounded down, so `in 2 hours` is never less than two.
 *
 * English whatever the browser's language: it is a phrase inside the labels of an English
 * interface, where a date is only digits. Nothing below a minute is counted -- the caller
 * re-renders once a minute (`useNow`), and a count of seconds would be stale as it appears.
 */
export function formatRelativeTime(date: Date, now: Date): string {
    const ms = date.getTime() - now.getTime();
    const span = Math.abs(ms);
    if (span < MINUTE) return ms <= 0 ? 'just now' : 'in less than a minute';

    const [size, unit] =
        span < HOUR
            ? ([MINUTE, 'minute'] as const)
            : span < DAY
                ? ([HOUR, 'hour'] as const)
                : span < 30 * DAY
                    ? ([DAY, 'day'] as const)
                    : span < 365 * DAY
                        ? ([30 * DAY, 'month'] as const)
                        : ([365 * DAY, 'year'] as const);
    return RELATIVE.format(Math.sign(ms) * Math.floor(span / size), unit);
}
