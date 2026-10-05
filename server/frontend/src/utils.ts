import type { AlertOptions } from '@stefgo/react-ui-components';
import { formatRelativeTime, parseTimestamp } from './lib/time';

/** What a value that is not there yet shows, such as the last run of a scheduler that never ran. */
export const EMPTY_VALUE = '–';

/**
 * A point in time as the viewer's own locale writes it. `locale` is for a caller that must
 * not depend on where it runs; left out, the browser's is taken.
 */
export const formatDate = (
    date: Date | string | number | null | undefined,
    locale?: string,
): string => {
    if (!date) return 'Never';

    const d = parseTimestamp(date);
    if (!d) return 'Invalid Date';

    return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(d);
};

/**
 * A point in time by its distance from `now`: `3 minutes ago`, `in 5 hours`. For the two
 * things an operator reads as a distance -- when a client was last seen and when a job runs
 * next. Everything that is looked up rather than glanced at stays a date (`formatDate`).
 */
export const formatRelativeDate = (
    date: Date | string | number | null | undefined,
    now: number,
): string => {
    if (!date) return 'Never';

    const d = parseTimestamp(date);
    if (!d) return 'Invalid Date';

    return formatRelativeTime(d, new Date(now));
};

/**
 * A byte count in binary units, as the PBS shows sizes: `1.2 GiB`. `EMPTY_VALUE` for a size
 * that is not known.
 */
export const formatBytes = (bytes: number | null | undefined): string => {
    if (bytes == null || !Number.isFinite(bytes)) return EMPTY_VALUE;
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${unit === 0 ? value : value.toFixed(value < 10 ? 2 : 1)} ${units[unit]}`;
};

/**
 * Value for an <input type="date">, in the viewer's own timezone.
 *
 * Not toISOString().split("T")[0] — that is the UTC date, which east of Greenwich
 * is tomorrow's for most of the evening. Pairing it with a local clock time, as the
 * job form used to, silently moved a schedule by a day.
 */
export const toLocalDateInput = (date: Date): string =>
    `${date.getFullYear()}-` +
    `${String(date.getMonth() + 1).padStart(2, '0')}-` +
    `${String(date.getDate()).padStart(2, '0')}`;

/** Value for an <input type="time">, in the viewer's own timezone. */
export const toLocalTimeInput = (date: Date): string =>
    `${String(date.getHours()).padStart(2, '0')}:` +
    `${String(date.getMinutes()).padStart(2, '0')}`;

export const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
};

/**
 * A failure as a notice: the title says what did not happen, the server's message why.
 * For an action that was not asked about first -- one that was reports its failure inside
 * its own dialog instead (see `onConfirm` in useConfirm).
 */
export const describeFailure = (title: string, error: unknown): AlertOptions => ({
    title,
    description: getErrorMessage(error),
});
