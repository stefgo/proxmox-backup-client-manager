import { useMemo, useState } from 'react';
import { FileBox, ArchiveRestore } from 'lucide-react';
import { Snapshot } from '@pbcm/shared';
import { DataTableDef, DataListColumnDef, DataListDef, DataAction, DataMultiView } from '@stefgo/react-ui-components';
import { formatDate } from '../../../utils';
import { usePagination } from '../../../hooks/usePagination';

interface RepositorySnapshotListProps {
    snapshots: Snapshot[];
    onRestore: (snapshot: Snapshot) => void;
    showClientColumn?: boolean;
    getClientStatus?: (clientId: string) => "online" | "offline";
    getClientName?: (clientId: string) => string | null;
}

export const RepositorySnapshotList = ({
    snapshots,
    onRestore,
    showClientColumn = false,
    getClientStatus,
    getClientName
}: RepositorySnapshotListProps) => {
    const [searchQuery, setSearchQuery] = useState('');

    const sortedSnapshots = useMemo(
        () => [...snapshots].sort((a, b) => {
            if (showClientColumn && getClientName) {
                return (getClientName(a.backupId ?? '') ?? '').localeCompare(getClientName(b.backupId ?? '') ?? '');
            }
            return b.backupTime - a.backupTime;
        }),
        [snapshots, showClientColumn, getClientName],
    );

    const filteredSnapshots = useMemo(() => {
        if (!searchQuery) return sortedSnapshots;
        const q = searchQuery.toLowerCase();
        return sortedSnapshots.filter(s => {
            if ((s.backupId ?? '').toLowerCase().includes(q)) return true;
            if (getClientName && s.backupId && (getClientName(s.backupId) ?? '').toLowerCase().includes(q)) return true;
            if (s.backupType.toLowerCase().includes(q)) return true;
            return false;
        });
    }, [sortedSnapshots, searchQuery, getClientName]);

    const {
        currentItems,
        currentPage,
        totalPages,
        itemsPerPage,
        totalItems,
        goToPage,
        setItemsPerPage,
    } = usePagination(filteredSnapshots, 10);

    const getStatus = (snap: Snapshot): "online" | "offline" => {
        if (!showClientColumn || !getClientStatus || !snap.backupId) return "online";
        return getClientStatus(snap.backupId);
    };

    const tableDef: DataTableDef<Snapshot>[] = [];

    if (showClientColumn) {
        tableDef.push({
            tableHeader: "Client",
            sortable: true,
            sortValue: (snap) => (snap.backupId && getClientName ? getClientName(snap.backupId) : '') ?? '',
            tableItemRender: (snap) => {
                const name = snap.backupId && getClientName ? getClientName(snap.backupId) : null;
                if (!name) return null;

                const online = getStatus(snap) === "online";
                return (
                    <div className="flex items-center gap-3">
                        <div
                            className={`w-2 h-2 rounded-full shrink-0 ${online
                                ? "bg-green-500 shadow-glow-online"
                                : "bg-border dark:bg-border-dark"
                                }`}
                        />
                        <div
                            className={`text-sm ${online ? "text-text-primary dark:text-text-primary-dark" : ""
                                } max-w-[150px] truncate`}
                            title={name}
                        >
                            {name}
                        </div>
                    </div>
                );
            }
        });
    }

    tableDef.push({
        tableHeader: "Date",
        sortable: true,
        sortValue: (snap) => snap.backupTime,
        tableItemRender: (snap) => (
            <div className="text-sm text-text-muted dark:text-text-muted-dark flex items-center gap-2">
                {formatDate(snap.backupTime * 1000)}
            </div>
        )
    });

    tableDef.push({
        tableHeader: "Size",
        sortable: true,
        sortValue: (snap) => snap.size ?? 0,
        tableItemRender: (snap) => (
            <div className="text-sm text-text-muted dark:text-text-muted-dark">
                {snap.size ? (snap.size / (1024 * 1024)).toFixed(2) + ' MB' : '-'}
            </div>
        )
    });

    tableDef.push({
        tableHeader: "Actions",
        tableHeaderClassName: "text-right",
        tableItemRender: (snap) => (
            <DataAction
                rowId={snap.backupTime.toString()}
                actions={[
                    {
                        icon: ArchiveRestore,
                        onClick: () => onRestore(snap),
                        color: "blue",
                        tooltip: "Restore Snapshot",
                    }
                ]}
            />
        )
    });

    const listColumns: DataListColumnDef<Snapshot>[] = [];
    const fields: DataListDef<Snapshot>[] = [];

    if (showClientColumn) {
        fields.push({
            listLabel: null,
            listItemRender: (snap) => {
                const name = snap.backupId && getClientName ? getClientName(snap.backupId) : null;
                if (!name) return null;

                const isOnline = getStatus(snap) === "online";
                return (
                    <div className="flex items-center gap-2 py-1">
                        <span
                            className={`w-2 h-2 rounded-full ${isOnline ? "bg-green-500" : "bg-border"}`}
                        />
                        <span
                            className={`${isOnline
                                ? "text-text-primary dark:text-text-primary-dark"
                                : "text-inherit"
                                }`}
                        >
                            {name}
                        </span>
                    </div>
                );
            },
        });
    }

    fields.push({
        listLabel: "Snapshot",
        listItemRender: (snap) => `${snap.backupType} / ${snap.backupId}`
    });

    fields.push({
        listLabel: "Date",
        listItemRender: (snap) => formatDate(snap.backupTime * 1000)
    });

    fields.push({
        listLabel: "Size",
        listItemRender: (snap) => snap.size ? (snap.size / (1024 * 1024)).toFixed(2) + ' MB' : '-'
    });

    listColumns.push({ fields, columnClassName: "flex-1" });

    listColumns.push({
        fields: [{
            listLabel: null,
            listItemRender: (snap) => (
                <div className="flex justify-center mt-2">
                    <DataAction
                        rowId={snap.backupTime.toString()}
                        actions={[
                            {
                                icon: ArchiveRestore,
                                onClick: () => onRestore(snap),
                                color: "blue",
                                tooltip: "Restore Snapshot",
                            }
                        ]}
                    />
                </div>
            )
        }],
        columnClassName: "md:text-right"
    });

    const dateSortColIndex = showClientColumn ? 1 : 0;

    return (
        <DataMultiView
            title={<><FileBox size={18} className="text-text-muted dark:text-text-muted-dark" /> Snapshots</>}
            data={currentItems}
            tableDef={tableDef}
            listColumns={listColumns}
            keyField={(snap) => snap.backupTime.toString()}
            defaultSort={{ colIndex: dateSortColIndex, direction: 'desc' }}
            viewModeStorageKey="snapshotListViewMode"
            searchable
            searchPlaceholder="Search Snapshots ..."
            onSearchChange={setSearchQuery}
            emptyMessage="No snapshots found in this repository."
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
