
import { Plus, Monitor, MoreVertical, Trash2, Edit } from 'lucide-react';
import { Client } from '@pbcm/shared';
import { usePagination } from '../../../hooks/usePagination';
import { PaginationControls } from '../../../components/PaginationControls';
import { formatDate } from '../../../utils';
import { ActionMenu } from '../../../components/ActionMenu';
import { useActionMenu } from '../../../hooks/useActionMenu';

interface ClientListProps {
    clients: Client[];
    selectedClient: Client | null;
    setSelectedClient: (client: Client | null) => void;
    deleteClient: (id: string, e: React.MouseEvent) => void;
    generateToken: () => void;
    onEdit: (client: Client, e: React.MouseEvent) => void;
}

export const ClientList = ({ clients, selectedClient, setSelectedClient, deleteClient, generateToken, onEdit }: ClientListProps) => {
    const {
        currentItems: currentClients,
        currentPage,
        totalPages,
        itemsPerPage,
        totalItems,
        goToPage,
        setItemsPerPage
    } = usePagination(clients, 10);

    const { menuState, openMenu, closeMenu } = useActionMenu<string>();

    return (
        <div className={`transition-all duration-300 ${selectedClient ? 'w-80 hidden md:block' : 'w-full'} flex flex-col gap-6`}>
            {/* Clients List */}
            <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-gray-200 dark:border-[#333] shadow-lg flex flex-col h-full">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-[#333] bg-gray-50 dark:bg-[#252525] flex justify-between items-center rounded-t-xl">
                    <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Monitor size={18} className="text-gray-500 dark:text-[#888]" />Clients</h2>
                    <button
                        onClick={generateToken}
                        className="px-3 py-1 bg-[#E54D0D] text-white text-xs rounded hover:bg-[#ff5f1f]"
                    >
                        <Plus size={12} className="inline mr-1" />Generate New Token
                    </button>
                </div>
                <div className="divide-y divide-gray-200 dark:divide-[#333] rounded-b-xl overflow-y-auto flex-1">
                    {currentClients.map(client => (
                        <div
                            key={client.id}
                            onClick={() => setSelectedClient(client)}
                            className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-[#252525] cursor-pointer transition-colors relative group"
                        >
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    <div className={`w-2 h-2 rounded-full ${client.status === 'online' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-gray-400 dark:bg-[#444]'}`} />
                                    <div className="font-bold text-gray-900 dark:text-white truncate">
                                        {client.displayName || client.hostname}
                                        {client.displayName && <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-2">({client.hostname})</span>}
                                    </div>
                                </div>
                                <div className="text-xs font-mono text-gray-500 dark:text-[#666] pl-5 truncate opacity-70">
                                    {client.id}
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                {client.status !== 'online' && (
                                    <div className="text-xs text-gray-400 dark:text-[#555] whitespace-nowrap">
                                        Last seen: {formatDate(client.lastSeen)}
                                    </div>
                                )}

                                <div className="relative">
                                    <button
                                        onClick={(e) => openMenu(e, client.id)}
                                        className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#333] transition-colors"
                                    >
                                        <MoreVertical size={16} />
                                    </button>

                                    <ActionMenu
                                        isOpen={menuState?.id === client.id}
                                        onClose={closeMenu}
                                        position={menuState || { x: 0, y: 0 }}
                                    >
                                        <button
                                            onClick={(e) => {
                                                onEdit(client, e);
                                                closeMenu();
                                            }}
                                            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#333] flex items-center gap-2"
                                        >
                                            <Edit size={14} /> Edit Client
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                deleteClient(client.id, e);
                                                closeMenu();
                                            }}
                                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 flex items-center gap-2"
                                        >
                                            <Trash2 size={14} /> Delete Client
                                        </button>
                                    </ActionMenu>
                                </div>
                            </div>
                        </div>
                    ))}
                    {clients.length === 0 && <div className="p-8 text-center text-[#555]">No clients connected</div>}
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
        </div>
    );
};
