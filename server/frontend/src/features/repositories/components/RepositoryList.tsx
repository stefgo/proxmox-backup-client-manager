import { ActionMenu } from '../../../components/ActionMenu';
import { useActionMenu } from '../../../hooks/useActionMenu';
import { Plus, Server, Trash2, Pencil, MoreVertical } from 'lucide-react';
import { ManagedRepository as Repository } from '@pbcm/shared';
import { usePagination } from '../../../hooks/usePagination';
import { PaginationControls } from '../../../components/PaginationControls';

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

    const { menuState, openMenu, closeMenu } = useActionMenu<string | number>();

    return (
        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-gray-200 dark:border-[#333] overflow-hidden shadow-lg h-full flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-[#333] flex justify-between items-center bg-gray-50 dark:bg-[#252525]">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <Server size={18} className="text-gray-500 dark:text-[#888]" /> Repositories
                </h3>
                <button
                    onClick={onAdd}
                    className="px-3 py-1 bg-[#E54D0D] text-white text-xs rounded hover:bg-[#ff5f1f]"
                >
                    <Plus size={12} className="inline mr-1" /> Add Repository
                </button>
            </div>

            <div className="divide-y divide-gray-200 dark:divide-[#333] flex-1 overflow-y-auto">
                {currentRepos.map(repo => (
                    <div
                        key={repo.id}
                        onClick={() => onSelect(repo)}
                        className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-[#252525] cursor-pointer transition-colors relative group"
                    >
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <div className={`w-2 h-2 rounded-full ${repo.status === 'online' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]'
                                    : repo.status === 'loading' ? 'bg-yellow-500 animate-pulse'
                                        : 'bg-gray-400 dark:bg-[#444]'
                                    }`} />
                                <div className="font-bold text-gray-900 dark:text-white truncate">{repo.baseUrl}:{repo.datastore}</div>
                            </div>
                            <div className="text-xs font-mono text-gray-500 dark:text-[#666] pl-5 truncate opacity-70">
                                {repo.id}
                            </div>
                        </div>

                        <div className="relative">
                            <button
                                onClick={(e) => openMenu(e, repo.id as string)}
                                className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#333] transition-colors"
                            >
                                <MoreVertical size={16} />
                            </button>

                            <ActionMenu
                                isOpen={menuState?.id === repo.id}
                                onClose={closeMenu}
                                position={menuState || { x: 0, y: 0 }}
                            >
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onEdit(repo);
                                        closeMenu();
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#333] flex items-center gap-2"
                                >
                                    <Pencil size={14} /> Edit
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (repo.id) onDelete(repo.id);
                                        closeMenu();
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 flex items-center gap-2"
                                >
                                    <Trash2 size={14} /> Delete Repository
                                </button>
                            </ActionMenu>
                        </div>
                    </div>
                ))}
                {repositories.length === 0 && <div className="p-8 text-center text-[#555]">No repositories added</div>}
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
    );
};
