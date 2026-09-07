import { useMemo, useState } from 'react';
import { Plus, Monitor, Trash2, Edit, PlugZap, Network } from 'lucide-react';
import { Client, CLIENT_STATUS, CONNECTION_MODE } from '@pbcm/shared';
import { formatDate } from '../../../utils';
import { DataTableDef } from '@stefgo/react-ui-components';
import { DataAction } from '@stefgo/react-ui-components';
import { DataListDef, DataListColumnDef } from '@stefgo/react-ui-components';
import { DataMultiView } from '@stefgo/react-ui-components';
import { Button } from '@stefgo/react-ui-components';

interface ClientListProps {
    clients: Client[];
    setSelectedClient: (client: Client | null) => void;
    deleteClient: (client: Client) => void;
    editClient: (client: Client) => void;
    /** Opens the wizard. One entry point — the connection mode is its first step, not a button. */
    addClient: () => void;
    /** Opens the tunnel editor — setting one up and changing one are the same surface. */
    editTunnel: (client: Client) => void;
    reconnectClient: (client: Client) => void;
}

/**
 * Whether a tunnel is available to this client's jobs — worth showing at a glance, and
 * keyed on the tunnel rather than the connection mode: either mode can have one. Which
 * jobs take it is per job and not something a client row can answer.
 */
const ConnectionBadge = ({ client }: { client: Client }) => {
    if (!client.tunnelConfigured) return null;
    const tunnel = client.tunnel;
    const tone = tunnel?.status === 'error'
        ? 'text-error'
        : tunnel?.status === 'up'
            ? 'text-success'
            : 'text-text-muted';
    return (
        <span className={`inline-flex items-center gap-1 text-xs ${tone}`} title={tunnel?.lastError || undefined}>
            <Network size={12} />
            Tunnel
            {tunnel?.activeLeases ? ` (${tunnel.activeLeases})` : ''}
        </span>
    );
};

export const ClientList = ({ clients, setSelectedClient, deleteClient, editClient, addClient, editTunnel, reconnectClient }: ClientListProps) => {
    const [searchQuery, setSearchQuery] = useState('');

    /**
     * The row's actions, built once for both views — table and list show the same menu,
     * and two copies of it drift apart.
     *
     * The tunnel entry is offered for every client regardless of connection mode, and only
     * its label turns on whether credentials are stored: setting one up and changing one
     * are the same form on the same endpoint, so they are one action and not two. It is
     * here rather than inside the client editor because it is the client list the operator
     * is looking at when the question "this host cannot reach the PBS" comes up.
     */
    const buildMenuEntries = (client: Client) => [
        {
            label: 'Edit Client',
            icon: Edit,
            onClick: () => {
                editClient(client);
            },
            variant: 'default' as const,
        },
        {
            label: client.tunnelConfigured ? 'Edit SSH Tunnel' : 'Add SSH Tunnel',
            icon: Network,
            onClick: () => {
                editTunnel(client);
            },
            variant: 'default' as const,
        },
        ...(client.connectionMode === CONNECTION_MODE.OUTBOUND && client.status !== CLIENT_STATUS.ONLINE
            ? [{
                label: 'Connect Now',
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
            variant: 'danger' as const,
        },
    ];

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

    const buildTableDefinitions = (): DataTableDef<Client>[] => {
        const cols: DataTableDef<Client>[] = [];

        cols.push({
            tableHeader: "Client",
            sortable: true,
            sortValue: (client) => client.displayName || client.hostname,
            tableItemRender: (client) => (
                <>
                    <div className="flex items-center gap-3 mb-1">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${client.status === CLIENT_STATUS.ONLINE ? 'bg-success shadow-glow-success animate-pulse-glow' : 'bg-border'}`} />
                        <div className={`text-sm text-text-primary ${client.status === CLIENT_STATUS.ONLINE ? '' : 'opacity-70'} truncate`}>
                            {client.displayName || client.hostname}
                            {client.displayName && <span className="text-xs font-normal text-text-muted ml-2">({client.hostname})</span>}
                        </div>
                        <ConnectionBadge client={client} />
                    </div>
                    <div className="text-xs font-mono text-text-muted pl-5 truncate opacity-70">
                        {client.id}
                    </div>
                </>
            )
        });

        cols.push({
            tableHeader: null,
            tableCellClassName: "align-top text-sm text-text-primary",
            tableItemRender: (client) => (
                client.status !== CLIENT_STATUS.ONLINE ? (
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
                    <DataAction rowId={client.id} menuEntries={buildMenuEntries(client)} />
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
                    <div className={`w-2 h-2 rounded-full shrink-0 ${client.status === CLIENT_STATUS.ONLINE ? 'bg-success shadow-glow-success animate-pulse-glow' : 'bg-border'}`} />
                    <div className={`font-inherit text-text-primary ${client.status === CLIENT_STATUS.ONLINE ? '' : 'opacity-70'} truncate`}>
                        {client.displayName || client.hostname}
                        {client.displayName && <span className="text-xs font-normal text-text-muted ml-2">({client.hostname})</span>}
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
                <span className="text-sm text-text-primary">
                    {client.version}
                </span>
            ),
            listLabel: 'Version',
        });

        contentFields.push({
            listItemRender: (client) => (
                client.status !== CLIENT_STATUS.ONLINE ? (
                    <span className="text-sm text-text-muted">
                        {formatDate(client.lastSeen)}
                    </span>
                ) : <span className="text-success text-sm">Online</span>
            ),
            listLabel: 'Status',
        });

        actionFields.push({
            listItemRender: (client) => (
                <div onClick={(e) => e.stopPropagation()} className="mt-2 md:mt-0 flex justify-center">
                    <DataAction rowId={client.id} menuEntries={buildMenuEntries(client)} />
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
            title={<><Monitor size={18} className="text-text-muted" /> Clients</>}
            extraActions={
                <Button size="sm" icon={Plus} onClick={addClient}>
                    Add Client
                </Button>
            }
            sort={{ defaultValue: [{ colIndex: 0, direction: 'asc' }] }}
            viewMode={{ storageKey: "clientViewMode" }}
            data={filteredClients}
            tableDef={tableColumns}
            listColumns={listColumns}
            keyField="id"
            searchable
            searchPlaceholder="Search Clients ..."
            search={{ onChange: setSearchQuery }}
            emptyMessage="No clients connected."
            rowClassName="align-top"
            onRowClick={setSelectedClient}
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
