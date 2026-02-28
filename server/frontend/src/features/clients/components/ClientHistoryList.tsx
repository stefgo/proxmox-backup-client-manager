import { HistoryEntry } from '@pbcm/shared';
import { BaseHistoryList } from '../../base/components/BaseHistoryList';

// Extend HistoryEntry to include 'error' which is used in frontend but missing in shared type
type HistoryItem = HistoryEntry & { error?: string };

interface ClientHistoryListProps {
    history: HistoryItem[];
    type?: 'backup' | 'restore';
    title?: string;
}

export const ClientHistoryList = ({ history, type, title = 'Recent Activity' }: ClientHistoryListProps) => {
    // Filter history based on type if provided
    const filteredHistory = type
        ? history.filter(item => item.type === type)
        : history;

    return <BaseHistoryList items={filteredHistory} title={title} />;
};
