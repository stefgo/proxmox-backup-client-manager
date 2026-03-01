import { ReactNode } from 'react';
import { PaginationControls } from './PaginationControls';

export interface ColumnDef<T> {
    header: ReactNode;
    headerClassName?: string;
    accessorKey?: keyof T;
    accessorFn?: (item: T) => ReactNode;
    cellClassName?: string | ((item: T) => string);
}

export interface DataTableProps<T> {
    title: ReactNode;
    icon?: ReactNode;
    actions?: ReactNode;
    data: T[];
    columns: ColumnDef<T>[];
    keyField: keyof T | ((item: T) => string | number);
    emptyMessage?: ReactNode;
    isLoading?: boolean;
    loadingMessage?: ReactNode;
    onRowClick?: (item: T) => void;
    rowClassName?: string | ((item: T) => string);
    pagination?: {
        currentPage: number;
        totalPages: number;
        itemsPerPage: number;
        totalItems: number;
        onPageChange: (page: number) => void;
        onItemsPerPageChange: (limit: number) => void;
    };
    containerClassName?: string;
}

export const DataTable = <T,>({
    title,
    icon,
    actions,
    data,
    columns,
    keyField,
    emptyMessage = "No items found",
    isLoading = false,
    loadingMessage = "Loading...",
    onRowClick,
    rowClassName,
    pagination,
    containerClassName = ""
}: DataTableProps<T>) => {

    const getRowKey = (item: T) => {
        if (typeof keyField === 'function') {
            return keyField(item);
        }
        return item[keyField] as unknown as string | number;
    };

    return (
        <div className={`bg-white dark:bg-[#1e1e1e] rounded-xl border border-gray-200 dark:border-[#333] overflow-hidden shadow-lg flex flex-col h-full ${containerClassName}`}>
            <div className={`px-5 py-4 border-b border-gray-200 dark:border-[#333] bg-gray-50 dark:bg-[#252525] flex justify-between items-center shrink-0`}>
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    {icon && <span className="text-gray-500 dark:text-[#888]">{icon}</span>}
                    {title}
                </h3>
                {actions && <div className="flex items-center gap-3">{actions}</div>}
            </div>

            <div className="overflow-x-auto flex-1 h-full min-h-0">
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-[#252525] z-10">
                        <tr className="border-b border-gray-200 dark:border-[#333]">
                            {columns.map((col, idx) => (
                                <th key={idx} className={`px-6 py-3 text-xs font-medium text-gray-500 dark:text-[#888] uppercase tracking-wider ${col.headerClassName || ''}`}>
                                    {col.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-[#333] overflow-y-auto">
                        {isLoading ? (
                            <tr>
                                <td colSpan={columns.length} className="px-6 py-8 text-center text-gray-500 dark:text-[#666]">
                                    {loadingMessage}
                                </td>
                            </tr>
                        ) : data.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="px-6 py-8 text-center text-gray-500 dark:text-[#666]">
                                    {emptyMessage}
                                </td>
                            </tr>
                        ) : (
                            data.map(item => {
                                const customRowClass = typeof rowClassName === 'function' ? rowClassName(item) : (rowClassName || '');
                                const interactiveClass = onRowClick ? 'cursor-pointer' : '';
                                const hoverClass = onRowClick ? 'hover:bg-gray-50 dark:hover:bg-[#252525]' : '';

                                return (
                                    <tr
                                        key={getRowKey(item)}
                                        onClick={() => {
                                            if (onRowClick) {
                                                onRowClick(item);
                                            }
                                        }}
                                        className={`${hoverClass} transition-colors group ${interactiveClass} ${customRowClass}`}
                                    >
                                        {columns.map((col, idx) => {
                                            const cellClass = typeof col.cellClassName === 'function' ? col.cellClassName(item) : (col.cellClassName || '');
                                            let content: ReactNode;
                                            if (col.accessorFn) {
                                                content = col.accessorFn(item);
                                            } else if (col.accessorKey) {
                                                content = item[col.accessorKey] as unknown as ReactNode;
                                            }
                                            return (
                                                <td key={idx} className={`px-6 py-4 whitespace-nowrap ${cellClass}`}>
                                                    {content}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {pagination && (
                <div className="shrink-0 border-t border-gray-200 dark:border-[#333] bg-white dark:bg-[#1e1e1e]">
                    <PaginationControls
                        currentPage={pagination.currentPage}
                        totalPages={pagination.totalPages}
                        itemsPerPage={pagination.itemsPerPage}
                        totalItems={pagination.totalItems}
                        onPageChange={pagination.onPageChange}
                        onItemsPerPageChange={pagination.onItemsPerPageChange}
                    />
                </div>
            )}
        </div>
    );
};
