import { Activity, ChevronRight } from 'lucide-react';
import { usePagination } from '../../../hooks/usePagination';
import { PaginationControls } from '../../../components/PaginationControls';
import { HistoryEntry } from '@pbcm/shared';
import { useState } from 'react';
import { formatDate } from '../../../utils';

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

    const {
        currentItems: currentHistory,
        currentPage,
        totalPages,
        itemsPerPage,
        totalItems,
        goToPage,
        setItemsPerPage
    } = usePagination(filteredHistory, 10);

    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const toggleExpand = (id: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent propagation if nested
        const newSet = new Set(expandedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setExpandedIds(newSet);
    };

    return (
        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-gray-200 dark:border-[#333] overflow-hidden shadow-lg h-full flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-[#333] flex justify-between items-center bg-gray-50 dark:bg-[#252525]">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Activity size={18} className="text-gray-500 dark:text-[#888]" /> {title}</h3>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-[#333] flex-1 overflow-y-auto">
                {currentHistory.map(item => (
                    <div
                        key={item.id}
                        onClick={(e) => toggleExpand(item.id, e)}
                        className="px-5 py-3 hover:bg-gray-50 dark:hover:bg-[#252525] transition-colors cursor-pointer"
                    >
                        <div className="group">
                            <div className="flex justify-between items-start mb-1">
                                <div className="flex items-center gap-2">
                                    <span className={`transition-all duration-200 ${expandedIds.has(item.id) ? 'rotate-90' : ''}`}>
                                        <ChevronRight size={14} className="text-gray-400" />
                                    </span>
                                    <span className="text-sm font-medium text-gray-900 dark:text-white">{item.name}</span>
                                </div>
                                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${item.status === 'running' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                    item.status === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                        item.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                            item.status === 'abort' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                                                'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                                    }`}>
                                    {item.status}
                                </span>
                            </div>
                            <div className="flex justify-between text-xs text-gray-500 dark:text-[#666] font-mono mt-0.5 pl-6">
                                <span>{item.id}</span>
                                <span>{formatDate(item.startTime)}</span>
                            </div>
                        </div>
                        {expandedIds.has(item.id) && (item.error || item.stderr) && (
                            <div className={`mt-2 text-xs font-mono p-2 rounded whitespace-pre-wrap pl-4 ml-6 cursor-text ${item.status === 'failed'
                                ? 'bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400'
                                : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                                }`}
                                onClick={(e) => e.stopPropagation()} // Allow selecting text without collapsing
                            >
                                {item.error || item.stderr}
                            </div>
                        )}
                        {expandedIds.has(item.id) && !item.error && !item.stderr && (
                            <div className="mt-2 text-xs text-gray-400 italic pl-4 ml-6 cursor-default">
                                No output available
                            </div>
                        )}
                    </div>
                ))}
                {filteredHistory.length === 0 && <div className="p-8 text-center text-[#555]">No history available</div>}
            </div>
            <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                itemsPerPage={itemsPerPage}
                totalItems={totalItems}
                onPageChange={goToPage}
                onItemsPerPageChange={setItemsPerPage}
            />
        </div>
    );
};
