import {
    HardDrive,
    Play,
    Trash2,
    Pencil,
    KeyRound,
    Plus,
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatDate } from "../../../utils";
import { DataTableDef } from '@stefgo/react-ui-components';
import { DataListDef, DataListColumnDef } from '@stefgo/react-ui-components';
import { DataAction } from '@stefgo/react-ui-components';
import { DataMultiView } from '@stefgo/react-ui-components';

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
    const [searchQuery, setSearchQuery] = useState('');

    const sortedJobs = useMemo(
        () => [...jobs].sort((a, b) => {
            if (showClientColumn && getClientName) {
                return (getClientName(a.clientId ?? '') ?? '').localeCompare(getClientName(b.clientId ?? '') ?? '');
            }
            return a.name.localeCompare(b.name);
        }),
        [jobs, showClientColumn, getClientName],
    );

    const filteredJobs = useMemo(() => {
        if (!searchQuery) return sortedJobs;
        const q = searchQuery.toLowerCase();
        return sortedJobs.filter(j =>
            j.name.toLowerCase().includes(q) ||
            (j.id ?? '').toLowerCase().includes(q) ||
            (j.clientId && getClientName ? getClientName(j.clientId).toLowerCase().includes(q) : false),
        );
    }, [sortedJobs, searchQuery, getClientName]);

    const formatNextRun = (nextRunAt: string | undefined, isOnline: boolean) => {
        if (!nextRunAt) return <span className="text-text-muted">not defined</span>;
        const date = new Date(nextRunAt);
        const now = new Date();

        if (!isOnline) {
            return (
                <span className="text-text-muted grayscale">
                    {date < now ? "Pending" : formatDate(date)}
                </span>
            );
        }
        if (date < now) {
            return <span className="text-orange-500 font-semibold">Pending</span>;
        }
        return (
            <span className="text-success">
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
                sortable: true,
                sortValue: (job) => (job.clientId && getClientName ? getClientName(job.clientId) : '') ?? '',
                tableItemRender: (job) => {
                    const online = getStatus(job) === "online";
                    return (
                        <div className="flex items-center gap-3 mb-1">
                            <div
                                className={`w-2 h-2 rounded-full shrink-0 ${online
                                    ? "bg-success shadow-glow-success"
                                    : "bg-border"
                                    }`}
                            />
                            <div
                                className={`text-sm ${online ? "text-text-primary" : ""
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
            sortable: true,
            sortValue: (job) => job.name,
            tableItemRender: (job) => {
                const online = getStatus(job) === "online";
                return (
                    <>
                        <div
                            className={`text-sm ${online ? "font-medium text-text-primary" : ""
                                }`}
                        >
                            {job.name}
                        </div>
                        <div className="text-xs font-mono text-text-muted truncate opacity-70 mt-0.5">
                            {job.id}
                        </div>
                    </>
                );
            },
        });

        cols.push({
            tableHeader: "Archives",
            sortable: true,
            sortValue: (job) => job.archives?.length ?? 0,
            tableItemRender: (job) => {
                const online = getStatus(job) === "online";
                return (
                    <div className={`text-sm ${online ? "text-text-primary" : ""}`}>
                        {job.archives?.length || 0}
                    </div>
                );
            },
        });

        cols.push({
            tableHeader: "Schedule",
            sortable: true,
            sortValue: (job) => job.nextRunAt ?? '',
            tableItemRender: (job) => {
                const online = getStatus(job) === "online";
                return (
                    <div className={`text-sm ${online ? "text-text-muted" : ""}`}>
                        {job.scheduleEnabled ? (
                            formatNextRun(job.nextRunAt, online)
                        ) : (
                            <span className={online ? "text-text-muted" : ""}>
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
                                ? "text-text-muted"
                                : "text-text-muted"
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
                const rowId = job.clientId ? `${job.clientId}-${job.id || 'new'}` : (job.id || 'new');
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
                                className={`w-2 h-2 rounded-full ${isOnline ? "bg-success" : "bg-border"}`}
                            />
                            <span
                                className={`${isOnline
                                    ? "text-text-primary"
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
            accessorKey: 'id',
            listLabel: 'ID'
        });

        contentFields.push({
            listItemRender: (job) => {
                const isOnline = getStatus(job) === "online";
                return (
                    <span className={isOnline ? "text-text-primary" : "text-inherit"}>
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
                    <span className={isOnline ? "text-text-primary" : "text-inherit"}>
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
                    <span className={isOnline ? "text-text-muted" : "text-inherit"}>
                        {job.scheduleEnabled ? (
                            formatNextRun(job.nextRunAt, isOnline)
                        ) : (
                            <span className={isOnline ? "text-text-muted" : "text-inherit"}>
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
                    <span className={`${isOnline ? "text-text-muted" : "text-inherit"} flex items-center gap-1`}>
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
                    <div className="flex items-center justify-center gap-3 mt-3">
                        <DataAction
                            rowId={job.clientId ? `${job.clientId}-${job.id || 'new'}` : (job.id || 'new')}
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
            className="px-3 py-1 text-white text-xs rounded transition-colors bg-primary hover:bg-primary-hover"
        >
            <Plus size={12} className="inline mr-1" /> New Job
        </button>
    );

    return (
        <DataMultiView
            title={<><HardDrive size={18} className="text-text-muted" />{title}</>}
            extraActions={newJobButton || undefined}
            sort={{ defaultValue: [{ colIndex: 0, direction: 'asc' }] }}
            viewMode={{ storageKey: viewModeStorageKey }}
            data={filteredJobs}
            tableDef={tableItems}
            listColumns={listItems}
            keyField={(job) =>
                job.clientId ? `${job.clientId}-${job.id || 'new'}` : (job.id || 'new')
            }
            searchable
            searchPlaceholder="Search Jobs ..."
            search={{ onChange: setSearchQuery }}
            emptyMessage="No jobs configured."
            rowClassName={(job) =>
                getStatus(job) === "online"
                    ? "align-top"
                    : "bg-app-bg text-text-muted opacity-75"
            }
            pagination={{
                // The view owns the page state and does the slicing; it sorts across
                // the whole set first, so a column sort is never limited to the rows
                // that happen to be on screen.
                defaultValue: { pageSize: 10 },
                hideOnSinglePage: true,
            }}
        />
    );
};
