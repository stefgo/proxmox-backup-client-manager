import type { ReactNode } from 'react';
import { BaseHistoryItem, BaseHistoryList } from '../../history/components/BaseHistoryList';

interface ClientHistoryListProps {
    // Callers pass two different rows: per-client history from the agent
    // (HistoryEntry) and global rows from GET /api/v1/history
    // (GlobalHistoryEntry). BaseHistoryItem is the contract both satisfy and the
    // only one this component actually needs.
    history: BaseHistoryItem[];
    type?: 'backup' | 'restore';
    title?: string;
    showClientName?: boolean;
    /** Forwarded to the list underneath -- see BaseHistoryListProps. */
    clientId?: string;
    emptyMessage?: ReactNode;
}

export const ClientHistoryList = ({ history, type, title = 'Recent Activity', showClientName = false, clientId, emptyMessage }: ClientHistoryListProps) => {
    // Filter history based on type if provided
    const filteredHistory = type
        ? history.filter(item => item.type === type)
        : history;

    return <BaseHistoryList items={filteredHistory} title={title} showClientName={showClientName} clientId={clientId} emptyMessage={emptyMessage} />;
};
