import { Component, ReactNode } from 'react';
import { PaginationControls } from './PaginationControls';

export interface BaseDataViewProps<T> {
    data: T[];
    keyField: keyof T | ((item: T) => string | number);
    isLoading?: boolean;
    emptyMessage?: ReactNode;
    loadingMessage?: ReactNode;
    containerClassName?: string;
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

export abstract class AbstractDataView<T, P extends BaseDataViewProps<T>> extends Component<P> {
    protected getKey(item: T): string | number {
        const { keyField } = this.props;
        if (typeof keyField === 'function') {
            return (keyField as (i: T) => string | number)(item);
        }
        return item[keyField as keyof T] as unknown as string | number;
    }

    protected getRowClass(item: T): string {
        const { rowClassName } = this.props;
        return typeof rowClassName === 'function' ? rowClassName(item) : (rowClassName ?? '');
    }

    protected getInteractionClasses(): string {
        return this.props.onRowClick
            ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-[#252525]'
            : '';
    }

    protected renderPagination(): ReactNode {
        const { pagination } = this.props;
        if (!pagination) return null;

        return (
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
        );
    }

    protected getPlaceholder(): ReactNode {
        const { isLoading, loadingMessage = 'Loading...', emptyMessage = 'No items found', data } = this.props;

        if (isLoading) return loadingMessage;
        if (data.length === 0) return emptyMessage;
        return null;
    }

    /**
     * Abstract method to be implemented by sub-classes to render the core content (table or list)
     */
    protected abstract renderContent(): ReactNode;

    render() {
        const { containerClassName = '' } = this.props;
        const containerClass = `bg-white dark:bg-[#1e1e1e] border border-gray-200
            dark:border-[#333] overflow-hidden shadow-lg flex flex-col h-full ${containerClassName}`;

        return (
            <div className={containerClass}>
                <div className="flex-1 overflow-y-auto min-h-0">
                    {this.renderContent()}
                </div>
                {this.renderPagination()}
            </div>
        );
    }
}
