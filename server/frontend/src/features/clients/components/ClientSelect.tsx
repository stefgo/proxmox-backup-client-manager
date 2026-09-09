import { useState } from 'react';
import { Trash2, ChevronRight, ChevronDown, CheckCircle2, Circle } from 'lucide-react';
import { Client, CLIENT_STATUS } from '@pbcm/shared';
import { Badge, ActionButton, cn, FOCUS_RING } from '@stefgo/react-ui-components';

const ClientInfo = ({ client }: { client: Client }) => (
    <div className="px-12 py-3 bg-app-bg text-xs space-y-2 border-t border-border">
        <div className="grid grid-cols-[85px_1fr] gap-2">
            <span className="text-text-muted">ID:</span>
            <span className="text-text-primary break-all">{client.id}</span>
        </div>
        <div className="grid grid-cols-[85px_1fr] gap-2">
            <span className="text-text-muted">Hostname:</span>
            <span className="text-text-primary">{client.hostname}</span>
        </div>
        {client.displayName && (
            <div className="grid grid-cols-[85px_1fr] gap-2">
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
    /**
     * The client is given by the surface that opened this form and cannot be changed here —
     * a job belongs to the client it was created for. The card still shows and expands, it
     * just offers no way to pick another one or to clear the selection.
     */
    locked?: boolean;
    /**
     * Offline clients stay visible but are not selectable. The archive file browser reads
     * its listing live from the agent, so a job for an offline client could not be filled in.
     */
    disableOffline?: boolean;
}

/**
 * Picks the client a job or a restore runs on, in the same shape as
 * {@link JobRepositorySelect} picks the repository: a header with the action, a card that
 * expands into the details, and a list that replaces the card while choosing.
 */
export const ClientSelect = ({
    clients,
    selectedClientId,
    onSelect,
    isSelecting: externalIsSelecting,
    onSetIsSelecting,
    label = "Target Client",
    locked = false,
    disableOffline = false,
}: ClientSelectProps) => {
    const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
    const [isSelectedClientExpanded, setIsSelectedClientExpanded] = useState(false);

    const selectedClient = clients.find(c => c.id === selectedClientId);

    const isSelectable = (client: Client) =>
        !disableOffline || client.status === CLIENT_STATUS.ONLINE;

    const toggleExpand = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setExpandedClientId(expandedClientId === id ? null : id);
    };

    if (externalIsSelecting && !locked) {
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

                <div className="divide-y divide-border border border-border rounded-lg overflow-hidden transition-all">
                    {clients.map(client => {
                        const selectable = isSelectable(client);
                        return (
                            <div key={client.id} className="flex flex-col">
                                <div
                                    onClick={() => {
                                        if (!selectable) return;
                                        onSelect(client.id);
                                        onSetIsSelecting?.(false);
                                    }}
                                    title={selectable ? undefined : 'Client Offline'}
                                    className={cn(
                                        'px-4 py-3 flex items-center justify-between transition-colors',
                                        selectable
                                            ? 'hover:bg-hover cursor-pointer'
                                            : 'bg-app-bg text-text-muted opacity-75 cursor-not-allowed',
                                    )}
                                >
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <ActionButton
                                            icon={expandedClientId === client.id ? ChevronDown : ChevronRight}
                                            size="sm"
                                            tooltip={expandedClientId === client.id ? 'Collapse' : 'Expand'}
                                            onClick={(e) => toggleExpand(e, client.id)}
                                        />

                                        <div className="flex items-center gap-2 overflow-hidden">
                                            {selectedClientId === client.id ? (
                                                <CheckCircle2 size={18} className="text-primary flex-shrink-0 animate-pulse-soft" />
                                            ) : (
                                                <Circle size={18} className="text-border flex-shrink-0" />
                                            )}
                                            <div className="font-medium text-sm text-text-primary truncate">
                                                {client.displayName || client.hostname}
                                            </div>
                                            <Badge variant={client.status === CLIENT_STATUS.ONLINE ? 'success' : 'neutral'} size="sm">
                                                {client.status}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>

                                {expandedClientId === client.id && (
                                    <ClientInfo client={client} />
                                )}
                            </div>
                        );
                    })}
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
                <label className="block text-xs font-bold text-text-muted uppercase">
                    {label} <span className="text-error">*</span>
                </label>
                {!locked && (
                    <button
                        onClick={() => onSetIsSelecting?.(true)}
                        className={cn("text-xs text-primary font-bold hover:underline flex items-center gap-1 transition-colors rounded-sm", FOCUS_RING)}
                    >
                        {selectedClient ? 'Change Client' : 'Set Client'}
                    </button>
                )}
            </div>

            <div className="flex-1 border border-border rounded-lg bg-app-bg overflow-y-auto p-2 space-y-2">
                {selectedClient ? (
                    <div className="bg-card border border-border rounded overflow-hidden transition-all">
                        <div className="flex flex-col">
                            <div className="px-3 py-2 flex justify-between items-center gap-2">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <ActionButton
                                        icon={isSelectedClientExpanded ? ChevronDown : ChevronRight}
                                        size="sm"
                                        tooltip={isSelectedClientExpanded ? 'Collapse' : 'Expand'}
                                        onClick={() => setIsSelectedClientExpanded(!isSelectedClientExpanded)}
                                    />
                                    <div className="text-sm text-text-primary truncate font-medium opacity-90">
                                        {selectedClient.displayName || selectedClient.hostname}
                                    </div>
                                    <Badge variant={selectedClient.status === CLIENT_STATUS.ONLINE ? 'success' : 'neutral'} size="sm">
                                        {selectedClient.status}
                                    </Badge>
                                </div>
                                {!locked && (
                                    <div className="flex items-center gap-2">
                                        <ActionButton
                                            icon={Trash2}
                                            size="sm"
                                            color="orange"
                                            tooltip="Clear Selection"
                                            onClick={() => onSelect('')}
                                        />
                                    </div>
                                )}
                            </div>

                            {isSelectedClientExpanded && (
                                <ClientInfo client={selectedClient} />
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="px-1 py-2 text-md text-text-muted">No client selected</div>
                )}
            </div>
        </div>
    );
};
