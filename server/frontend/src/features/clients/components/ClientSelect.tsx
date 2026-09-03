import { Trash2 } from 'lucide-react';
import { Client } from '@pbcm/shared';
import { Collapsible, Badge, ActionButton, cn, FOCUS_RING } from '@stefgo/react-ui-components';

const ClientInfo = ({ client }: { client: Client }) => (
    <div className="px-12 py-3 bg-app-bg text-xs space-y-2 border-t">
        <div className="grid grid-cols-[80px_1fr] gap-2">
            <span className="text-text-muted">ID:</span>
            <span className="text-text-primary break-all">{client.id}</span>
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-2">
            <span className="text-text-muted">Hostname:</span>
            <span className="text-text-primary">{client.hostname}</span>
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-2">
            <span className="text-text-muted">Status:</span>
            <Badge variant={client.status === 'online' ? 'success' : 'neutral'} size="sm">
                {client.status}
            </Badge>
        </div>
        {client.displayName && (
            <div className="grid grid-cols-[80px_1fr] gap-2">
                <span className="text-text-muted">Display Name:</span>
                <span className="text-text-primary">{client.displayName}</span>
            </div>
        )}
    </div>
);

interface ClientSelectProps {
    clients: Client[];
    selectedClientId: string;
    onSelect: (clientId: string) => void;
    isSelecting?: boolean;
    onSetIsSelecting?: (val: boolean) => void;
    label?: string;
}

export const ClientSelect = ({
    clients,
    selectedClientId,
    onSelect,
    isSelecting: externalIsSelecting,
    onSetIsSelecting,
    label = "Target Client"
}: ClientSelectProps) => {
    const selectedClient = clients.find(c => c.id === selectedClientId);

    if (externalIsSelecting) {
        return (
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-text-muted uppercase">Select Client</label>
                    <button
                        onClick={() => onSetIsSelecting?.(false)}
                        className={cn("text-xs text-primary font-bold hover:underline rounded-sm", FOCUS_RING)}
                    >
                        Back
                    </button>
                </div>

                <div className="divide-y border rounded-lg overflow-hidden">
                    {clients.map(client => (
                        <Collapsible
                            key={client.id}
                            title={
                                <div className="flex items-center gap-2 overflow-hidden" onClick={() => { onSelect(client.id); onSetIsSelecting?.(false); }}>
                                    <div className={`w-3 h-3 rounded-full ${selectedClientId === client.id ? 'bg-primary' : 'border-2'}`} />
                                    <div className="font-medium text-sm text-text-primary truncate">
                                        {client.displayName || client.hostname}
                                    </div>
                                    <Badge variant={client.status === 'online' ? 'success' : 'neutral'} size="sm">
                                        {client.status}
                                    </Badge>
                                </div>
                            }
                        >
                            <ClientInfo client={client} />
                        </Collapsible>
                    ))}
                    {clients.length === 0 && (
                        <div className="p-8 text-center text-sm text-text-muted">
                            No clients available.
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-1">
            <div className="flex justify-between items-center">
                <label className="block text-xs font-bold text-text-muted uppercase">{label}</label>
                <button onClick={() => onSetIsSelecting?.(true)} className={cn("text-xs text-primary font-bold hover:underline flex items-center gap-1 rounded-sm", FOCUS_RING)}>
                    {selectedClient ? 'Change Client' : 'Set Client'}
                </button>
            </div>

            <div className="flex-1 border rounded-lg bg-app-bg overflow-y-auto p-2 space-y-2">
                {selectedClient ? (
                    <div className=" border rounded overflow-hidden group">
                        <Collapsible
                            title={
                                <div className="flex justify-between items-center gap-2 w-full">
                                    <div className="text-sm text-text-primary truncate font-medium opacity-90">
                                        {selectedClient.displayName || selectedClient.hostname}
                                        <Badge variant={selectedClient.status === 'online' ? 'success' : 'neutral'} size="sm" className="ml-2">
                                            {selectedClient.status}
                                        </Badge>
                                    </div>
                                    <ActionButton
                                        icon={Trash2}
                                        size="sm"
                                        color="orange"
                                        tooltip="Clear Selection"
                                        onClick={() => onSelect('')}
                                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                                    />
                                </div>
                            }
                        >
                            <ClientInfo client={selectedClient} />
                        </Collapsible>
                    </div>
                ) : (
                    <div className="px-1 py-2 text-md text-text-muted">No client selected</div>
                )}
            </div>
        </div>
    );
};
