import { ReactNode } from 'react';
import { AbstractDataView, BaseDataViewProps } from './AbstractDataView';

export interface DataTableDef<T> {
    accessorKey?: keyof T;
    tableHeader: ReactNode;
    tableHeaderClassName?: string;
    tableCellClassName?: string | ((item: T) => string);
    tableItemRender?: (item: T) => ReactNode;
}

export interface DataTableProps<T> extends BaseDataViewProps<T> {
    itemDef: DataTableDef<T>[];
}

export class DataTable<T> extends AbstractDataView<T, DataTableProps<T>> {
    protected renderContent(): ReactNode {
        const { data, itemDef, onRowClick } = this.props;
        const placeholder = this.getPlaceholder();
        const interactionClasses = this.getInteractionClasses();

        return (
            <div className="overflow-x-auto h-full w-full">
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-[#252525] z-10">
                        <tr className="border-b border-gray-200 dark:border-[#333]">
                            {itemDef.map((col, idx) => (
                                <th
                                    key={idx}
                                    className={`px-6 py-2 text-xs font-medium text-gray-500 dark:text-[#888] uppercase tracking-wider ${col.tableHeaderClassName ?? ''}`}
                                >
                                    {col.tableHeader}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-[#333]">
                        {placeholder ? (
                            <tr>
                                <td colSpan={itemDef.length} className="px-6 py-8 text-center text-gray-500 dark:text-[#666]">
                                    {placeholder}
                                </td>
                            </tr>
                        ) : (
                            data.map((item) => {
                                const cellContent = (col: DataTableDef<T>) => {
                                    if (col.tableItemRender) return col.tableItemRender(item);
                                    if (col.accessorKey) return item[col.accessorKey] as unknown as ReactNode;
                                };

                                return (
                                    <tr
                                        key={this.getKey(item)}
                                        onClick={() => onRowClick?.(item)}
                                        className={`transition-colors group ${interactionClasses} ${this.getRowClass(item)}`}
                                    >
                                        {itemDef.map((col, idx) => {
                                            const cellClass = typeof col.tableCellClassName === 'function'
                                                ? col.tableCellClassName(item)
                                                : (col.tableCellClassName ?? '');
                                            return (
                                                <td key={idx} className={`px-6 py-2 whitespace-nowrap ${cellClass}`}>
                                                    {cellContent(col)}
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
        );
    }
}

