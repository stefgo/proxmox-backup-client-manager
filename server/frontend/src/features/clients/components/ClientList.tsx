import { Plus, Monitor, Trash2, Edit } from 'lucide-react';
import { Client } from '@pbcm/shared';
import { usePagination } from '../../../hooks/usePagination';
import { formatDate } from '../../../utils';
import { DataTable, ColumnDef } from '../../../components/DataTable';
import { DataTableAction } from '../../../components/DataTableAction';

interface ClientListProps {
    clients: Client[];
    setSelectedClient: (client: Client | null) => void;
    deleteClient: (client: Client) => void;
    generateToken: () => void;
    editClient: (client: Client) => void;
}

export const ClientList = ({ clients, setSelectedClient, deleteClient, generateToken, editClient }: ClientListProps) => {
    const {
        currentItems: currentClients,
        currentPage,
        totalPages,
        itemsPerPage,
        totalItems,
        goToPage,
        setItemsPerPage
    } = usePagination(clients, 10);

    const columns: ColumnDef<Client>[] = [
        {
            header: "Client",
            accessorFn: (client) => (
                <>
                    <div className="flex items-center gap-3 mb-1">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${client.status === 'online' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-gray-400 dark:bg-[#444]'}`} />
                        <div className={`text-sm text-gray-900 dark:text-white ${client.status === 'online' ? '' : 'opacity-70'} truncate`}>
                            {client.displayName || client.hostname}
                            {client.displayName && <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-2">({client.hostname})</span>}
                        </div>
                    </div>
                    <div className="text-xs font-mono text-gray-500 dark:text-[#666] pl-5 truncate opacity-70">
                        {client.id}
                    </div>
                </>
            )
        },
        {
            header: null,
            cellClassName: "align-top text-sm text-gray-900 dark:text-white",
            accessorFn: (client) => (
                client.status !== 'online' ? (
                    <div className="whitespace-nowrap opacity-70">
                        Last seen: {formatDate(client.lastSeen)}
                    </div >
                ) : null
            )
        },
        {
            header: "Action",
            headerClassName: "text-right",
            cellClassName: "text-right text-sm font-medium",
            accessorFn: (client) => (
                <div onClick={(e) => e.stopPropagation()}>
                    <DataTableAction
                        rowId={client.id}
                        menuEntries={[
                            {
                                label: 'Edit Client',
                                icon: Edit,
                                onClick: () => {
                                    editClient(client);
                                },
                                variant: 'default',
                            },
                            {
                                label: 'Delete Client',
                                icon: Trash2,
                                onClick: () => {
                                    deleteClient(client);
                                },
                                variant: 'danger',
                            },
                        ]}
                    />
                </div>
            )
        }
    ];

    return (
        <div className={`transition-all duration-300 w-full flex flex-col gap-6 h-full min-h-0`}>
            <DataTable
                title="Clients"
                icon={<Monitor size={18} />}
                data={currentClients}
                columns={columns}
                keyField="id"
                emptyMessage="No clients connected"
                onRowClick={setSelectedClient}
                actions={
                    <button
                        onClick={generateToken}
                        className="px-3 py-1 bg-[#E54D0D] text-white text-xs rounded hover:bg-[#ff5f1f]"
                    >
                        <Plus size={12} className="inline mr-1" />Generate New Token
                    </button>
                }
                pagination={{
                    currentPage,
                    totalPages,
                    itemsPerPage,
                    totalItems,
                    onPageChange: goToPage,
                    onItemsPerPageChange: setItemsPerPage
                }}
            />
        </div>
    );
};
