import type { AlertOptions } from '@stefgo/react-ui-components';

/** What a value that is not there yet shows, such as the last run of a scheduler that never ran. */
export const EMPTY_VALUE = '–';

export const formatDate = (
    date: Date | string | number | null | undefined,
): string => {
    if (!date) return "Never";

    let d = new Date(date);

    if (typeof date === "string") {
        // Handle SQLite default format "YYYY-MM-DD HH:MM:SS" -> Treat as UTC
        if (date.includes(" ") && !date.includes("T")) {
            d = new Date(date.replace(" ", "T") + "Z");
        }
    }

    if (isNaN(d.getTime())) {
        return "Invalid Date";
    }

    return new Intl.DateTimeFormat("de-DE", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(d);
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
    `${String(date.getMonth() + 1).padStart(2, "0")}-` +
    `${String(date.getDate()).padStart(2, "0")}`;

/** Value for an <input type="time">, in the viewer's own timezone. */
export const toLocalTimeInput = (date: Date): string =>
    `${String(date.getHours()).padStart(2, "0")}:` +
    `${String(date.getMinutes()).padStart(2, "0")}`;

export const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
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
