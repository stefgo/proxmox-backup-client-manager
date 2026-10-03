import { useCallback, useMemo } from 'react';
import { Plus, Server, Trash2, Edit } from 'lucide-react';
import { ManagedRepository as Repository, REPOSITORY_STATUS } from '@pbcm/shared';
import { Button, DataAction, DataMultiView, EmptyState, StatusDot, type DataColumnDef } from '@stefgo/react-ui-components';
import { useSearchQueryParam } from '../../../hooks/useSearchQueryParam';
import { PAGE_SIZE, pagination } from '../../../components/listDefaults';
import { actionsColumn, listGroups } from '../../../components/listColumns';
import { STATUS_DOT, STATUS_TONE, type StatusTone } from '../../../components/statusTone';

/** A probe in flight pulses like a connecting client; anything but `online` reads as down. */
const repositoryTone = (repo: Repository): StatusTone =>
    repo.status === REPOSITORY_STATUS.ONLINE
        ? STATUS_TONE.ONLINE
        : repo.status === REPOSITORY_STATUS.LOADING
            ? STATUS_TONE.CONNECTING
            : STATUS_TONE.OFFLINE;

interface RepositoryListProps {
    repositories: Repository[];
    onSelect: (repo: Repository) => void;
    onEdit: (repo: Repository) => void;
    onDelete: (id: string | number) => void;
    onAdd: () => void;
}

export const RepositoryList = ({ repositories, onSelect, onEdit, onDelete, onAdd }: RepositoryListProps) => {
    const [searchQuery, setSearchQuery] = useSearchQueryParam();

    const sortedRepositories = useMemo(
        () => [...repositories].sort((a, b) => `${a.baseUrl}:${a.datastore}`.localeCompare(`${b.baseUrl}:${b.datastore}`)),
        [repositories],
    );

    // Handed to the view instead of applied in front of it: only then can the view tell an
    // empty search from an empty list, and page through what the search left.
    const matchesSearch = useCallback((r: Repository, query: string) => {
        const q = query.toLowerCase();
        return r.baseUrl.toLowerCase().includes(q) ||
            r.datastore.toLowerCase().includes(q) ||
            (r.username ?? '').toLowerCase().includes(q);
    }, []);

    // One set of actions for both views, so the table and the list cannot drift apart.
    const renderActions = (repo: Repository) => (
        <div onClick={(e) => e.stopPropagation()}>
            <DataAction
                rowId={repo.id as string}
                menuEntries={[
                    {
                        label: 'Edit Repository',
                        icon: Edit,
                        onClick: () => onEdit(repo),
                        variant: 'default',
                    },
                    {
                        label: 'Delete Repository',
                        icon: Trash2,
                        onClick: () => {
                            if (repo.id) onDelete(repo.id);
                        },
                        variant: 'danger',
                    },
                ]}
            />
        </div>
    );

    const columns: DataColumnDef<Repository>[] = [
        {
            header: 'Repository',
            sortable: true,
            sortValue: (repo) => `${repo.baseUrl}:${repo.datastore}`,
            list: { label: null },
            render: (repo, view) => (
                <div className={view === 'list' ? 'flex items-center gap-2 py-1' : 'flex items-center gap-3'}>
                    <StatusDot size="sm" {...STATUS_DOT[repositoryTone(repo)]} label={repo.status} />
                    <div className={`${view === 'list' ? 'font-inherit' : 'text-sm'} text-text-primary ${repo.status === REPOSITORY_STATUS.ONLINE ? '' : 'opacity-70'} truncate`}>
                        {repo.baseUrl}:{repo.datastore}
                    </div>
                </div>
            ),
        },
        // The table names a repository by URL and datastore; the list has the room to
        // spell out the rest.
        { header: 'ID', accessorKey: 'id', table: false },
        { header: 'URL', accessorKey: 'baseUrl', table: false },
        { header: 'Datastore', accessorKey: 'datastore', table: false },
        { header: 'User', accessorKey: 'username', table: false },
        { header: 'Tokenname', accessorKey: 'tokenname', table: false },
        actionsColumn(renderActions),
    ];

    return (
        <DataMultiView
            title={<><Server size={18} className="text-text-muted" /> Repositories</>}
            extraActions={
                <Button size="sm" icon={Plus} onClick={onAdd}>
                    Add Repository
                </Button>
            }
            sort={{ defaultValue: [{ colIndex: 0, direction: 'asc' }] }}
            viewMode={{ persist: { key: 'repositoryViewMode', scope: 'local' } }}
            data={sortedRepositories}
            columns={columns}
            listGroups={listGroups()}
            keyField="id"
            searchable
            searchPlaceholder="Search repositories…"
            search={{ value: searchQuery, onChange: setSearchQuery }}
            searchFilter={matchesSearch}
            noResultsMessage={`No repositories match “${searchQuery}”.`}
            emptyMessage={
                <EmptyState
                    icon={Server}
                    title="No repositories added yet"
                    description="A repository is a Proxmox Backup Server datastore that jobs back up into."
                    action={<Button size="sm" icon={Plus} onClick={onAdd}>Add Repository</Button>}
                />
            }
            rowClassName="align-top"
            onRowClick={onSelect}
            pagination={pagination(PAGE_SIZE.page)}
        />
    );
};

