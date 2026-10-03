import { Activity, ChevronRight, Tag } from 'lucide-react';
import { useState, useEffect, type ComponentProps, type ReactNode } from 'react';
import { formatDate } from '../../../utils';
import { subscribe } from '../../../lib/realtimeEvents';
import { JOB_PHASE, JOB_STATUS, jobRunEventKind, type RunSnapshotDetails } from '@pbcm/shared';
import { Badge, Card } from '@stefgo/react-ui-components';
import { DataList, DataListDef, type PaginationProps } from '@stefgo/react-ui-components';
import { PAGE_SIZE, pagination } from '../../../components/listDefaults';
import { runOutput, type RunOutput } from '../lib/runOutput';
import { runSummary } from '../lib/runSummary';

// The status maps to a role, not to a colour -- Badge owns what each role
// looks like, in both themes. "neutral" covers idle, queued, skipped and
// anything an older agent might report.
type BadgeVariant = ComponentProps<typeof Badge>['variant'];

const STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
    [JOB_STATUS.RUNNING]: 'info',
    [JOB_STATUS.SUCCESS]: 'success',
    [JOB_STATUS.FAILED]: 'error',
    [JOB_STATUS.ABORTED]: 'warning',
};

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
}

/** The status as the badge names it: a run reading back its snapshot says so. */
const statusLabel = (item: BaseHistoryItem): string =>
    item.status === JOB_STATUS.RUNNING && item.phase === JOB_PHASE.SNAPSHOT
        ? 'reading snapshot'
        : item.status;

const LOG_CLASS = 'mt-2 text-xs font-mono p-2 rounded whitespace-pre-wrap pl-4 ml-6 cursor-text';
const NOTE_CLASS = 'mt-2 text-xs text-text-muted italic pl-4 ml-6 cursor-default';

const renderOutput = (output: RunOutput) => {
    switch (output.kind) {
        case 'live':
            return <div className={`${LOG_CLASS} bg-badge-info-bg text-badge-info-text`}>{output.text}</div>;
        case 'log':
            return (
                <div className={`${LOG_CLASS} ${output.failed ? 'bg-error-bg text-error' : 'bg-hover text-text-muted'}`}>
                    {output.text}
                </div>
            );
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

export interface BaseHistoryListProps {
    items: BaseHistoryItem[];
    title?: string;
    showClientName?: boolean;
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
}

export const BaseHistoryList = ({
    items,
    title = 'Recent Activity',
    showClientName = false,
    emptyMessage = 'No history available',
    action,
    pageSize = PAGE_SIZE.embedded,
    paging,
}: BaseHistoryListProps) => {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [liveLogs, setLiveLogs] = useState<Record<string, string[]>>({});

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
                const { duration, size } = runSummary(item);
                const facts = [duration, size].filter((fact) => fact !== null);
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
                                        {showClientName && `${item.displayName || item.hostname || 'Unknown Client'} : `}
                                        {item.name || item.jobId || 'Unknown Job'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {lacksSnapshotDetails(item) && (
                                        <Badge variant="warning" size="sm" className="uppercase font-bold">
                                            no snapshot details
                                        </Badge>
                                    )}
                                    <Badge
                                        variant={STATUS_BADGE_VARIANT[item.status] ?? 'neutral'}
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
                                    {/* What the run came to, where the eye already is. */}
                                    {facts.length > 0 && <span>{facts.join(' · ')}</span>}
                                </span>
                                <span className="font-mono shrink-0">{formatDate(item.startTime)}</span>
                            </div>
                        </div>
                        {isExpanded && (
                            <div onClick={(e) => e.stopPropagation()}>
                                {/* The id is what a log line or a webhook names the run by:
                                    looked up, not scanned, so it waits here. */}
                                <div className="mt-2 text-xs text-text-muted font-mono pl-4 ml-6 cursor-text break-all">
                                    Run {item.id}
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
        <Card
            className="h-full flex flex-col"
            title={
                <div className="flex items-center gap-2">
                    <Activity size={18} className="text-text-muted" />
                    {title}
                </div>
            }
            action={action}
        >
            <DataList
                data={items}
                keyField="id"
                columns={[{ fields: itemDef }]}
                onRowClick={(item) => toggleExpand(item.id)}
                className="rounded-b-xl border-0 shadow-none flex-1"
                emptyMessage={emptyMessage}
                rowClassName="!px-5 !py-3"
                pagination={paging ?? pagination(pageSize)}
            />
        </Card>
    );
};

