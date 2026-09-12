import { useMemo } from 'react';
import { Plus, Server, Trash2, Edit } from 'lucide-react';
import { ManagedRepository as Repository, REPOSITORY_STATUS } from '@pbcm/shared';
import { DataTableDef, Button } from '@stefgo/react-ui-components';
import { DataAction } from '@stefgo/react-ui-components';
import { DataListDef, DataListColumnDef } from '@stefgo/react-ui-components';
import { DataMultiView } from '@stefgo/react-ui-components';
import { useSearchQueryParam } from '../../../hooks/useSearchQueryParam';

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

    const filteredRepositories = useMemo(() => {
        if (!searchQuery) return sortedRepositories;
        const q = searchQuery.toLowerCase();
        return sortedRepositories.filter(r =>
            r.baseUrl.toLowerCase().includes(q) ||
            r.datastore.toLowerCase().includes(q) ||
            (r.username ?? '').toLowerCase().includes(q),
        );
    }, [sortedRepositories, searchQuery]);

    const buildTableDefinitions = (): DataTableDef<Repository>[] => {
        const cols: DataTableDef<Repository>[] = [];

        cols.push({
            tableHeader: "Repository",
            sortable: true,
            sortValue: (repo) => `${repo.baseUrl}:${repo.datastore}`,
            tableItemRender: (repo) => (
                <>
                    <div className="flex items-center gap-3 mb-1">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${repo.status === REPOSITORY_STATUS.ONLINE ? 'bg-success shadow-glow-success'
                            : repo.status === REPOSITORY_STATUS.LOADING ? 'bg-warning animate-pulse'
                                : 'bg-border'
                            }`} />
                        <div className={`text-sm text-text-primary ${repo.status === REPOSITORY_STATUS.ONLINE ? '' : 'opacity-70'} truncate`}>
                            {repo.baseUrl}:{repo.datastore}
                        </div>
                    </div>
                    <div className="text-xs font-mono text-text-muted pl-5 truncate opacity-70">
                        {repo.id}
                    </div>
                </>
            )
        });

        cols.push({
            tableHeader: "Actions",
            tableHeaderClassName: "text-center",
            tableCellClassName: "content-center",
            tableItemRender: (repo) => (
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
            )
        });

        return cols;
    };

    const buildListDefinitions = (): DataListColumnDef<Repository>[] => {
        const contentFields: DataListDef<Repository>[] = [];
        const actionFields: DataListDef<Repository>[] = [];

        contentFields.push({
            listItemRender: (repo) => (
                <div className="flex items-center gap-2 py-1">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${repo.status === REPOSITORY_STATUS.ONLINE ? 'bg-success shadow-glow-success'
                        : repo.status === REPOSITORY_STATUS.LOADING ? 'bg-warning animate-pulse'
                            : 'bg-border'
                        }`} />
                    <div className={`font-inherit text-text-primary ${repo.status === REPOSITORY_STATUS.ONLINE ? '' : 'opacity-70'} truncate`}>
                        {repo.baseUrl}:{repo.datastore}
                    </div>
                </div>
            ),
            listLabel: null,
        });

        contentFields.push({
            accessorKey: 'id',
            listLabel: 'ID'
        });

        contentFields.push({
            accessorKey: 'baseUrl',
            listLabel: 'URL'
        });

        contentFields.push({
            accessorKey: 'datastore',
            listLabel: 'Datastore'
        });

        contentFields.push({
            accessorKey: 'username',
            listLabel: 'User'
        });

        contentFields.push({
            accessorKey: 'tokenname',
            listLabel: 'Tokenname'
        });

        actionFields.push({
            listItemRender: (repo) => (
                <div onClick={(e) => e.stopPropagation()} className="mt-2 md:mt-0 flex justify-center">
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
            ),
            listLabel: null,
        });

        return [
            { fields: contentFields, columnClassName: "flex-1" },
            { fields: actionFields, columnClassName: "md:text-right" }
        ];
    };

    const tableColumns = buildTableDefinitions();
    const listColumns = buildListDefinitions();

    return (
        <DataMultiView
            title={<><Server size={18} className="text-text-muted" /> Repositories</>}
            extraActions={
                <Button size="sm" icon={Plus} onClick={onAdd}>
                    Add Repository
                </Button>
            }
            sort={{ defaultValue: [{ colIndex: 0, direction: 'asc' }] }}
            viewMode={{ storageKey: "repositoryViewMode" }}
            data={filteredRepositories}
            tableDef={tableColumns}
            listColumns={listColumns}
            keyField="id"
            searchable
            searchPlaceholder="Search Repositories ..."
            search={{ value: searchQuery, onChange: setSearchQuery }}
            emptyMessage="No repositories added."
            rowClassName="align-top"
            onRowClick={onSelect}
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

