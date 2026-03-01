import { useState } from "react";
import {
    HardDrive,
    Play,
    MoreVertical,
    Trash2,
    Pencil,
    LayoutList,
    Table as TableIcon,
    KeyRound,
    Plus,
} from "lucide-react";
import { usePagination } from "../../../hooks/usePagination";
import { PaginationControls } from "../../../components/PaginationControls";
import { formatDate } from "../../../utils";
import { ActionButton } from "../../../components/ActionButton";
import { DataTable, ColumnDef } from "../../../components/DataTable";
import { DataTableAction } from "../../../components/DataTableAction";

export interface BaseJobItem {
    id: string;
    clientId?: string;
    name: string;
    archives?: any[];
    scheduleEnabled?: boolean;
    nextRunAt?: string;
    encryption?: {
        enabled?: boolean;
    };
    [key: string]: any;
}

export interface BaseJobListProps<T extends BaseJobItem> {
    jobs: T[];
    title?: string;
    showClientColumn?: boolean;
    showNewJobButton?: boolean;
    onEditJob: (job: T) => void;
    onTriggerJob: (job: T) => void;
    onDeleteJob: (job: T) => void;
    onCreateJob?: () => void;
    getClientStatus?: (clientId: string) => "online" | "offline";
    getClientName?: (clientId: string) => string;
    viewModeStorageKey?: string;
}

