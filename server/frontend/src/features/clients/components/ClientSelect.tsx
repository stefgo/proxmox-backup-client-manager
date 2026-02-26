import { useState } from 'react';
import { Trash2, ChevronRight, ChevronDown, CheckCircle2, Circle } from 'lucide-react';
import { Client } from '@pbcm/shared';

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
            <span className={`font-medium ${client.status === 'online' ? 'text-green-500' : 'text-gray-500'}`}>
                {client.status}
            </span>
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
    const [internalIsSelecting, setInternalIsSelecting] = useState(false);

    const isSelecting = externalIsSelecting ?? internalIsSelecting;
    const setIsSelecting = onSetIsSelecting ?? setInternalIsSelecting;

    const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
    const [isSelectedClientExpanded, setIsSelectedClientExpanded] = useState(false);

    const selectedClient = clients.find(c => c.id === selectedClientId);

    const handleSelect = (client: Client) => {
        onSelect(client.id);
        setIsSelecting(false);
    };

    const toggleExpand = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setExpandedClientId(expandedClientId === id ? null : id);
    };

    if (isSelecting) {
        return (
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-gray-500 dark:text-[#888] uppercase">Select Client</label>
                    <button
                        onClick={() => setIsSelecting(false)}
                        className="text-xs text-[#E54D0D] font-bold hover:underline"
                    >
                        Back
                    </button>
                </div>

                <div className="divide-y divide-gray-200 dark:divide-[#333] border border-gray-200 dark:border-[#333] rounded-lg overflow-hidden bg-white dark:bg-[#1e1e1e]">
                    {clients.map(client => (
                        <div key={client.id} className="flex flex-col">
                            <div
                                onClick={() => handleSelect(client)}
                                className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-[#252525] cursor-pointer transition-colors"
                            >
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <button
                                        onClick={(e) => toggleExpand(e, client.id)}
                                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                    >
                                        {expandedClientId === client.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                    </button>

                                    <div className="flex items-center gap-2 overflow-hidden">
                                        {selectedClientId === client.id ? (
                                            <CheckCircle2 size={18} className="text-[#E54D0D] flex-shrink-0" />
                                        ) : (
                                            <Circle size={18} className="text-gray-300 dark:text-[#444] flex-shrink-0" />
                                        )}
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <div className="font-medium text-sm text-gray-900 dark:text-white truncate">
                                                {client.displayName || client.hostname} ({client.status})
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {expandedClientId === client.id && (
                                <ClientInfo client={client} />
                            )}
                        </div>
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
                <button onClick={() => setIsSelecting(true)} className="text-xs text-[#E54D0D] font-bold hover:underline flex items-center gap-1">
                    {selectedClient ? 'Change Client' : 'Set Client'}
                </button>
            </div>

            <div className="flex-1 border border-gray-200 dark:border-[#333] rounded-lg bg-gray-50 dark:bg-[#111] overflow-y-auto p-2 space-y-2">
                {selectedClient ? (
                    <div className="bg-white dark:bg-[#222] border border-gray-200 dark:border-[#333] rounded overflow-hidden group">
                        <div className="flex flex-col">
                            <div className="px-3 py-2 flex justify-between items-center gap-2">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <button
                                        onClick={() => setIsSelectedClientExpanded(!isSelectedClientExpanded)}
                                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                    >
                                        {isSelectedClientExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </button>
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <div className="text-sm text-gray-900 dark:text-white truncate font-medium opacity-90">
                                            {selectedClient.displayName || selectedClient.hostname} ({selectedClient.status})
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onSelect('');
                                        }}
                                        className="p-1 text-gray-400 hover:text-[#E54D0D] transition-colors"
                                        title="Clear Selection"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>

                            {isSelectedClientExpanded && (
                                <ClientInfo client={selectedClient} />
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="px-1 py-2 text-md text-gray-400 dark:text-gray-400">No client selected</div>
                )}
            </div>
        </div>
    );
};
