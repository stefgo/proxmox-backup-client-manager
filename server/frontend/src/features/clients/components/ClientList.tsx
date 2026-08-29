import { useMemo, useState } from 'react';
import { Plus, Monitor, Trash2, Edit, PlugZap, Network } from 'lucide-react';
import { Client } from '@pbcm/shared';
import { usePagination } from '@stefgo/react-ui-components';
import { formatDate } from '../../../utils';
import { DataTableDef } from '@stefgo/react-ui-components';
import { DataAction } from '@stefgo/react-ui-components';
import { DataListDef, DataListColumnDef } from '@stefgo/react-ui-components';
import { DataMultiView } from '@stefgo/react-ui-components';

interface ClientListProps {
    clients: Client[];
    setSelectedClient: (client: Client | null) => void;
    deleteClient: (client: Client) => void;
    generateToken: () => void;
    editClient: (client: Client) => void;
    addOutboundClient: () => void;
    reconnectClient: (client: Client) => void;
}

/** Outbound clients reach the PBS only through the SSH tunnel — worth showing at a glance. */
const ConnectionBadge = ({ client }: { client: Client }) => {
    if (client.connectionMode !== 'outbound') return null;
    const tunnel = (client as any).tunnel;
    const tone = tunnel?.status === 'error'
        ? 'text-red-600 dark:text-red-400'
        : tunnel?.status === 'up'
            ? 'text-green-600 dark:text-green-500'
            : 'text-text-muted dark:text-text-muted-dark';
    return (
        <span className={`inline-flex items-center gap-1 text-xs ${tone}`} title={tunnel?.lastError || undefined}>
            <Network size={12} />
            Tunnel
            {tunnel?.activeLeases ? ` (${tunnel.activeLeases})` : ''}
        </span>
    );
};

