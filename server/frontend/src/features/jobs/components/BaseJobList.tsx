import {
    HardDrive,
    Play,
    Square,
    Trash2,
    Pencil,
    KeyRound,
    Plus,
} from 'lucide-react';
import { useCallback, useMemo, type ReactNode } from 'react';
import { CLIENT_STATUS, ClientStatus } from '@pbcm/shared';
import { EMPTY_VALUE, formatDate, formatRelativeDate } from '../../../utils';
import { useNow } from '../../../hooks/useNow';
import { parseTimestamp } from '../../../lib/time';
import { RunStatusBadge } from '../../history/components/RunStatusBadge';
import { runSummary } from '../../history/lib/runSummary';
import type { LastRun } from '../lib/lastRun';
import { canAbortRun } from '../../history/lib/runAbort';
import { useAbortRunAction } from '../../../hooks/useAbortRunAction';
import { EntityLink } from '../../../components/EntityLink';
import { paths } from '../../../lib/paths';
import {
    Button,
    DataAction,
    DataMultiView,
    EmptyState,
    StatusDot,
    type DataColumnDef,
    type DataColumnView,
    PAGE_SIZE,
    listPagination,
    actionsColumn,
    listGroups,
} from '@stefgo/react-ui-components';
import { useSearchQueryParam } from '../../../hooks/useSearchQueryParam';
import { STATUS_DOT, STATUS_TONE } from '../../../components/statusTone';
import type { StorageKey } from '../../../lib/storageKeys';

/**
 * The structural contract this list needs -- deliberately closed. An index
 * signature here would suppress TS2551 for every T that passes the constraint,
 * so a misspelled `job.acrhives` would compile and yield undefined at runtime.
 * A new job kind declares its field explicitly instead.
 */
export interface BaseJobItem {
    id: string | null;
    clientId?: string;
    name: string;
    // Only the count is ever read, so the element type stays opaque.
    archives?: unknown[];
    scheduleEnabled?: boolean;
    nextRunAt?: string;
    encryption?: {
        enabled?: boolean;
    };
}

interface CellProps {
    view: DataColumnView;
    /** Whether the job's client is online; a row that is not takes the muted colour of its row. */
    online: boolean;
    /** The colour of the value while the client is online. */
    tone: string;
    /** What the table adds to the value that names the row. */
    emphasis?: string;
    children: ReactNode;
}

/**
 * A value as each view sets it: the table gives it its own size, the list leaves that to
 * the field. The one place the two views of a column differ, so a column is written once.
 */
const Cell = ({ view, online, tone, emphasis, children }: CellProps) =>
    view === 'list' ? (
        <span className={online ? tone : 'text-inherit'}>{children}</span>
    ) : (
        <div className={`text-sm ${online ? [emphasis, tone].filter(Boolean).join(' ') : ''}`}>{children}</div>
    );

export interface BaseJobListProps<T extends BaseJobItem> {
    jobs: T[];
    title?: string;
    showClientColumn?: boolean;
    showNewJobButton?: boolean;
    onEditJob: (job: T) => void;
    onTriggerJob: (job: T) => void;
    onDeleteJob: (job: T) => void;
    onCreateJob?: () => void;
    getClientStatus?: (clientId: string) => ClientStatus;
    getClientName?: (clientId: string) => string;
    /**
     * The client every job belongs to, for a list whose jobs do not name it themselves:
     * the job tab of a client's page. It is what an abort is addressed to.
     */
    clientId?: string;
    /**
     * The newest run of a job, `undefined` for one that never ran. Given, the list has the
     * columns "Last Run" and "Last Status" -- whether the backup ran is answered in the
     * row of the job -- and a job whose last run is still under way offers to abort it
     * where it otherwise offers to start one.
     */
    getLastRun?: (job: T) => LastRun | undefined;
    /**
     * What an empty list says instead of "No jobs configured yet" -- for a caller that
     * knows why it is empty, and that this is not the same as having no jobs.
     */
    emptyMessage?: ReactNode;
    /** Storage key for the remembered view toggle; the scope is always the browser. */
    viewModePersistKey: StorageKey;
    /**
     * The query parameter this list's search is kept in. The caller namespaces it where
     * several lists share a route, so each tab remembers its own search instead of
     * inheriting the one next door.
     */
    searchParamKey?: string;
    /** Rows per page: `PAGE_SIZE.page` where the list is the page, embedded otherwise. */
    pageSize?: number;
}

