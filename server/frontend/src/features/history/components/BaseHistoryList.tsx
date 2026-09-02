import { Activity, ChevronRight } from "lucide-react";
import { useState, useEffect, type ComponentProps } from "react";
import { formatDate } from "../../../utils";
import { JOB_STATUS } from "@pbcm/shared";
import { Badge, Card } from '@stefgo/react-ui-components';
import { DataList, DataListDef } from '@stefgo/react-ui-components';

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
}

export interface BaseHistoryListProps {
    items: BaseHistoryItem[];
    title?: string;
    showClientName?: boolean;
    emptyMessage?: string;
}

export const BaseHistoryList = ({
    items,
    title = "Recent Activity",
    showClientName = false,
    emptyMessage = "No history available",
}: BaseHistoryListProps) => {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [liveLogs, setLiveLogs] = useState<Record<string, string[]>>({});

    useEffect(() => {
        const handleLogUpdate = (e: Event) => {
            const customEvent = e as CustomEvent<{
                jobId: string;
                output: string;
            }>;
            const { jobId, output } = customEvent.detail;

            if (jobId && output) {
                setLiveLogs((prev) => ({
                    ...prev,
                    [jobId]: [...(prev[jobId] || []), output],
                }));
            }
        };

        window.addEventListener("pbcm:log_update", handleLogUpdate);
        return () =>
            window.removeEventListener("pbcm:log_update", handleLogUpdate);
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
                return (
                    <div className="w-full">
                        <div className="group">
                            <div className="flex justify-between items-start mb-1">
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`transition-all duration-200 ${isExpanded ? "rotate-90" : ""
                                            }`}
                                    >
                                        <ChevronRight size={14} className="text-text-muted" />
                                    </span>
                                    <span className="text-sm font-medium text-text-primary">
                                        {showClientName && `${item.displayName || item.hostname || "Unknown Client"} : `}
                                        {item.name || item.jobId || "Unknown Job"}
                                    </span>
                                </div>
                                <Badge
                                    variant={STATUS_BADGE_VARIANT[item.status] ?? 'neutral'}
                                    size="sm"
                                    className="uppercase font-bold"
                                >
                                    {item.status}
                                </Badge>
                            </div>
                            <div className="flex justify-between text-xs text-text-muted font-mono mt-0.5 pl-6">
                                <span>{item.id}</span>
                                <span>{formatDate(item.startTime)}</span>
                            </div>
                        </div>
                        {isExpanded && (
                            <div onClick={(e) => e.stopPropagation()}>
                                {item.status === JOB_STATUS.RUNNING &&
                                    liveLogs[item.id] &&
                                    liveLogs[item.id].length > 0 ? (
                                    <div
                                        className="mt-2 text-xs font-mono p-2 rounded whitespace-pre-wrap pl-4 ml-6 cursor-text bg-badge-info-bg text-badge-info-text"
                                    >
                                        {liveLogs[item.id].join("")}
                                    </div>
                                ) : item.error || item.stderr ? (
                                    <div
                                        className={`mt-2 text-xs font-mono p-2 rounded whitespace-pre-wrap pl-4 ml-6 cursor-text ${item.status === JOB_STATUS.FAILED
                                            ? "bg-error-bg text-error"
                                            : "bg-hover text-text-muted"
                                            }`}
                                    >
                                        {item.error || item.stderr}
                                    </div>
                                ) : item.stdout ? (
                                    <div
                                        className="mt-2 text-xs font-mono p-2 rounded whitespace-pre-wrap pl-4 ml-6 cursor-text bg-hover text-text-muted"
                                    >
                                        {item.stdout}
                                    </div>
                                ) : (
                                    <div className="mt-2 text-xs text-text-muted italic pl-4 ml-6 cursor-default">
                                        No output available
                                    </div>
                                )}
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
        >
            <DataList
                data={items}
                keyField="id"
                columns={[{ fields: itemDef }]}
                onRowClick={(item) => toggleExpand(item.id)}
                className="rounded-b-xl border-0 shadow-none flex-1"
                emptyMessage={emptyMessage}
                rowClassName="!px-5 !py-3"
                pagination={{
                    // The view owns the page state and does the slicing; it sorts across
                    // the whole set first, so a column sort is never limited to the rows
                    // that happen to be on screen.
                    defaultValue: { pageSize: 10 },
                    hideOnSinglePage: true,
                }}
            />
        </Card>
    );
};

