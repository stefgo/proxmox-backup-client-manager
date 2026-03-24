import { Plus, Server, Trash2, Edit } from 'lucide-react';
import { ManagedRepository as Repository } from '@pbcm/shared';
import { usePagination } from '../../../hooks/usePagination';
import { DataTableDef } from '@stefgo/react-ui-components';
import { DataAction } from '@stefgo/react-ui-components';
import { DataListDef, DataListColumnDef } from '@stefgo/react-ui-components';
import { DataMultiView } from '@stefgo/react-ui-components';

interface RepositoryListProps {
    repositories: Repository[];
    onSelect: (repo: Repository) => void;
    onEdit: (repo: Repository) => void;
    onDelete: (id: string | number) => void;
    onAdd: () => void;
}

export const RepositoryList = ({ repositories, onSelect, onEdit, onDelete, onAdd }: RepositoryListProps) => {
    const {
        currentItems: currentRepos,
        currentPage,
        totalPages,
        itemsPerPage,
        totalItems,
        goToPage,
        setItemsPerPage
    } = usePagination(repositories, 10);

    const buildTableDefinitions = (): DataTableDef<Repository>[] => {
        const cols: DataTableDef<Repository>[] = [];

        cols.push({
            tableHeader: "Repository",
            sortable: true,
            sortValue: (repo) => `${repo.baseUrl}:${repo.datastore}`,
            tableItemRender: (repo) => (
                <>
                    <div className="flex items-center gap-3 mb-1">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${repo.status === 'online' ? 'bg-green-500 shadow-glow-online'
                            : repo.status === 'loading' ? 'bg-yellow-500 animate-pulse'
                                : 'bg-border dark:bg-border-dark'
                            }`} />
                        <div className={`text-sm text-text-primary dark:text-text-primary-dark ${repo.status === 'online' ? '' : 'opacity-70'} truncate`}>
                            {repo.baseUrl}:{repo.datastore}
                        </div>
                    </div>
                    <div className="text-xs font-mono text-text-muted dark:text-text-muted-dark pl-5 truncate opacity-70">
                        {repo.id}
                    </div>
                </>
            )
        });

        cols.push({
            tableHeader: "Action",
            tableHeaderClassName: "text-center",
            tableCellClassName: "content-center",
            tableItemRender: (repo) => (
                <div onClick={(e) => e.stopPropagation()}>
                    <DataAction
                        rowId={repo.id as string}
                        menuEntries={[
                            {
                                label: 'Edit',
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
                    <div className={`w-2 h-2 rounded-full shrink-0 ${repo.status === 'online' ? 'bg-green-500 shadow-glow-online'
                        : repo.status === 'loading' ? 'bg-yellow-500 animate-pulse'
                            : 'bg-border dark:bg-border-dark'
                        }`} />
                    <div className={`font-inherit text-text-primary dark:text-text-primary-dark ${repo.status === 'online' ? '' : 'opacity-70'} truncate`}>
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
                                label: 'Edit',
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
            title={<><Server size={18} className="text-text-muted dark:text-text-muted-dark" /> Repositories</>}
            extraActions={
                <button
                    onClick={onAdd}
                    className="px-3 py-1 bg-primary text-white text-xs rounded hover:bg-primary-hover"
                >
                    <Plus size={12} className="inline mr-1" /> Add Repository
                </button>
            }
            viewModeStorageKey="repositoryViewMode"
            data={currentRepos}
            tableDef={tableColumns}
            listColumns={listColumns}
            keyField="id"
            emptyMessage="No repositories added"
            rowClassName="align-top"
            onRowClick={onSelect}
            pagination={{
                currentPage,
                totalPages,
                itemsPerPage,
                totalItems,
                onPageChange: goToPage,
                onItemsPerPageChange: setItemsPerPage
            }}
        />
    );
};

