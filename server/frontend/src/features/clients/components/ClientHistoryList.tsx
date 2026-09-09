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
    emptyMessage?: string;
}

export const ClientHistoryList = ({ history, type, title = 'Recent Activity', showClientName = false, emptyMessage }: ClientHistoryListProps) => {
    // Filter history based on type if provided
    const filteredHistory = type
        ? history.filter(item => item.type === type)
        : history;

    return <BaseHistoryList items={filteredHistory} title={title} showClientName={showClientName} emptyMessage={emptyMessage} />;
};
