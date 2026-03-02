import { ReactNode, useState } from 'react';
import { LayoutList, Table as TableIcon } from 'lucide-react';
import { Card } from './Card';
import { CardHeader } from './CardHeader';
import { DataTable, DataTableDef } from './DataTable';
import { DataList, DataListDef, DataListColumnDef } from './DataList';

export interface DataMultiViewProps<T> {
    title?: ReactNode;
    extraActions?: ReactNode;
    className?: string;
    viewModeStorageKey?: string;
    data: T[];
    tableDef: DataTableDef<T>[];
    listDef?: DataListDef<T>[];
    listColumns?: DataListColumnDef<T>[];
    keyField: keyof T | ((item: T) => string | number);
    isLoading?: boolean;
    emptyMessage?: ReactNode;
    loadingMessage?: ReactNode;
    rowClassName?: string | ((item: T) => string);
    onRowClick?: (item: T) => void;
    pagination?: {
        currentPage: number;
        totalPages: number;
        itemsPerPage: number;
        totalItems: number;
        onPageChange: (page: number) => void;
        onItemsPerPageChange: (limit: number) => void;
    };
}

export const DataMultiView = <T,>(props: DataMultiViewProps<T>) => {
    const {
        title,
        extraActions,
        className = '',
        viewModeStorageKey = 'dataViewMode',
        tableDef,
        listDef,
        listColumns,
        ...sharedProps
    } = props;

    const [viewMode, setViewMode] = useState<'table' | 'list'>(() => {
        return (localStorage.getItem(viewModeStorageKey) as 'table' | 'list') || 'table';
    });

    const changeViewMode = (mode: 'table' | 'list') => {
        setViewMode(mode);
        localStorage.setItem(viewModeStorageKey, mode);
    };

    const viewToggle = (
        <div className="bg-gray-200 dark:bg-[#333] rounded-lg p-1 flex items-center gap-1">
            <button
                onClick={() => changeViewMode('table')}
                className={`p-1 rounded transition-all ${viewMode === 'table'
                    ? 'bg-white dark:bg-[#444] shadow text-gray-900 dark:text-white'
                    : 'text-gray-500 dark:text-[#888] hover:text-gray-900 dark:hover:text-white'
                    }`}
                title="Table View"
            >
                <TableIcon size={14} />
            </button>
            <button
                onClick={() => changeViewMode('list')}
                className={`p-1 rounded transition-all ${viewMode === 'list'
                    ? 'bg-white dark:bg-[#444] shadow text-gray-900 dark:text-white'
                    : 'text-gray-500 dark:text-[#888] hover:text-gray-900 dark:hover:text-white'
                    }`}
                title="List View"
            >
                <LayoutList size={14} />
            </button>
        </div>
    );

    const headerAction = (
        <div className="flex items-center gap-3">
            {viewToggle}
            {extraActions}
        </div>
    );

    const containerProps = {
        ...sharedProps,
        containerClassName: "rounded-none border-0 shadow-none flex-1",
    };

    return (
        <Card className={`overflow-hidden flex flex-col h-full ${className}`}>
            <CardHeader title={title} action={headerAction} />
            {viewMode === 'list' ? (
                <DataList
                    {...containerProps}
                    itemDef={listDef}
                    columns={listColumns}
                />
            ) : (
                <DataTable
                    {...containerProps}
                    itemDef={tableDef}
                />
            )}
        </Card>
    );
};
