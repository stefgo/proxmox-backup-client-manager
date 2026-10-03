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
    /**
     * What the search field holds, as typed: the server looks for it in the job, the run
     * and the client. Not trimmed here, or a blank between two words could not be typed --
     * the field is filled from this.
     */
    search?: string;
    /** Only this client's runs. Never in the URL: the client's own page sets it. */
    clientId?: string;
    /** Only what the user has yet to mark as seen. Never in the URL: the dashboard sets it. */
    unseen?: boolean;
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
        search: params.get('search') || undefined,
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
    put('search', view.search);
    // What the page filtered by before it had a search: a link from then names a filter
    // nothing shows any more.
    next.delete('clientId');
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
    if (view.unseen) query.set('unseen', 'true');
    // Without the blanks around it, and not at all if that is all it holds: the server
    // refuses an empty search.
    const search = view.search?.trim();
    if (search) query.set('search', search);
    return query.toString();
}

/**
 * The view to ask the server for, given the one in the URL and the one that has stood
 * still for a moment. Only a search waits: it changes with every key, while a page or a
 * filter is one click and is asked for at once.
 */
export function requestedView(view: HistoryView, settled: HistoryView): HistoryView {
    return view.search === settled.search ? view : settled;
}

/** The last page that holds a row; 1 for an empty history. */
export function lastPage(total: number, pageSize: number): number {
    return Math.max(1, Math.ceil(total / pageSize));
}
