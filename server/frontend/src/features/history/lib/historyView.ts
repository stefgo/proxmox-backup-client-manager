import { JOB_STATUS, type JobStatus } from '@pbcm/shared';

/**
 * What the history page shows: which page of which filter. It lives in the URL, so a
 * reload and a shared link land on the same rows, and it is what the request is built
 * from.
 */
export interface HistoryView {
    /** One-based, as the pagination bar counts. */
    page: number;
    pageSize: number;
    status?: JobStatus;
    clientId?: string;
}

const STATUSES: readonly string[] = Object.values(JOB_STATUS);

const isJobStatus = (value: string): value is JobStatus => STATUSES.includes(value);

/** A whole number above zero, or the fallback: `?page=abc`, `?page=0` and no page at all read the same. */
function positiveInt(raw: string | null, fallback: number): number {
    if (raw === null || !/^\d+$/.test(raw)) return fallback;
    const value = Number(raw);
    return value >= 1 ? value : fallback;
}

/**
 * Reads the view out of the query string. Whatever does not parse falls back to the
 * default instead of reaching the server: a status no run can have would be answered with
 * a 400, and a typo in a link should show the history, not an error.
 */
export function readHistoryView(
    params: URLSearchParams,
    defaultPageSize: number,
    pageSizes: readonly number[],
): HistoryView {
    const status = params.get('status') ?? '';
    const pageSize = positiveInt(params.get('pageSize'), defaultPageSize);
    return {
        page: positiveInt(params.get('page'), 1),
        // Only a size the bar offers: the server would take any up to its own limit.
        pageSize: pageSizes.includes(pageSize) ? pageSize : defaultPageSize,
        status: isJobStatus(status) ? status : undefined,
        clientId: params.get('clientId') || undefined,
    };
}

/**
 * Writes the view into the query string, next to whatever else is in it. A default is
 * removed rather than written, so the plain history has a plain URL.
 */
export function writeHistoryView(
    params: URLSearchParams,
    view: HistoryView,
    defaultPageSize: number,
): URLSearchParams {
    const next = new URLSearchParams(params);
    const put = (key: string, value: string | undefined) => {
        if (value) next.set(key, value);
        else next.delete(key);
    };
    put('page', view.page > 1 ? String(view.page) : undefined);
    put('pageSize', view.pageSize !== defaultPageSize ? String(view.pageSize) : undefined);
    put('status', view.status);
    put('clientId', view.clientId);
    return next;
}

/** The query of `GET /api/v1/history` for a view: the page as limit and offset. */
export function historyQueryString(view: HistoryView): string {
    const query = new URLSearchParams({
        limit: String(view.pageSize),
        offset: String((view.page - 1) * view.pageSize),
    });
    if (view.status) query.set('status', view.status);
    if (view.clientId) query.set('clientId', view.clientId);
    return query.toString();
}

/** The last page that holds a row; 1 for an empty history. */
export function lastPage(total: number, pageSize: number): number {
    return Math.max(1, Math.ceil(total / pageSize));
}
