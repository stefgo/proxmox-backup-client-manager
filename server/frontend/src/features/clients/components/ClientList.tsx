import { useCallback, useMemo } from 'react';
import { Plus, Monitor, Trash2, Edit, PlugZap, Network } from 'lucide-react';
import { Client, CLIENT_STATUS, CONNECTION_MODE } from '@pbcm/shared';
import { formatRelativeDate } from '../../../utils';
import { useNow } from '../../../hooks/useNow';
import { Button, DataAction, DataMultiView, EmptyState, StatusDot, type DataColumnDef, PAGE_SIZE, listPagination, actionsColumn, listGroups } from '@stefgo/react-ui-components';
import { ConnectionBadge } from './ConnectionBadge';
import { STATUS_DOT, STATUS_TONE } from '../../../components/statusTone';
import { useSearchQueryParam } from '../../../hooks/useSearchQueryParam';
import { STORAGE_KEYS } from '../../../lib/storageKeys';

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

export const ClientList = ({ clients, setSelectedClient, deleteClient, editClient, addClient, editTunnel, reconnectClient }: ClientListProps) => {
    const [searchQuery, setSearchQuery] = useSearchQueryParam();
    const now = useNow();

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
            label: client.tunnelConfigured ? 'Edit Tunnel' : 'Add Tunnel',
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

    // Handed to the view instead of applied in front of it: only then can the view tell an
    // empty search from an empty list, and page through what the search left.
    const matchesSearch = useCallback((c: Client, query: string) => {
        const q = query.toLowerCase();
        return (c.displayName ?? '').toLowerCase().includes(q) ||
            c.hostname.toLowerCase().includes(q) ||
            c.id.toLowerCase().includes(q);
    }, []);

    const renderActions = (client: Client) => (
        <div onClick={(e) => e.stopPropagation()}>
            <DataAction rowId={client.id} menuEntries={buildMenuEntries(client)} />
        </div>
    );

    const columns: DataColumnDef<Client>[] = [
        {
            header: 'Client',
            sortable: true,
            sortValue: (client) => client.displayName || client.hostname,
            list: { label: null },
            render: (client, view) => (
                <div className={view === 'list' ? 'flex items-center gap-2 py-1' : 'flex items-center gap-3'}>
                    <StatusDot size="sm" {...STATUS_DOT[client.status === CLIENT_STATUS.ONLINE ? STATUS_TONE.ONLINE : STATUS_TONE.OFFLINE]} label={client.status} />
                    <div className={`${view === 'list' ? 'font-inherit' : 'text-sm'} text-text-primary ${client.status === CLIENT_STATUS.ONLINE ? '' : 'opacity-70'} truncate`}>
                        {client.displayName || client.hostname}
                    </div>
                    <ConnectionBadge client={client} />
                </div>
            ),
        },
        { header: 'ID', accessorKey: 'id', table: false },
        {
            header: 'Version',
            table: false,
            render: (client) => <span className="text-sm text-text-primary">{client.version}</span>,
        },
        {
            // The table says when an offline client was last seen and nothing for an online
            // one -- the dot already does. The list has a labelled field and fills it.
            header: null,
            table: { cellClassName: 'align-top text-sm text-text-primary' },
            list: { label: 'Status' },
            render: (client, view) => {
                const online = client.status === CLIENT_STATUS.ONLINE;
                if (view === 'list') {
                    return online
                        ? <span className="text-success text-sm">Online</span>
                        : <span className="text-sm text-text-muted">{formatRelativeDate(client.lastSeen, now)}</span>;
                }
                return online ? null : (
                    <div className="whitespace-nowrap opacity-70">Last seen: {formatRelativeDate(client.lastSeen, now)}</div>
                );
            },
        },
        actionsColumn(renderActions),
    ];

    return (
        <DataMultiView
            title={<><Monitor size={18} className="text-text-muted" /> Clients</>}
            extraActions={
                <Button size="sm" icon={Plus} onClick={addClient}>
                    Add Client
                </Button>
            }
            sort={{ defaultValue: [{ colIndex: 0, direction: 'asc' }] }}
            viewMode={{ persist: { key: STORAGE_KEYS.clientsView, scope: 'local' } }}
            data={sortedClients}
            columns={columns}
            listGroups={listGroups()}
            keyField="id"
            searchable
            searchPlaceholder="Search clients…"
            search={{ value: searchQuery, onChange: setSearchQuery }}
            searchFilter={matchesSearch}
            noResultsMessage={`No clients match “${searchQuery}”.`}
            emptyMessage={
                <EmptyState
                    icon={Monitor}
                    title="No clients registered yet"
                    description="Add a client, then start its agent with the registration token it is given."
                />
            }
            rowClassName="align-top"
            onRowClick={setSelectedClient}
            pagination={listPagination(PAGE_SIZE.page)}
        />
    );
};
