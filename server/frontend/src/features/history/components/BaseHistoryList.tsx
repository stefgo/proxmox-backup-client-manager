import { Activity, ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";
import { usePagination } from "../../../hooks/usePagination";
import { formatDate } from "../../../utils";
import { Card } from '@stefgo/react-ui-components';
import { DataList, DataListDef } from '@stefgo/react-ui-components';

export interface BaseHistoryItem {
    id: string;
    clientId?: string;
    jobId?: string;
    name?: string | null;
    type: string;
    status: string;
    startTime: string;
    endTime?: string | null;
    exitCode?: number | null;
    stdout?: string | null;
    stderr?: string | null;
    error?: string;
    hostname?: string;
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
    const {
        currentItems,
        currentPage,
        totalPages,
        itemsPerPage,
        totalItems,
        goToPage,
        setItemsPerPage,
    } = usePagination(items, 10);

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
                                    <span className="text-sm font-medium text-text-primary dark:text-text-primary-dark">
                                        {showClientName && `${item.displayName || item.hostname || "Unknown Client"} : `}
                                        {item.name || item.jobId || "Unknown Job"}
                                    </span>
                                </div>
                                <span
                                    className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${item.status === "running"
                                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                        : item.status === "success"
                                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                            : item.status === "failed"
                                                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                                : item.status === "abort"
                                                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                                    : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                                        }`}
                                >
                                    {item.status}
                                </span>
                            </div>
                            <div className="flex justify-between text-xs text-text-muted font-mono mt-0.5 pl-6">
                                <span>{item.id}</span>
                                <span>{formatDate(item.startTime)}</span>
                            </div>
                        </div>
                        {isExpanded && (
                            <div onClick={(e) => e.stopPropagation()}>
                                {item.status === "running" &&
                                    liveLogs[item.id] &&
                                    liveLogs[item.id].length > 0 ? (
                                    <div
                                        className="mt-2 text-xs font-mono p-2 rounded whitespace-pre-wrap pl-4 ml-6 cursor-text bg-blue-50 dark:bg-blue-900/10 text-blue-800 dark:text-blue-300"
                                    >
                                        {liveLogs[item.id].join("")}
                                    </div>
                                ) : item.error || item.stderr ? (
                                    <div
                                        className={`mt-2 text-xs font-mono p-2 rounded whitespace-pre-wrap pl-4 ml-6 cursor-text ${item.status === "failed"
                                            ? "bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400"
                                            : "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                                            }`}
                                    >
                                        {item.error || item.stderr}
                                    </div>
                                ) : item.stdout ? (
                                    <div
                                        className="mt-2 text-xs font-mono p-2 rounded whitespace-pre-wrap pl-4 ml-6 cursor-text bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
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
                data={currentItems}
                keyField="id"
                columns={[{ fields: itemDef }]}
                onRowClick={(item) => toggleExpand(item.id)}
                containerClassName="rounded-b-xl border-0 shadow-none flex-1"
                emptyMessage={emptyMessage}
                rowClassName="!px-5 !py-3"
                pagination={{
                    currentPage,
                    totalPages,
                    itemsPerPage,
                    totalItems,
                    onPageChange: goToPage,
                    onItemsPerPageChange: setItemsPerPage,
                }}
            />
        </Card>
    );
};

