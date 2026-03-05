import { ReactNode } from 'react';
import { AbstractDataView, BaseDataViewProps } from './AbstractDataView';

export interface DataListDef<T> {
    accessorKey?: keyof T;
    listLabel?: ReactNode | null;
    listLabelClassName?: string;
    listItemRender?: (item: T) => ReactNode;
}

export interface DataListColumnDef<T> {
    fields: DataListDef<T>[];
    columnClassName?: string;
}

export interface DataListProps<T> extends BaseDataViewProps<T> {
    itemDef?: DataListDef<T>[];
    columns?: DataListColumnDef<T>[];
}

export class DataList<T> extends AbstractDataView<T, DataListProps<T>> {
    private resolveContent(col: DataListDef<T>, item: T): ReactNode {
        if (col.listItemRender) return col.listItemRender(item);
        if (col.accessorKey) return item[col.accessorKey] as unknown as ReactNode;
        return null;
    }

    protected renderContent(): ReactNode {
        const { data, itemDef, columns: columnsProp, onRowClick } = this.props;
        const placeholder = this.getPlaceholder();
        const interactionClasses = this.getInteractionClasses();

        const isMultiColumn = !!columnsProp && columnsProp.length > 0;
        const columns = isMultiColumn
            ? columnsProp
            : (itemDef ? [{ fields: itemDef }] : []);

        return (
            <div className="divide-y divide-gray-200 dark:divide-[#333]">
                {placeholder ? (
                    <div className="px-6 py-8 text-center text-gray-500 dark:text-[#666]">
                        {placeholder}
                    </div>
                ) : (
                    data.map((item) => (
                        <div
                            key={this.getKey(item)}
                            onClick={() => onRowClick?.(item)}
                            className={`px-5 py-2 transition-colors group ${interactionClasses} ${this.getRowClass(item)}`}
                        >
                            <div className={`flex flex-col ${isMultiColumn ? 'md:flex-row md:items-center' : ''}`}>
                                {columns.map((colGroup, colIdx) => (
                                    <div key={colIdx} className={colGroup.columnClassName ?? ''}>
                                        {colGroup.fields
                                            .filter(def => def.listItemRender !== undefined || def.accessorKey !== undefined)
                                            .map((col, idx) => (
                                                <div key={idx} className="mb-1 last:mb-0">
                                                    {col.listLabel != null ? (
                                                        <div className="flex items-start gap-2 text-sm">
                                                            <span className={`font-semibold text-gray-500 dark:text-[#888] min-w-[100px] shrink-0 ${col.listLabelClassName ?? ''}`}>
                                                                {col.listLabel}:
                                                            </span>
                                                            <div className="flex-1 overflow-hidden">
                                                                {this.resolveContent(col, item)}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div>{this.resolveContent(col, item)}</div>
                                                    )}
                                                </div>
                                            ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>
        );
    }
}

