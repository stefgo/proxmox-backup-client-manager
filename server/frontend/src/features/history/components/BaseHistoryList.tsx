import { Activity, Check, ChevronRight, Square, Tag } from 'lucide-react';
import { useState, useEffect, type ReactNode } from 'react';
import { formatDate } from '../../../utils';
import { subscribe } from '../../../lib/realtimeEvents';
import { JOB_PHASE, JOB_STATUS, jobRunEventKind, type RunSnapshotDetails } from '@pbcm/shared';
import { Badge, Button, DataMultiView } from '@stefgo/react-ui-components';
import { DataListDef, type Controllable, type PaginationProps } from '@stefgo/react-ui-components';
import { PAGE_SIZE, pagination } from '../../../components/listDefaults';
import { runOutput, type RunOutput } from '../lib/runOutput';
import { runSummary } from '../lib/runSummary';
import { RunLog } from './RunLog';
import { canAbortRun } from '../lib/runAbort';
import { useAbortRunAction } from '../../../hooks/useAbortRunAction';
import { statusBadgeVariant } from '../lib/statusBadge';
import { EntityLink } from '../../../components/EntityLink';
import { paths } from '../../../lib/paths';

export interface BaseHistoryItem {
    id: string;
    clientId?: string;
    // Nullable rather than merely absent: job_history.job_id may be NULL, and the
    // global endpoint LEFT JOINs clients, so hostname/displayName are null once a
    // history row outlives its client.
    jobId?: string | null;
    name?: string | null;
    type: string;
    status: string;
    startTime: string;
    endTime?: string | null;
    exitCode?: number | null;
    stdout?: string | null;
    stderr?: string | null;
    error?: string;
    hostname?: string | null;
    displayName?: string | null;
    /** Set on a live update while the run is still `running` after its CLI exited. */
    phase?: string | null;
    snapshot?: string | null;
    snapshotDetails?: RunSnapshotDetails | null;
    snapshotError?: string | null;
    /** Whether the user has yet to mark the run as seen. Only the paged history says. */
    unseen?: boolean;
}

/** The status as the badge names it: a run reading back its snapshot says so. */
const statusLabel = (item: BaseHistoryItem): string =>
    item.status === JOB_STATUS.RUNNING && item.phase === JOB_PHASE.SNAPSHOT
        ? 'reading snapshot'
        : item.status;

const NOTE_CLASS = 'mt-2 text-xs text-text-muted italic pl-4 ml-6 cursor-default';

const renderOutput = (output: RunOutput) => {
    switch (output.kind) {
        case 'live':
            return <RunLog text={output.text} tone="live" follow />;
        case 'log':
            return <RunLog text={output.text} tone={output.failed ? 'failed' : 'plain'} />;
        case 'waiting':
            return <div className={NOTE_CLASS}>Waiting for output…</div>;
        case 'none':
            return <div className={NOTE_CLASS}>No output available</div>;
    }
};

/** A successful backup whose snapshot details could not be read. */
const lacksSnapshotDetails = (item: BaseHistoryItem): boolean =>
    item.type === 'backup' &&
    item.status === JOB_STATUS.SUCCESS &&
    !!item.snapshotError &&
    !item.snapshotDetails;

/**
 * The client a run belongs to, as a way to its page. A run outlives its client: one whose
 * client is gone has no name left and nothing to link to.
 */
const clientName = (item: BaseHistoryItem) => {
    const name = item.displayName || item.hostname;
    if (!name) return 'Unknown Client';
    return item.clientId ? <EntityLink to={paths.client(item.clientId)}>{name}</EntityLink> : name;
};

export interface BaseHistoryListProps {
    items: BaseHistoryItem[];
    title?: string;
    showClientName?: boolean;
    /**
     * The client every row belongs to, for a list whose rows do not name it themselves:
     * the runs an agent reports of itself. It is what an abort is addressed to.
     */
    clientId?: string;
    emptyMessage?: string;
    /** Controls in the card header, e.g. a filter. */
    action?: ReactNode;
    /** Rows per page: `PAGE_SIZE.page` where the list is the page, embedded otherwise. */
    pageSize?: number;
    /**
     * Replaces the paging the list does itself. For a caller whose `items` are one page
     * the server cut: it passes `mode: 'server'`, the page and the total.
     */
    paging?: PaginationProps;
    /**
     * The search field, for a caller that searches: without it the list has no search
     * bar. The query is the caller's to act on -- the rows are not filtered here, since
     * a list in pages holds one page and the server has the rest.
     */
    search?: Controllable<string>;
    searchPlaceholder?: string;
    /** Controls at the right end of the search bar, which narrow the same list. */
    searchActions?: ReactNode;
    /** Gives every run that is `unseen` a button to mark it as seen. */
    onMarkSeen?: (runId: string) => void;
    /** The run whose mark is on its way. */
    markingRunId?: string;
}

