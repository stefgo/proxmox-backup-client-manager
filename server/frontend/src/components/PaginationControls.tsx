import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationControlsProps {
    currentPage: number;
    totalPages: number;
    itemsPerPage: number;
    totalItems: number;
    onPageChange: (page: number) => void;
    onItemsPerPageChange: (size: number) => void;
    pageSizeOptions?: number[];
}

export const PaginationControls = ({
    currentPage,
    totalPages,
    itemsPerPage,
    totalItems,
    onPageChange,
    onItemsPerPageChange,
    pageSizeOptions = [10, 20, 50]
}: PaginationControlsProps) => {
    // Only render if total items exceed the smallest page size option (or just 10 if not checking options)
    // The requirement says "wenn die Anzahl der Einträge >10 ist", so we check totalItems > 10.
    if (totalItems <= pageSizeOptions[0]) {
        return null;
    }

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-5 py-3 border-t border-gray-200 dark:border-[#333] bg-gray-50 dark:bg-[#252525]">
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span>Rows per page:</span>
                <select
                    value={itemsPerPage}
                    onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
                    className="bg-white dark:bg-[#1e1e1e] border border-gray-300 dark:border-[#444] text-gray-900 dark:text-white text-sm rounded focus:ring-blue-500 focus:border-blue-500 block p-1"
                >
                    {pageSizeOptions.map(size => (
                        <option key={size} value={size}>{size}</option>
                    ))}
                </select>
                <span className="ml-2">
                    {Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)} - {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems}
                </span>
            </div>

            <div className="flex items-center gap-1">
                <button
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-[#333] disabled:opacity-50 disabled:cursor-not-allowed text-gray-600 dark:text-gray-400 transition-colors"
                >
                    <ChevronLeft size={20} />
                </button>
                <div className="flex items-center gap-1 px-2">
                    {/* Simple page indication, can be expanded to page numbers if needed, but simple prev/next with "Page X of Y" is often enough for this scope */}
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                        Page {currentPage} of {totalPages}
                    </span>
                </div>
                <button
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-[#333] disabled:opacity-50 disabled:cursor-not-allowed text-gray-600 dark:text-gray-400 transition-colors"
                >
                    <ChevronRight size={20} />
                </button>
            </div>
        </div>
    );
};
