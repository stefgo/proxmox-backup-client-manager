import { useMemo, useState } from 'react';
import { FileBox, ArchiveRestore } from 'lucide-react';
import { Snapshot } from '@pbcm/shared';
import { DataTableDef, DataListColumnDef, DataListDef, DataAction, DataMultiView } from '@stefgo/react-ui-components';
import { formatDate } from '../../../utils';

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

    /**
     * backupTime alone is not unique: it has second resolution, and the repository-wide
     * list puts snapshots of several clients side by side. Two taken in the same second
     * would then share a React key and an action-menu identity.
     */
    const snapshotKey = (snap: Snapshot) =>
        `${snap.backupType}/${snap.backupId}/${snap.backupTime}`;

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
                                : "bg-border"
                                }`}
                        />
                        <div
                            className={`text-sm ${online ? "text-text-primary" : ""
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
            <div className="text-sm text-text-muted flex items-center gap-2">
                {formatDate(snap.backupTime * 1000)}
            </div>
        )
    });

    tableDef.push({
        tableHeader: "Size",
        sortable: true,
        sortValue: (snap) => snap.size ?? 0,
        tableItemRender: (snap) => (
            <div className="text-sm text-text-muted">
                {snap.size ? (snap.size / (1024 * 1024)).toFixed(2) + ' MB' : '-'}
            </div>
        )
    });

    tableDef.push({
        tableHeader: "Actions",
        tableHeaderClassName: "text-right",
        tableItemRender: (snap) => (
            <DataAction
                rowId={snapshotKey(snap)}
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
                                ? "text-text-primary"
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
                        rowId={snapshotKey(snap)}
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
            title={<><FileBox size={18} className="text-text-muted" /> Snapshots</>}
            data={filteredSnapshots}
            tableDef={tableDef}
            listColumns={listColumns}
            keyField={snapshotKey}
            sort={{ defaultValue: [{ colIndex: dateSortColIndex, direction: 'desc' }] }}
            viewMode={{ storageKey: "snapshotListViewMode" }}
            searchable
            searchPlaceholder="Search Snapshots ..."
            search={{ onChange: setSearchQuery }}
            emptyMessage="No snapshots found in this repository."
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
