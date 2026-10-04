import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { JOB_STATUS } from '@pbcm/shared';
import { CheckCheck } from 'lucide-react';
import { Button, Switch, LoadingIndicator, PAGE_SIZE } from '@stefgo/react-ui-components';
import { BaseHistoryList } from './BaseHistoryList';
import { QueryError } from '../../../components/QueryError';
import { useGlobalHistory } from '../../../queries/history';
import { useMarkSeen } from '../hooks/useMarkSeen';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { lastPage, readHistoryView, requestedView, writeHistoryView, type HistoryView } from '../lib/historyView';

const PAGE_SIZES = [10, 20, 50];
/** How long the search field has to rest before the server is asked. */
const SEARCH_DELAY_MS = 300;

export const HistoryOverview = () => {
    // In the URL, so a link from the failure dot or a colleague lands on the same view.
    // Read and written as one: the router's setter does not queue, so a filter and the
    // page it resets, written by two setters, would be the second one alone.
    const [searchParams, setSearchParams] = useSearchParams();
    const view = useMemo(
        () => readHistoryView(searchParams, PAGE_SIZE.page, PAGE_SIZES),
        [searchParams],
    );
    const setView = useCallback(
        (next: HistoryView) => {
            setSearchParams((prev) => writeHistoryView(prev, next, PAGE_SIZE.page), { replace: true });
        },
        [setSearchParams],
    );
    /** A filter describes another list, so its first page is what is shown. */
    const setFilter = (filter: Pick<HistoryView, 'status' | 'search'>) => setView({ ...view, ...filter, page: 1 });

    // The field and the URL follow every key; the request waits for the pause after them.
    const requested = requestedView(view, useDebouncedValue(view, SEARCH_DELAY_MS));

    // Read again after a reconnect like everything else in the cache: runs that ended
    // while the socket was down never arrived.
    const { data, isPending, isPlaceholderData, error } = useGlobalHistory(requested);

    // Opening the page marks nothing: a failure is seen when the user says so, here or on
    // the dashboard.
    const seen = useMarkSeen();

    // A page past the end -- from a link, or because the cleanup removed what was on it --
    // would show an empty list above a total that says otherwise.
    const pastTheEnd = !!data && !isPlaceholderData && data.items.length === 0 && data.total > 0;
    useEffect(() => {
        if (pastTheEnd) setView({ ...view, page: lastPage(data.total, view.pageSize) });
    }, [pastTheEnd, data, view, setView]);

    if (isPending) {
        return <LoadingIndicator label="Loading history…" />;
    }

    if (error) {
        return <QueryError title="Could not load the history" error={error} />;
    }

    const failedOnly = view.status === JOB_STATUS.FAILED;
    // Any status counts, not only the one the switch sets: a link can name another.
    // Named after what was asked for, not what is in the field: the rows are the answer to that.
    const searched = requested.search?.trim();
    const emptyMessage = searched
        ? `No runs match “${searched}”.`
        : requested.status
            ? 'No runs match the filter'
            : undefined;

    return (
        <BaseHistoryList
            items={data.items}
            showClientName={true}
            emptyMessage={emptyMessage}
            onMarkSeen={seen.markRun}
            markingRunId={seen.markingRunId}
            action={
                seen.unseenCount > 0 && (
                    <Button size="sm" variant="secondary" icon={CheckCheck} disabled={seen.markingAll} onClick={seen.markAll}>
                        Mark all as seen
                    </Button>
                )
            }
            paging={{
                mode: 'server',
                value: { page: view.page, pageSize: view.pageSize },
                onChange: (next) => setView({ ...view, ...next }),
                totalItems: data.total,
                pageSizeOptions: PAGE_SIZES,
                // Hidden only where no page size would bring a second page: the bar is
                // also where a size picked too large is taken back.
                hideOnSinglePage: data.total <= PAGE_SIZES[0],
            }}
            searchPlaceholder="Search runs…"
            search={{
                value: view.search ?? '',
                onChange: (query) => setFilter({ status: view.status, search: query || undefined }),
            }}
            searchActions={
                <Switch
                    label="Failures only"
                    value={failedOnly}
                    onChange={(on) => setFilter({ status: on ? JOB_STATUS.FAILED : undefined, search: view.search })}
                />
            }
        />
    );
};