export const BaseHistoryList = ({
    items,
    title = 'Recent Activity',
    showClientName = false,
    clientId,
    emptyMessage = 'No history available',
    action,
    pageSize = PAGE_SIZE.embedded,
    paging,
    search,
    searchPlaceholder,
    searchActions,
    onMarkSeen,
    markingRunId,
}: BaseHistoryListProps) => {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [liveLogs, setLiveLogs] = useState<Record<string, string[]>>({});
    const requestAbort = useAbortRunAction();

    useEffect(() => {
        return subscribe('logUpdate', ({ jobId, output }) => {
            if (!jobId || !output) return;
            setLiveLogs((prev) => ({
                ...prev,
                [jobId]: [...(prev[jobId] || []), output],
            }));
        });
    }, []);

    const toggleExpand = (id: string) => {
        const newSet = new Set(expandedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setExpandedIds(newSet);
    };

    const itemDef: DataListDef<BaseHistoryItem>[] = [
        {
            listItemRender: (item) => {
                const isExpanded = expandedIds.has(item.id);
                // The kind a webhook filter and `{{event.kind}}` know this run by, once it has ended.
                const eventKind = jobRunEventKind(item.status);
                const summary = runSummary(item);
                // A run whose client is gone has nobody to send the request to.
                const abortClientId = item.clientId ?? clientId;
                return (
                    <div className="w-full">
                        <div className="group">
                            <div className="flex justify-between items-start mb-1">
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`transition-all duration-200 ${isExpanded ? 'rotate-90' : ''
                                            }`}
                                    >
                                        <ChevronRight size={14} className="text-text-muted" />
                                    </span>
                                    <span className="text-sm font-medium text-text-primary">
                                        {showClientName && <>{clientName(item)} : </>}
                                        {item.name || item.jobId || 'Unknown Job'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {onMarkSeen && item.unseen && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            icon={Check}
                                            disabled={markingRunId === item.id}
                                            // The row opens on a click; this one is not for it.
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onMarkSeen(item.id);
                                            }}
                                        >
                                            Mark as seen
                                        </Button>
                                    )}
                                    {lacksSnapshotDetails(item) && (
                                        <Badge variant="warning" size="sm" className="uppercase font-bold">
                                            no snapshot details
                                        </Badge>
                                    )}
                                    <Badge
                                        variant={statusBadgeVariant(item.status)}
                                        size="sm"
                                        className="uppercase font-bold"
                                    >
                                        {statusLabel(item)}
                                    </Badge>
                                </div>
                            </div>
                            <div className="flex justify-between gap-3 text-xs text-text-muted mt-0.5 pl-6">
                                <span className="flex items-center gap-2 min-w-0">
                                    {eventKind && (
                                        <span className="inline-flex items-center gap-1 text-[11px] bg-hover px-1.5 py-0.5 rounded">
                                            <Tag size={10} /> {eventKind}
                                        </span>
                                    )}
                                    {/* What the backup left behind, where the eye already is. */}
                                    {summary.size && <span>{summary.size}</span>}
                                </span>
                                {/* When and how long, as one statement -- the way the job
                                    list's "Last Run" reads. */}
                                <span className="shrink-0">
                                    {[formatDate(item.startTime), summary.duration].filter(Boolean).join(' · ')}
                                </span>
                            </div>
                        </div>
                        {isExpanded && (
                            <div onClick={(e) => e.stopPropagation()}>
                                {/* The id is what a log line or a webhook names the run by:
                                    looked up, not scanned, so it waits here. */}
                                <div className="mt-2 flex items-center justify-between gap-3 pl-4 ml-6">
                                    <span className="text-xs text-text-muted font-mono cursor-text break-all">
                                        Run {item.id}
                                    </span>
                                    {abortClientId && canAbortRun(item) && (
                                        <Button
                                            size="sm"
                                            variant="outline-danger"
                                            icon={Square}
                                            className="shrink-0"
                                            onClick={() =>
                                                requestAbort({
                                                    clientId: abortClientId,
                                                    runId: item.id,
                                                    name: item.name || item.jobId || 'Unknown Job',
                                                    type: item.type,
                                                })
                                            }
                                        >
                                            Abort
                                        </Button>
                                    )}
                                </div>
                                {renderOutput(runOutput(item, liveLogs[item.id]))}
                            </div>
                        )}
                    </div>
                );
            },
        },
    ];

    return (
        <DataMultiView
            title={
                <div className="flex items-center gap-2">
                    <Activity size={18} className="text-text-muted" />
                    {title}
                </div>
            }
            extraActions={action}
            data={items}
            keyField="id"
            // A list only: a run is a row that opens onto its log, which a table has no place for.
            listColumns={[{ fields: itemDef }]}
            onRowClick={(item) => toggleExpand(item.id)}
            emptyMessage={emptyMessage}
            rowClassName="!px-5 !py-3"
            pagination={paging ?? pagination(pageSize)}
            searchable={!!search}
            search={search}
            searchPlaceholder={searchPlaceholder}
            searchActions={searchActions}
        />
    );
};

