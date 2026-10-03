import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { JOB_STATUS } from '@pbcm/shared';
import { Select, Switch, LoadingIndicator } from '@stefgo/react-ui-components';
import { BaseHistoryList } from './BaseHistoryList';
import { QueryError } from '../../../components/QueryError';
import { markHistorySeen, useGlobalHistory } from '../../../queries/history';
import { useClients } from '../../../queries/clients';
import { PAGE_SIZE } from '../../../components/listDefaults';
import { lastPage, readHistoryView, writeHistoryView, type HistoryView } from '../lib/historyView';

const PAGE_SIZES = [10, 20, 50];
const ALL_CLIENTS = '';

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
    const setFilter = (filter: Pick<HistoryView, 'status' | 'clientId'>) => setView({ ...view, ...filter, page: 1 });

    // Read again after a reconnect like everything else in the cache: runs that ended
    // while the socket was down never arrived.
    const { data, isPending, isPlaceholderData, error } = useGlobalHistory(view);
    const { clients } = useClients();

    // Seen on the way in and again on the way out: a failure that arrives while the page
    // is open appears in it, so it has been seen as well.
    useEffect(() => {
        markHistorySeen();
        return () => {
            markHistorySeen();
        };
    }, []);

    // A page past the end -- from a link, or because the cleanup removed what was on it --
    // would show an empty list above a total that says otherwise.
    const pastTheEnd = !!data && !isPlaceholderData && data.items.length === 0 && data.total > 0;
    useEffect(() => {
        if (pastTheEnd) setView({ ...view, page: lastPage(data.total, view.pageSize) });
    }, [pastTheEnd, data, view, setView]);

    const clientOptions = useMemo(() => {
        const options = clients
            .map((c) => ({ value: c.id, label: c.displayName || c.hostname }))
            .sort((a, b) => a.label.localeCompare(b.label));
        // A run outlives its client, and a link can name one that is gone: it stays
        // selected under its id rather than silently reading as "all".
        if (view.clientId && !options.some((o) => o.value === view.clientId)) {
            options.push({ value: view.clientId, label: view.clientId });
        }
        return [{ value: ALL_CLIENTS, label: 'All clients' }, ...options];
    }, [clients, view.clientId]);

    if (isPending) {
        return <LoadingIndicator label="Loading history…" />;
    }

    if (error) {
        return <QueryError title="Could not load the history" error={error} />;
    }

    const failedOnly = view.status === JOB_STATUS.FAILED;
    // Any status counts, not only the one the switch sets: a link can name another.
    const filtered = !!view.status || !!view.clientId;

    return (
        <BaseHistoryList
            items={data.items}
            showClientName={true}
            emptyMessage={filtered ? 'No runs match the filter' : undefined}
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
            action={
                <div className="flex items-center gap-4">
                    <Select
                        aria-label="Client"
                        fullWidth={false}
                        value={view.clientId ?? ALL_CLIENTS}
                        options={clientOptions}
                        onChange={(e) => setFilter({ status: view.status, clientId: e.target.value || undefined })}
                    />
                    <Switch
                        label="Failures only"
                        value={failedOnly}
                        onChange={(on) => setFilter({ status: on ? JOB_STATUS.FAILED : undefined, clientId: view.clientId })}
                    />
                </div>
            }
        />
    );
};