export const BaseJobList = <T extends BaseJobItem>({
    jobs,
    title = "Classified Jobs",
    showClientColumn = false,
    showNewJobButton = false,
    onEditJob,
    onTriggerJob,
    onDeleteJob,
    onCreateJob,
    getClientStatus,
    getClientName,
    viewModeStorageKey = "jobViewMode",
}: BaseJobListProps<T>) => {
    const [viewMode, setViewMode] = useState<"table" | "list">(() => {
        return (
            (localStorage.getItem(viewModeStorageKey) as "table" | "list") ||
            "table"
        );
    });

    const [jobMenuState, setJobMenuState] = useState<{
        id: string;
        clientId?: string;
        x: number;
        y: number;
    } | null>(null);

    const changeViewMode = (mode: "table" | "list") => {
        setViewMode(mode);
        localStorage.setItem(viewModeStorageKey, mode);
    };

    const {
        currentItems: currentJobs,
        currentPage,
        totalPages,
        itemsPerPage,
        totalItems,
        goToPage,
        setItemsPerPage,
    } = usePagination(jobs, 10);

    const formatNextRun = (nextRunAt: string | undefined, isOnline: boolean) => {
        if (!nextRunAt) return <span className="text-gray-500">not defined</span>;
        const date = new Date(nextRunAt);
        const now = new Date();

        if (!isOnline) {
            return (
                <span className="text-gray-400 dark:text-[#666] grayscale">
                    {date < now ? "Pending" : formatDate(date)}
                </span>
            );
        }
        if (date < now) {
            return <span className="text-orange-500 font-semibold">Pending</span>;
        }
        return (
            <span className="text-green-600 dark:text-green-500">
                {formatDate(date)}
            </span>
        );
    };

    const getStatus = (job: T): "online" | "offline" => {
        if (!showClientColumn || !getClientStatus || !job.clientId) return "online";
        return getClientStatus(job.clientId);
    };

    // ── Header actions ───────────────────────────────────────────────────────
    const headerActions = (
        <>
            <div className="bg-gray-200 dark:bg-[#333] rounded-lg p-1 flex items-center gap-1">
                <button
                    onClick={() => changeViewMode("table")}
                    className={`p-1 rounded transition-all ${viewMode === "table"
                        ? "bg-white dark:bg-[#444] shadow text-gray-900 dark:text-white"
                        : "text-gray-500 dark:text-[#888] hover:text-gray-900 dark:hover:text-white"
                        }`}
                    title="Table View"
                >
                    <TableIcon size={14} />
                </button>
                <button
                    onClick={() => changeViewMode("list")}
                    className={`p-1 rounded transition-all ${viewMode === "list"
                        ? "bg-white dark:bg-[#444] shadow text-gray-900 dark:text-white"
                        : "text-gray-500 dark:text-[#888] hover:text-gray-900 dark:hover:text-white"
                        }`}
                    title="List View"
                >
                    <LayoutList size={14} />
                </button>
            </div>
            {showNewJobButton && onCreateJob && (
                <button
                    onClick={onCreateJob}
                    className="px-3 py-1 text-white text-xs rounded transition-colors bg-[#E54D0D] hover:bg-[#ff5f1f]"
                >
                    <Plus size={12} className="inline mr-1" /> New Job
                </button>
            )}
        </>
    );

    // ── Column definitions for DataTable table-view ──────────────────────────
    const buildColumns = (): ColumnDef<T>[] => {
        const cols: ColumnDef<T>[] = [];

        if (showClientColumn) {
            cols.push({
                header: "Client",
                accessorFn: (job) => {
                    const online = getStatus(job) === "online";
                    return (
                        <div className="flex items-center gap-3 mb-1">
                            <div
                                className={`w-2 h-2 rounded-full shrink-0 ${online
                                    ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]"
                                    : "bg-gray-400 dark:bg-[#444]"
                                    }`}
                            />
                            <div
                                className={`text-sm ${online ? "text-gray-900 dark:text-white" : ""
                                    } max-w-[150px] truncate`}
                                title={
                                    job.clientId && getClientName
                                        ? getClientName(job.clientId)
                                        : "Unknown"
                                }
                            >
                                {job.clientId && getClientName
                                    ? getClientName(job.clientId)
                                    : "Unknown"}
                            </div>
                        </div>
                    );
                },
            });
        }

        cols.push({
            header: "Job",
            accessorFn: (job) => {
                const online = getStatus(job) === "online";
                return (
                    <>
                        <div
                            className={`text-sm ${online ? "font-medium text-gray-900 dark:text-white" : ""
                                }`}
                        >
                            {job.name}
                        </div>
                        <div className="text-xs font-mono text-gray-500 dark:text-[#666] truncate opacity-70 mt-0.5">
                            {job.id}
                        </div>
                    </>
                );
            },
        });

        cols.push({
            header: "Archives",
            accessorFn: (job) => {
                const online = getStatus(job) === "online";
                return (
                    <div className={`text-sm ${online ? "text-gray-900 dark:text-white" : ""}`}>
                        {job.archives?.length || 0}
                    </div>
                );
            },
        });

        cols.push({
            header: "Schedule",
            accessorFn: (job) => {
                const online = getStatus(job) === "online";
                return (
                    <div className={`text-sm ${online ? "text-gray-500 dark:text-[#ccc]" : ""}`}>
                        {job.scheduleEnabled ? (
                            formatNextRun(job.nextRunAt, online)
                        ) : (
                            <span className={online ? "text-gray-400 dark:text-[#555]" : ""}>
                                Manual Only
                            </span>
                        )}
                    </div>
                );
            },
        });

        // Encryption indicator
        cols.push({
            header: "",
            headerClassName: "w-8",
            accessorFn: (job) => {
                const online = getStatus(job) === "online";
                return job.encryption?.enabled ? (
                    <KeyRound
                        size={16}
                        className={
                            online
                                ? "text-gray-500 dark:text-[#ccc]"
                                : "text-gray-400 dark:text-[#444]"
                        }
                    />
                ) : null;
            },
        });

        // Actions
        cols.push({
            header: "Actions",
            headerClassName: "text-right",
            cellClassName: "align-middle text-right",
            accessorFn: (job) => {
                const online = getStatus(job) === "online";
                const rowId = job.clientId ? `${job.clientId}-${job.id}` : job.id;
                return (
                    <DataTableAction
                        rowId={rowId}
                        actions={[
                            {
                                icon: Play,
                                onClick: () => onTriggerJob(job),
                                disabled: !online,
                                color: "green",
                                tooltip: { enabled: "Run Now", disabled: "Client Offline" },
                            },
                            {
                                icon: Pencil,
                                onClick: () => onEditJob(job),
                                disabled: !online,
                                color: "blue",
                                tooltip: { enabled: "Edit Job", disabled: "Client Offline" },
                            },
                        ]}
                        menuEntries={[
                            {
                                label: "Delete Job",
                                icon: Trash2,
                                onClick: () => onDeleteJob(job),
                                disabled: !online,
                                disabledTitle: "Client Offline",
                                variant: "danger",
                            },
                        ]}
                    />
                );
            },
        });

        return cols;
    };

    const columns = buildColumns();

    return (
        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-gray-200 dark:border-[#333] overflow-hidden shadow-lg h-full flex flex-col">
            {/* ── Shared Header ───────────────────────────────────────────── */}
            <div className="px-5 py-4 border-b border-gray-200 dark:border-[#333] flex justify-between items-center bg-gray-50 dark:bg-[#252525] shrink-0">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <HardDrive size={18} className="text-gray-500 dark:text-[#888]" />
                    {title}
                </h3>
                <div className="flex items-center gap-3">{headerActions}</div>
            </div>

            {/* ── Table View via DataTable ─────────────────────────────────── */}
            {viewMode === "table" ? (
                <DataTable
                    title=""
                    data={currentJobs}
                    columns={columns}
                    keyField={(job) =>
                        job.clientId ? `${job.clientId}-${job.id}` : job.id
                    }
                    emptyMessage="No jobs configured"
                    rowClassName={(job) =>
                        getStatus(job) === "online"
                            ? "hover:bg-gray-50 align-top dark:hover:bg-[#252525]"
                            : "text-gray-400 align-top dark:text-[#666]"
                    }
                    pagination={{
                        currentPage,
                        totalPages,
                        itemsPerPage,
                        totalItems,
                        onPageChange: goToPage,
                        onItemsPerPageChange: setItemsPerPage,
                    }}
                    containerClassName="rounded-none border-0 shadow-none flex-1"
                />
            ) : (
                /* ── List View (unchanged) ──────────────────────────────────── */
                <div className="flex-1 overflow-x-auto min-h-0 flex flex-col">
                    <div className="divide-y divide-gray-200 dark:divide-[#333] flex-1">
                        {currentJobs.map((job) => {
                            const isOnline = getStatus(job) === "online";
                            const rowClass = isOnline
                                ? "hover:bg-gray-50 dark:hover:bg-[#252525]"
                                : "bg-gray-50 dark:bg-[#2a2a2a] text-gray-400 dark:text-[#666] *:[text-gray-400] *:[dark:text-[#666]] opacity-75";

                            return (
                                <div
                                    key={job.clientId ? `${job.clientId}-${job.id}` : job.id}
                                    className={`p-5 transition-colors group ${rowClass}`}
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            {showClientColumn && (
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div
                                                        className={`w-2 h-2 rounded-full ${isOnline ? "bg-green-500" : "bg-gray-400"
                                                            }`}
                                                    />
                                                    <span
                                                        className={`text-xs font-bold ${isOnline
                                                            ? "text-gray-500 dark:text-[#888]"
                                                            : "text-inherit"
                                                            } uppercase tracking-wider`}
                                                    >
                                                        {job.clientId && getClientName
                                                            ? getClientName(job.clientId)
                                                            : "Unknown"}
                                                    </span>
                                                </div>
                                            )}
                                            <h4
                                                className={`text-lg font-bold ${isOnline
                                                    ? "text-gray-900 dark:text-white"
                                                    : "text-inherit"
                                                    } mb-2`}
                                            >
                                                {job.name}
                                            </h4>
                                            <div className="space-y-1">
                                                <div className="flex items-start gap-2 text-sm">
                                                    <span
                                                        className={`font-semibold ${isOnline
                                                            ? "text-gray-500 dark:text-[#888]"
                                                            : "text-inherit"
                                                            } min-w-[100px]`}
                                                    >
                                                        Job ID:
                                                    </span>
                                                    <span
                                                        className={
                                                            isOnline
                                                                ? "text-gray-700 dark:text-[#ccc]"
                                                                : "text-inherit"
                                                        }
                                                    >
                                                        {job.id}
                                                    </span>
                                                </div>
                                                <div className="flex items-start gap-2 text-sm">
                                                    <span
                                                        className={`font-semibold ${isOnline
                                                            ? "text-gray-500 dark:text-[#888]"
                                                            : "text-inherit"
                                                            } min-w-[100px]`}
                                                    >
                                                        Archives:
                                                    </span>
                                                    <span
                                                        className={
                                                            isOnline
                                                                ? "text-gray-700 dark:text-[#ccc]"
                                                                : "text-inherit"
                                                        }
                                                    >
                                                        {job.archives?.length || 0}
                                                    </span>
                                                </div>
                                                <div className="flex items-start gap-2 text-sm">
                                                    <span
                                                        className={`font-semibold ${isOnline
                                                            ? "text-gray-500 dark:text-[#888]"
                                                            : "text-inherit"
                                                            } min-w-[100px]`}
                                                    >
                                                        Schedule:
                                                    </span>
                                                    <span
                                                        className={
                                                            isOnline
                                                                ? "text-gray-700 dark:text-[#ccc]"
                                                                : "text-inherit"
                                                        }
                                                    >
                                                        {job.scheduleEnabled ? (
                                                            formatNextRun(job.nextRunAt, isOnline)
                                                        ) : (
                                                            <span
                                                                className={
                                                                    isOnline
                                                                        ? "text-gray-400 dark:text-[#555]"
                                                                        : "text-inherit"
                                                                }
                                                            >
                                                                Manual Only
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                                {job.encryption?.enabled && (
                                                    <div className="flex items-start gap-2 text-sm">
                                                        <span
                                                            className={`font-semibold ${isOnline
                                                                ? "text-gray-500 dark:text-[#888]"
                                                                : "text-inherit"
                                                                } min-w-[100px]`}
                                                        >
                                                            Encrypted:
                                                        </span>
                                                        <span
                                                            className={`${isOnline
                                                                ? "text-gray-700 dark:text-[#ccc]"
                                                                : "text-inherit"
                                                                } flex items-center gap-1`}
                                                        >
                                                            <KeyRound
                                                                size={14}
                                                                className={isOnline ? "" : "text-inherit"}
                                                            />{" "}
                                                            Yes
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 ml-4">
                                            <ActionButton
                                                icon={Play}
                                                onClick={() => onTriggerJob(job)}
                                                disabled={!isOnline}
                                                color="green"
                                                tooltip={{
                                                    enabled: "Run Now",
                                                    disabled: "Client Offline",
                                                }}
                                            />
                                            <ActionButton
                                                icon={Pencil}
                                                onClick={() => onEditJob(job)}
                                                disabled={!isOnline}
                                                color="blue"
                                                tooltip={{
                                                    enabled: "Edit Job",
                                                    disabled: "Client Offline",
                                                }}
                                            />
                                            <div className="relative">
                                                <ActionButton
                                                    icon={MoreVertical}
                                                    onClick={(e) => {
                                                        const rect =
                                                            e.currentTarget.getBoundingClientRect();
                                                        setJobMenuState(
                                                            jobMenuState?.id === job.id &&
                                                                jobMenuState?.clientId === job.clientId
                                                                ? null
                                                                : {
                                                                    id: job.id,
                                                                    clientId: job.clientId,
                                                                    x: rect.right,
                                                                    y: rect.bottom,
                                                                },
                                                        );
                                                    }}
                                                    disabled={!isOnline}
                                                    color="gray"
                                                    className={
                                                        jobMenuState?.id === job.id &&
                                                            jobMenuState?.clientId === job.clientId
                                                            ? "opacity-100 bg-gray-100 dark:bg-[#333]"
                                                            : ""
                                                    }
                                                />
                                                {jobMenuState?.id === job.id &&
                                                    jobMenuState?.clientId === job.clientId &&
                                                    isOnline && (
                                                        <>
                                                            <div
                                                                className="fixed inset-0 z-40"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setJobMenuState(null);
                                                                }}
                                                            />
                                                            <div
                                                                className="fixed mt-2 w-48 bg-white dark:bg-[#1e1e1e] rounded-md shadow-lg border border-gray-200 dark:border-[#333] z-50 py-1"
                                                                style={{
                                                                    top: jobMenuState.y,
                                                                    left: jobMenuState.x - 192,
                                                                }}
                                                            >
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        onDeleteJob(job);
                                                                        setJobMenuState(null);
                                                                    }}
                                                                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 flex items-center gap-2"
                                                                >
                                                                    <Trash2 size={14} /> Delete Job
                                                                </button>
                                                            </div>
                                                        </>
                                                    )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {jobs.length === 0 && (
                            <div className="p-8 text-center text-[#555]">
                                No jobs configured
                            </div>
                        )}
                    </div>
                    <PaginationControls
                        currentPage={currentPage}
                        totalPages={totalPages}
                        itemsPerPage={itemsPerPage}
                        totalItems={totalItems}
                        onPageChange={goToPage}
                        onItemsPerPageChange={setItemsPerPage}
                    />
                </div>
            )}
        </div>
    );
};
