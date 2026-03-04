import {
    HardDrive,
    Play,
    Trash2,
    Pencil,
    KeyRound,
    Plus,
} from "lucide-react";
import { usePagination } from "../../../hooks/usePagination";
import { formatDate } from "../../../utils";
import { DataTableDef } from "../../../components/DataTable";
import { DataListDef, DataListColumnDef } from "../../../components/DataList";
import { DataAction } from "../../../components/DataAction";
import { DataMultiView } from "../../../components/DataMultiView";

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
    title = "Jobs",
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

    // ── Table definitions ────────────────────────────────────────────────────
    const buildTableDefinitions = (): DataTableDef<T>[] => {
        const cols: DataTableDef<T>[] = [];

        if (showClientColumn) {
            cols.push({
                tableHeader: "Client",
                tableItemRender: (job) => {
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
            tableHeader: "Job",
            tableItemRender: (job) => {
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
            tableHeader: "Archives",
            tableItemRender: (job) => {
                const online = getStatus(job) === "online";
                return (
                    <div className={`text-sm ${online ? "text-gray-900 dark:text-white" : ""}`}>
                        {job.archives?.length || 0}
                    </div>
                );
            },
        });

        cols.push({
            tableHeader: "Schedule",
            tableItemRender: (job) => {
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
            tableHeader: "Encrypted",
            tableHeaderClassName: "w-8",
            tableItemRender: (job) => {
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
            tableHeader: "Actions",
            tableHeaderClassName: "text-center",
            tableCellClassName: "content-center",
            tableItemRender: (job) => {
                const online = getStatus(job) === "online";
                const rowId = job.clientId ? `${job.clientId}-${job.id}` : job.id;
                return (
                    <DataAction
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

    // ── List definitions ─────────────────────────────────────────────────────
    const buildListDefinitions = (): DataListColumnDef<T>[] => {
        const contentFields: DataListDef<T>[] = [];
        const actionFields: DataListDef<T>[] = [];

        if (showClientColumn) {
            contentFields.push({
                listItemRender: (job) => {
                    const isOnline = getStatus(job) === "online";
                    return (
                        <div className="flex items-center gap-2 py-1">
                            <span
                                className={`w-2 h-2 rounded-full ${isOnline ? "bg-green-500" : "bg-gray-400"}`}
                            />
                            <span
                                className={`${isOnline
                                    ? "text-gray-900 dark:text-white"
                                    : "text-inherit"
                                    }`}
                            >
                                {job.clientId && getClientName
                                    ? getClientName(job.clientId)
                                    : "Unknown"}
                            </span>
                        </div>
                    );
                },
                listLabel: null,
            });
        }

        contentFields.push({
            listItemRender: (job) => {
                const isOnline = getStatus(job) === "online";
                return (
                    <span className={isOnline ? "text-gray-900 dark:text-white" : "text-inherit"}>
                        {job.name}
                    </span>
                );
            },
            listLabel: "Name",
        });

        contentFields.push({
            listItemRender: (job) => {
                const isOnline = getStatus(job) === "online";
                return (
                    <span className={isOnline ? "text-gray-700 dark:text-[#ccc]" : "text-inherit"}>
                        {job.archives?.length || 0}
                    </span>
                );
            },
            listLabel: "Archives",
        });

        contentFields.push({
            listItemRender: (job) => {
                const isOnline = getStatus(job) === "online";
                return (
                    <span className={isOnline ? "text-gray-700 dark:text-[#ccc]" : "text-inherit"}>
                        {job.scheduleEnabled ? (
                            formatNextRun(job.nextRunAt, isOnline)
                        ) : (
                            <span className={isOnline ? "text-gray-400 dark:text-[#555]" : "text-inherit"}>
                                Manual Only
                            </span>
                        )}
                    </span>
                );
            },
            listLabel: "Schedule",
        });

        // Encryption indicator
        contentFields.push({
            listItemRender: (job) => {
                if (!job.encryption?.enabled) return null;
                const isOnline = getStatus(job) === "online";
                return (
                    <span className={`${isOnline ? "text-gray-700 dark:text-[#ccc]" : "text-inherit"} flex items-center gap-1`}>
                        <KeyRound size={14} className={isOnline ? "" : "text-inherit"} /> Yes
                    </span>
                );
            },
            listLabel: "Encrypted",
        });

        // Actions
        actionFields.push({
            listItemRender: (job) => {
                const isOnline = getStatus(job) === "online";
                return (
                    <div className="flex items-center gap-3 mt-3">
                        <DataAction
                            rowId={job.clientId ? `${job.clientId}-${job.id}` : job.id}
                            actions={[
                                {
                                    icon: Play,
                                    onClick: () => onTriggerJob(job),
                                    disabled: !isOnline,
                                    color: "green",
                                    tooltip: { enabled: "Run Now", disabled: "Client Offline" },
                                },
                                {
                                    icon: Pencil,
                                    onClick: () => onEditJob(job),
                                    disabled: !isOnline,
                                    color: "blue",
                                    tooltip: { enabled: "Edit Job", disabled: "Client Offline" },
                                },
                            ]}
                            menuEntries={[
                                {
                                    label: "Delete Job",
                                    icon: Trash2,
                                    onClick: () => onDeleteJob(job),
                                    disabled: !isOnline,
                                    disabledTitle: "Client Offline",
                                    variant: "danger",
                                },
                            ]}
                        />
                    </div>
                );
            },
            listLabel: null,
        });

        return [
            { fields: contentFields, columnClassName: "flex-1" },
            { fields: actionFields, columnClassName: "md:text-right" }
        ];
    };

    const tableItems = buildTableDefinitions();
    const listItems = buildListDefinitions();

    const newJobButton = showNewJobButton && onCreateJob && (
        <button
            onClick={onCreateJob}
            className="px-3 py-1 text-white text-xs rounded transition-colors bg-[#E54D0D] hover:bg-[#ff5f1f]"
        >
            <Plus size={12} className="inline mr-1" /> New Job
        </button>
    );

    return (
        <DataMultiView
            title={<><HardDrive size={18} className="text-gray-500 dark:text-[#888]" />{title}</>}
            extraActions={newJobButton || undefined}
            viewModeStorageKey={viewModeStorageKey}
            data={currentJobs}
            tableDef={tableItems}
            listColumns={listItems}
            keyField={(job) =>
                job.clientId ? `${job.clientId}-${job.id}` : job.id
            }
            emptyMessage="No jobs configured"
            rowClassName={(job) =>
                getStatus(job) === "online"
                    ? "align-top"
                    : "bg-gray-50 dark:bg-[#2a2a2a] text-gray-400 dark:text-[#666] opacity-75"
            }
            pagination={{
                currentPage,
                totalPages,
                itemsPerPage,
                totalItems,
                onPageChange: goToPage,
                onItemsPerPageChange: setItemsPerPage,
            }}
        />
    );
};
