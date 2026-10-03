import { useCallback, useMemo } from 'react';
import { FileBox, ArchiveRestore } from 'lucide-react';
import { Snapshot, CLIENT_STATUS, ClientStatus } from '@pbcm/shared';
import { DataAction, DataMultiView, StatusDot, type DataColumnDef } from '@stefgo/react-ui-components';
import { formatBytes, formatDate } from '../../../utils';
import { useSearchQueryParam } from '../../../hooks/useSearchQueryParam';
import { PAGE_SIZE, pagination } from '../../../components/listDefaults';
import { actionsColumn, listGroups } from '../../../components/listColumns';
import { STATUS_DOT, STATUS_TONE } from '../../../components/statusTone';
import { EntityLink } from '../../../components/EntityLink';
import { paths } from '../../../lib/paths';

interface RepositorySnapshotListProps<T extends Snapshot> {
    snapshots: T[];
    onRestore: (snapshot: T) => void;
    showClientColumn?: boolean;
    getClientStatus?: (clientId: string) => ClientStatus;
    getClientName?: (clientId: string) => string | null;
    /**
     * Why no snapshot of this list can be restored right now, as the tooltip of the
     * disabled action. The snapshots themselves stay readable: they are the repository's.
     */
    restoreDisabledReason?: string;
    /**
     * The query parameter this list's search is kept in. The caller namespaces it where
     * several lists share a route, so each tab remembers its own search instead of
     * inheriting the one next door.
     */
    searchParamKey?: string;
}

// Generic over the snapshot type so callers that carry extra fields (the client
// view attaches the repository) get them back in onRestore instead of a cast.
export const RepositorySnapshotList = <T extends Snapshot>({
    snapshots,
    onRestore,
    showClientColumn = false,
    getClientStatus,
    getClientName,
    restoreDisabledReason,
    searchParamKey = 'search',
}: RepositorySnapshotListProps<T>) => {
    const [searchQuery, setSearchQuery] = useSearchQueryParam(searchParamKey);

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

    // Handed to the view instead of applied in front of it: only then can the view tell an
    // empty search from an empty list, and page through what the search left.
    const matchesSearch = useCallback((s: Snapshot, query: string) => {
        const q = query.toLowerCase();
        if ((s.backupId ?? '').toLowerCase().includes(q)) return true;
        if (getClientName && s.backupId && (getClientName(s.backupId) ?? '').toLowerCase().includes(q)) return true;
        if (s.backupType.toLowerCase().includes(q)) return true;
        return false;
    }, [getClientName]);

    const getStatus = (snap: Snapshot): ClientStatus => {
        if (!showClientColumn || !getClientStatus || !snap.backupId)
            return CLIENT_STATUS.ONLINE;
        return getClientStatus(snap.backupId);
    };

    const sizeLabel = (snap: Snapshot) => formatBytes(snap.size);

    const renderActions = (snap: T) => (
        <DataAction
            rowId={snapshotKey(snap)}
            actions={[
                {
                    icon: ArchiveRestore,
                    onClick: () => onRestore(snap),
                    disabled: !!restoreDisabledReason,
                    color: 'blue',
                    tooltip: { enabled: 'Restore Snapshot', disabled: restoreDisabledReason ?? '' },
                },
            ]}
        />
    );

    const clientColumn: DataColumnDef<T> = {
        header: 'Client',
        sortable: true,
        sortValue: (snap) => (snap.backupId && getClientName ? getClientName(snap.backupId) : '') ?? '',
        list: { label: null },
        render: (snap, view) => {
            const name = snap.backupId && getClientName ? getClientName(snap.backupId) : null;
            if (!name) return null;
            // A name was found, so the backup id is a client of this server.
            const link = <EntityLink to={paths.client(snap.backupId)}>{name}</EntityLink>;

            const online = getStatus(snap) === CLIENT_STATUS.ONLINE;
            const dot = <StatusDot size="sm" {...STATUS_DOT[online ? STATUS_TONE.ONLINE : STATUS_TONE.OFFLINE]} label={getStatus(snap)} />;
            return view === 'list' ? (
                <div className="flex items-center gap-2 py-1">
                    {dot}
                    <span className={online ? 'text-text-primary' : 'text-inherit'}>{link}</span>
                </div>
            ) : (
                <div className="flex items-center gap-3">
                    {dot}
                    <div className={`text-sm ${online ? 'text-text-primary' : ''} max-w-[150px] truncate`} title={name}>
                        {link}
                    </div>
                </div>
            );
        },
    };

    const columns: DataColumnDef<T>[] = [
        ...(showClientColumn ? [clientColumn] : []),
        {
            header: 'Snapshot',
            table: false,
            render: (snap) => `${snap.backupType} / ${snap.backupId}`,
        },
        {
            header: 'Date',
            sortable: true,
            sortValue: (snap) => snap.backupTime,
            render: (snap, view) =>
                view === 'list' ? (
                    formatDate(snap.backupTime * 1000)
                ) : (
                    <div className="text-sm text-text-muted flex items-center gap-2">
                        {formatDate(snap.backupTime * 1000)}
                    </div>
                ),
        },
        {
            header: 'Size',
            sortable: true,
            sortValue: (snap) => snap.size ?? 0,
            render: (snap, view) =>
                view === 'list' ? sizeLabel(snap) : <div className="text-sm text-text-muted">{sizeLabel(snap)}</div>,
        },
        { ...actionsColumn(renderActions, 'flex justify-center mt-2'), table: { headerClassName: 'text-right' } },
    ];

    // Counted among the table's columns: "Snapshot" is a field of the list only.
    const dateSortColIndex = showClientColumn ? 1 : 0;

    return (
        <DataMultiView
            title={<><FileBox size={18} className="text-text-muted" /> Snapshots</>}
            data={sortedSnapshots}
            columns={columns}
            listGroups={listGroups()}
            keyField={snapshotKey}
            sort={{ defaultValue: [{ colIndex: dateSortColIndex, direction: 'desc' }] }}
            viewMode={{ persist: { key: 'snapshotListViewMode', scope: 'local' } }}
            searchable
            searchPlaceholder="Search snapshots…"
            search={{ value: searchQuery, onChange: setSearchQuery }}
            searchFilter={matchesSearch}
            noResultsMessage={`No snapshots match “${searchQuery}”.`}
            emptyMessage="No snapshots found in this repository."
            pagination={pagination(PAGE_SIZE.embedded)}
        />
    );
};
