import { Trash2 } from 'lucide-react';
import { Client } from '@pbcm/shared';
import { Collapsible, Badge } from '@stefgo/react-ui-components';

const ClientInfo = ({ client }: { client: Client }) => (
    <div className="px-12 py-3 bg-gray-50 dark:bg-[#252525] text-xs space-y-2 border-t border-gray-100 dark:border-[#2a2a2a]">
        <div className="grid grid-cols-[80px_1fr] gap-2">
            <span className="text-gray-500 dark:text-[#888]">ID:</span>
            <span className="text-gray-900 dark:text-white break-all">{client.id}</span>
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-2">
            <span className="text-gray-500 dark:text-[#888]">Hostname:</span>
            <span className="text-gray-900 dark:text-white">{client.hostname}</span>
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-2">
            <span className="text-gray-500 dark:text-[#888]">Status:</span>
            <Badge variant={client.status === 'online' ? 'success' : 'gray'} size="sm">
                {client.status}
            </Badge>
        </div>
        {client.displayName && (
            <div className="grid grid-cols-[80px_1fr] gap-2">
                <span className="text-gray-500 dark:text-[#888]">Display Name:</span>
                <span className="text-gray-900 dark:text-white">{client.displayName}</span>
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
                    <label className="block text-xs font-bold text-gray-500 dark:text-[#888] uppercase">Select Client</label>
                    <button
                        onClick={() => onSetIsSelecting?.(false)}
                        className="text-xs text-[#E54D0D] font-bold hover:underline"
                    >
                        Back
                    </button>
                </div>

                <div className="divide-y divide-gray-200 dark:divide-[#333] border border-gray-200 dark:border-[#333] rounded-lg overflow-hidden bg-white dark:bg-[#1e1e1e]">
                    {clients.map(client => (
                        <Collapsible
                            key={client.id}
                            title={
                                <div className="flex items-center gap-2 overflow-hidden" onClick={() => { onSelect(client.id); onSetIsSelecting?.(false); }}>
                                    <div className={`w-3 h-3 rounded-full ${selectedClientId === client.id ? 'bg-[#E54D0D]' : 'border-2 border-gray-300 dark:border-[#444]'}`} />
                                    <div className="font-medium text-sm text-gray-900 dark:text-white truncate">
                                        {client.displayName || client.hostname}
                                    </div>
                                    <Badge variant={client.status === 'online' ? 'success' : 'gray'} size="sm">
                                        {client.status}
                                    </Badge>
                                </div>
                            }
                        >
                            <ClientInfo client={client} />
                        </Collapsible>
                    ))}
                    {clients.length === 0 && (
                        <div className="p-8 text-center text-sm text-gray-500 dark:text-[#666]">
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
                <label className="block text-xs font-bold text-gray-500 dark:text-[#888] uppercase">{label}</label>
                <button onClick={() => onSetIsSelecting?.(true)} className="text-xs text-[#E54D0D] font-bold hover:underline flex items-center gap-1">
                    {selectedClient ? 'Change Client' : 'Set Client'}
                </button>
            </div>

            <div className="flex-1 border border-gray-200 dark:border-[#333] rounded-lg bg-gray-50 dark:bg-[#111] overflow-y-auto p-2 space-y-2">
                {selectedClient ? (
                    <div className="bg-white dark:bg-[#222] border border-gray-200 dark:border-[#333] rounded overflow-hidden group">
                        <Collapsible
                            title={
                                <div className="flex justify-between items-center gap-2 w-full">
                                    <div className="text-sm text-gray-900 dark:text-white truncate font-medium opacity-90">
                                        {selectedClient.displayName || selectedClient.hostname}
                                        <Badge variant={selectedClient.status === 'online' ? 'success' : 'gray'} size="sm" className="ml-2">
                                            {selectedClient.status}
                                        </Badge>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onSelect('');
                                        }}
                                        className="p-1 text-gray-400 hover:text-[#E54D0D] transition-colors opacity-0 group-hover:opacity-100"
                                        title="Clear Selection"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            }
                        >
                            <ClientInfo client={selectedClient} />
                        </Collapsible>
                    </div>
                ) : (
                    <div className="px-1 py-2 text-md text-gray-400 dark:text-gray-400">No client selected</div>
                )}
            </div>
        </div>
    );
};