export const ClientList = ({ clients, setSelectedClient, deleteClient, generateToken, editClient, addOutboundClient, reconnectClient }: ClientListProps) => {
    const [searchQuery, setSearchQuery] = useState('');

    const sortedClients = useMemo(
        () => [...clients].sort((a, b) => (a.displayName || a.hostname).localeCompare(b.displayName || b.hostname)),
        [clients],
    );

    const filteredClients = useMemo(() => {
        if (!searchQuery) return sortedClients;
        const q = searchQuery.toLowerCase();
        return sortedClients.filter(c =>
            (c.displayName ?? '').toLowerCase().includes(q) ||
            c.hostname.toLowerCase().includes(q) ||
            c.id.toLowerCase().includes(q),
        );
    }, [sortedClients, searchQuery]);

    const {
        currentItems: currentClients,
        currentPage,
        totalPages,
        itemsPerPage,
        totalItems,
        goToPage,
        setItemsPerPage
    } = usePagination(filteredClients, 10);

    const buildTableDefinitions = (): DataTableDef<Client>[] => {
        const cols: DataTableDef<Client>[] = [];

        cols.push({
            tableHeader: "Client",
            sortable: true,
            sortValue: (client) => client.displayName || client.hostname,
            tableItemRender: (client) => (
                <>
                    <div className="flex items-center gap-3 mb-1">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${client.status === 'online' ? 'bg-green-500 shadow-glow-online animate-pulse-glow' : 'bg-border dark:bg-border-dark'}`} />
                        <div className={`text-sm text-text-primary dark:text-text-primary-dark ${client.status === 'online' ? '' : 'opacity-70'} truncate`}>
                            {client.displayName || client.hostname}
                            {client.displayName && <span className="text-xs font-normal text-text-muted dark:text-text-muted-dark ml-2">({client.hostname})</span>}
                        </div>
                        <ConnectionBadge client={client} />
                    </div>
                    <div className="text-xs font-mono text-text-muted dark:text-text-muted-dark pl-5 truncate opacity-70">
                        {client.id}
                    </div>
                </>
            )
        });

        cols.push({
            tableHeader: null,
            tableCellClassName: "align-top text-sm text-text-primary",
            tableItemRender: (client) => (
                client.status !== 'online' ? (
                    <div className="whitespace-nowrap opacity-70">
                        Last seen: {formatDate(client.lastSeen)}
                    </div >
                ) : null
            )
        });

        cols.push({
            tableHeader: "Action",
            tableHeaderClassName: "text-center",
            tableCellClassName: "content-center",
            tableItemRender: (client) => (
                <div onClick={(e) => e.stopPropagation()}>
                    <DataAction
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
                            ...(client.connectionMode === 'outbound' && client.status !== 'online'
                                ? [{
                                    label: 'Jetzt verbinden',
                                    icon: PlugZap,
                                    onClick: () => {
                                        reconnectClient(client);
                                    },
                                    variant: 'default' as const,
                                }]
                                : []),
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
        });

        return cols;
    };

    const buildListDefinitions = (): DataListColumnDef<Client>[] => {
        const contentFields: DataListDef<Client>[] = [];
        const actionFields: DataListDef<Client>[] = [];

        contentFields.push({
            listItemRender: (client) => (
                <div className="flex items-center gap-2 py-1">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${client.status === 'online' ? 'bg-green-500 shadow-glow-online animate-pulse-glow' : 'bg-border dark:bg-border-dark'}`} />
                    <div className={`font-inherit text-text-primary dark:text-text-primary-dark ${client.status === 'online' ? '' : 'opacity-70'} truncate`}>
                        {client.displayName || client.hostname}
                        {client.displayName && <span className="text-xs font-normal text-text-muted dark:text-text-muted-dark ml-2">({client.hostname})</span>}
                    </div>
                    <ConnectionBadge client={client} />
                </div>
            ),
            listLabel: null,
        });

        contentFields.push({
            accessorKey: 'id',
            listLabel: 'ID'
        });

        contentFields.push({
            listItemRender: (client) => (
                <span className="text-sm text-text-primary dark:text-text-primary-dark">
                    {client.version}
                </span>
            ),
            listLabel: 'Version',
        });

        contentFields.push({
            listItemRender: (client) => (
                client.status !== 'online' ? (
                    <span className="text-sm text-text-muted dark:text-text-muted-dark">
                        {formatDate(client.lastSeen)}
                    </span>
                ) : <span className="text-green-600 dark:text-green-500 text-sm">Online</span>
            ),
            listLabel: 'Status',
        });

        actionFields.push({
            listItemRender: (client) => (
                <div onClick={(e) => e.stopPropagation()} className="mt-2 md:mt-0 flex justify-center">
                    <DataAction
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
                            ...(client.connectionMode === 'outbound' && client.status !== 'online'
                                ? [{
                                    label: 'Jetzt verbinden',
                                    icon: PlugZap,
                                    onClick: () => {
                                        reconnectClient(client);
                                    },
                                    variant: 'default' as const,
                                }]
                                : []),
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
            title={<><Monitor size={18} className="text-text-muted dark:text-text-muted-dark" /> Clients</>}
            extraActions={
                <div className="flex gap-2">
                    <button
                        onClick={addOutboundClient}
                        className="px-3 py-1 bg-card dark:bg-card-dark border border-border dark:border-border-dark text-text-primary dark:text-text-primary-dark text-xs rounded hover:bg-hover dark:hover:bg-hover-dark"
                    >
                        <Plus size={12} className="inline mr-1" />Outbound-Client
                    </button>
                    <button
                        onClick={generateToken}
                        className="px-3 py-1 bg-primary text-white text-xs rounded hover:bg-primary-hover"
                    >
                        <Plus size={12} className="inline mr-1" />Generate New Token
                    </button>
                </div>
            }
            defaultSort={{ colIndex: 0, direction: 'asc' }}
            viewModeStorageKey="clientViewMode"
            data={currentClients}
            tableDef={tableColumns}
            listColumns={listColumns}
            keyField="id"
            searchable
            searchPlaceholder="Search Clients ..."
            onSearchChange={setSearchQuery}
            emptyMessage="No clients connected."
            rowClassName="align-top"
            onRowClick={setSelectedClient}
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