export const BaseJobList = <T extends BaseJobItem>({
    jobs,
    title = 'Jobs',
    showClientColumn = false,
    showNewJobButton = false,
    onEditJob,
    onTriggerJob,
    onDeleteJob,
    onCreateJob,
    getClientStatus,
    getClientName,
    clientId,
    getLastRun,
    emptyMessage,
    viewModePersistKey,
    searchParamKey = 'search',
    pageSize = PAGE_SIZE.embedded,
}: BaseJobListProps<T>) => {
    const [searchQuery, setSearchQuery] = useSearchQueryParam(searchParamKey);
    const now = useNow();
    const requestAbort = useAbortRunAction();

    const sortedJobs = useMemo(
        () => [...jobs].sort((a, b) => {
            if (showClientColumn && getClientName) {
                return (getClientName(a.clientId ?? '') ?? '').localeCompare(getClientName(b.clientId ?? '') ?? '');
            }
            return a.name.localeCompare(b.name);
        }),
        [jobs, showClientColumn, getClientName],
    );

    // Handed to the view instead of applied in front of it: only then can the view tell an
    // empty search from an empty list, and page through what the search left.
    const matchesSearch = useCallback((j: T, query: string) => {
        const q = query.toLowerCase();
        return j.name.toLowerCase().includes(q) ||
            (j.id ?? '').toLowerCase().includes(q) ||
            (j.clientId && getClientName ? getClientName(j.clientId).toLowerCase().includes(q) : false);
    }, [getClientName]);

    const formatNextRun = (nextRunAt: string | undefined, isOnline: boolean) => {
        if (!nextRunAt) return <span className="text-text-muted">not defined</span>;
        const date = new Date(nextRunAt);
        const isDue = date.getTime() < now;

        if (!isOnline) {
            return (
                <span className="text-text-muted grayscale">
                    {isDue ? 'Pending' : formatRelativeDate(date, now)}
                </span>
            );
        }
        if (isDue) {
            // An overdue run on an online client is a warning, and `warning` is the
            // role for it — the palette colour this used to name resolves to the same
            // orange in light mode but has no counterpart in the library's dark block.
            return <span className="text-warning font-semibold">Pending</span>;
        }
        return (
            <span className="text-success">
                {formatRelativeDate(date, now)}
            </span>
        );
    };

    const getStatus = (job: T): ClientStatus => {
        if (!showClientColumn || !getClientStatus || !job.clientId)
            return CLIENT_STATUS.ONLINE;
        return getClientStatus(job.clientId);
    };

    const isOnline = (job: T) => getStatus(job) === CLIENT_STATUS.ONLINE;
    const clientName = (job: T) => (job.clientId && getClientName ? getClientName(job.clientId) : 'Unknown');
    const rowId = (job: T) => (job.clientId ? `${job.clientId}-${job.id || 'new'}` : (job.id || 'new'));

    // One set of actions for both views, so the table and the list cannot drift apart.
    const renderActions = (job: T) => {
        const online = isOnline(job);
        const run = getLastRun?.(job);
        const abortClientId = job.clientId ?? clientId;
        // One slot, two meanings: a job that is running cannot usefully be started again
        // -- that would only queue a second run -- but it can be stopped.
        const runOrAbort =
            run && abortClientId && canAbortRun(run)
                ? {
                    icon: Square,
                    onClick: () =>
                        requestAbort({ clientId: abortClientId, runId: run.id, name: job.name, type: 'backup' }),
                    disabled: !online,
                    color: 'error' as const,
                    tooltip: { enabled: 'Abort Run', disabled: 'Client Offline' },
                }
                : {
                    icon: Play,
                    onClick: () => onTriggerJob(job),
                    disabled: !online,
                    color: 'green' as const,
                    tooltip: { enabled: 'Run Now', disabled: 'Client Offline' },
                };
        return (
            <DataAction
                rowId={rowId(job)}
                actions={[
                    runOrAbort,
                    {
                        icon: Pencil,
                        onClick: () => onEditJob(job),
                        disabled: !online,
                        color: 'blue',
                        tooltip: { enabled: 'Edit Job', disabled: 'Client Offline' },
                    },
                ]}
                menuEntries={[
                    {
                        label: 'Delete Job',
                        icon: Trash2,
                        onClick: () => onDeleteJob(job),
                        disabled: !online,
                        disabledTitle: 'Client Offline',
                        variant: 'danger',
                    },
                ]}
            />
        );
    };

    const clientColumn: DataColumnDef<T> = {
        header: 'Client',
        sortable: true,
        sortValue: (job) => (job.clientId && getClientName ? getClientName(job.clientId) : '') ?? '',
        list: { label: null },
        render: (job, view) => {
            const online = isOnline(job);
            const dot = <StatusDot size="sm" {...STATUS_DOT[online ? STATUS_TONE.ONLINE : STATUS_TONE.OFFLINE]} label={getStatus(job)} />;
            // The way to the client's page, where its history and its snapshots are.
            const name = job.clientId
                ? <EntityLink to={paths.client(job.clientId)}>{clientName(job)}</EntityLink>
                : clientName(job);
            return view === 'list' ? (
                <div className="flex items-center gap-2 py-1">
                    {dot}
                    <span className={online ? 'text-text-primary' : 'text-inherit'}>{name}</span>
                </div>
            ) : (
                <div className="flex items-center gap-3 mb-1">
                    {dot}
                    <div className={`text-sm ${online ? 'text-text-primary' : ''} max-w-[150px] truncate`} title={clientName(job)}>
                        {name}
                    </div>
                </div>
            );
        },
    };

    // Two columns rather than one cell: when a job last ran and how that went are sorted
    // by separately -- "which failed" is not "which ran longest ago".
    const lastRunColumn: DataColumnDef<T> = {
        header: 'Last Run',
        sortable: true,
        sortValue: (job) => parseTimestamp(getLastRun?.(job)?.startTime)?.getTime() ?? 0,
        render: (job, view) => {
            const run = getLastRun?.(job);
            if (!run) {
                return (
                    <Cell view={view} online={isOnline(job)} tone="text-text-muted">
                        Never
                    </Cell>
                );
            }
            return (
                <Cell view={view} online={isOnline(job)} tone="text-text-muted">
                    <span className="whitespace-nowrap">{formatDate(run.startTime)}</span>
                </Cell>
            );
        },
    };

    // How long the last run took and what it left behind: fields of the list only. The
    // table has no room for two more columns, and says when the job ran and how that went.
    const summaryOf = (job: T) => {
        const run = getLastRun?.(job);
        return run ? runSummary(run) : null;
    };

    const lastDurationColumn: DataColumnDef<T> = {
        header: 'Duration',
        table: false,
        render: (job, view) => (
            <Cell view={view} online={isOnline(job)} tone="text-text-muted">
                {summaryOf(job)?.duration ?? EMPTY_VALUE}
            </Cell>
        ),
    };

    const lastSizeColumn: DataColumnDef<T> = {
        header: 'Size',
        table: false,
        render: (job, view) => (
            <Cell view={view} online={isOnline(job)} tone="text-text-muted">
                {summaryOf(job)?.size ?? EMPTY_VALUE}
            </Cell>
        ),
    };

    const lastStatusColumn: DataColumnDef<T> = {
        header: 'Last Status',
        sortable: true,
        sortValue: (job) => getLastRun?.(job)?.status ?? '',
        render: (job, view) => {
            const run = getLastRun?.(job);
            // A job that never ran has no status; "Never" stands in the column beside.
            if (!run) {
                return (
                    <Cell view={view} online={isOnline(job)} tone="text-text-muted">
                        {EMPTY_VALUE}
                    </Cell>
                );
            }
            const badge = <RunStatusBadge status={run.status} />;
            // In the table the badge gets a box as tall as a line of the cells beside it
            // (`text-sm`) and sits in its middle. Left inline, it stands on the baseline
            // of the cell's own, taller line and ends up below the text of its row.
            return view === 'list' ? badge : <div className="flex h-5 items-center">{badge}</div>;
        },
    };

    // ── Columns, each once for the table and the list ────────────────────────
    const columns: DataColumnDef<T>[] = [
        ...(showClientColumn ? [clientColumn] : []),
        { header: 'ID', accessorKey: 'id', table: false },
        {
            header: 'Job',
            sortable: true,
            sortValue: (job) => job.name,
            list: { label: 'Name' },
            render: (job, view) => (
                <Cell view={view} online={isOnline(job)} tone="text-text-primary" emphasis="font-medium">
                    {job.name}
                </Cell>
            ),
        },
        {
            header: 'Archives',
            sortable: true,
            sortValue: (job) => job.archives?.length ?? 0,
            render: (job, view) => (
                <Cell view={view} online={isOnline(job)} tone="text-text-primary">
                    {job.archives?.length || 0}
                </Cell>
            ),
        },
        ...(getLastRun ? [lastRunColumn, lastDurationColumn, lastSizeColumn, lastStatusColumn] : []),
        {
            header: 'Schedule',
            sortable: true,
            sortValue: (job) => job.nextRunAt ?? '',
            render: (job, view) => {
                const online = isOnline(job);
                return (
                    <Cell view={view} online={online} tone="text-text-muted">
                        {job.scheduleEnabled ? (
                            formatNextRun(job.nextRunAt, online)
                        ) : (
                            <span className={online ? 'text-text-muted' : 'text-inherit'}>Manual Only</span>
                        )}
                    </Cell>
                );
            },
        },
        {
            header: 'Encrypted',
            table: { headerClassName: 'w-8' },
            // The table has a narrow column for the key alone; the list spells it out.
            render: (job, view) => {
                if (!job.encryption?.enabled) return null;
                if (view === 'table') return <KeyRound size={16} className="text-text-muted" />;
                const online = isOnline(job);
                return (
                    <span className={`${online ? 'text-text-muted' : 'text-inherit'} flex items-center gap-1`}>
                        <KeyRound size={14} className={online ? '' : 'text-inherit'} /> Yes
                    </span>
                );
            },
        },
        actionsColumn(renderActions, { listClassName: 'flex items-center justify-center gap-3 mt-3' }),
    ];

    const newJobButton = showNewJobButton && onCreateJob && (
        <Button size="sm" icon={Plus} onClick={onCreateJob}>
            New Job
        </Button>
    );

    return (
        <DataMultiView
            title={<><HardDrive size={18} className="text-text-muted" />{title}</>}
            extraActions={newJobButton || undefined}
            sort={{ defaultValue: [{ colIndex: 0, direction: 'asc' }] }}
            viewMode={{ persist: { key: viewModePersistKey, scope: 'local' } }}
            data={sortedJobs}
            columns={columns}
            listGroups={listGroups()}
            keyField={rowId}
            searchable
            searchPlaceholder="Search jobs…"
            search={{ value: searchQuery, onChange: setSearchQuery }}
            searchFilter={matchesSearch}
            noResultsMessage={`No jobs match “${searchQuery}”.`}
            emptyMessage={
                emptyMessage ?? (
                    <EmptyState
                        icon={HardDrive}
                        title="No jobs configured yet"
                        description="A job backs up paths of a client into a repository, on a schedule or on demand."
                    />
                )
            }
            rowClassName={(job) =>
                getStatus(job) === CLIENT_STATUS.ONLINE
                    ? 'align-top'
                    : 'bg-app-bg text-text-muted opacity-75'
            }
            pagination={listPagination(pageSize)}
        />
    );
};
