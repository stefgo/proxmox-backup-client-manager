import React from 'react';
import { MoreVertical } from 'lucide-react';
import { ActionButton, ActionButtonColor } from './ActionButton';
import { ActionMenu } from './ActionMenu';
import { useActionMenu } from '../hooks/useActionMenu';
import { LucideIcon } from 'lucide-react';

export interface DataTableActionItem {
    icon: LucideIcon;
    onClick: (e: React.MouseEvent) => void;
    color?: ActionButtonColor;
    tooltip?: string | { enabled: string; disabled: string };
    disabled?: boolean | (() => boolean);
    className?: string;
}

export interface DataTableActionMenuEntry {
    label: string;
    icon: LucideIcon;
    onClick: () => void;
    disabled?: boolean;
    disabledTitle?: string;
    variant?: 'danger' | 'default';
}

interface DataTableActionProps<TId extends string | number> {
    /** Unique identifier for this row – used to track which overflow menu is open */
    rowId: TId;
    /** Primary action buttons rendered inline (left of the overflow trigger) */
    actions?: DataTableActionItem[];
    /** Entries rendered inside the overflow dropdown menu */
    menuEntries?: DataTableActionMenuEntry[];
}

export const DataAction = <TId extends string | number>({
    rowId,
    actions = [],
    menuEntries = [],
}: DataTableActionProps<TId>) => {
    const { menuState, openMenu, closeMenu } = useActionMenu<TId>();

    const isMenuOpen = menuState?.id === rowId;

    return (
        <div className="flex justify-end gap-2 items-center">
            {actions.map((action, index) => (
                <ActionButton
                    key={index}
                    icon={action.icon}
                    onClick={action.onClick}
                    color={action.color ?? 'gray'}
                    tooltip={action.tooltip}
                    disabled={action.disabled}
                    className={action.className}
                />
            ))}

            {menuEntries.length > 0 && (
                <div className="relative">
                    <ActionButton
                        icon={MoreVertical}
                        onClick={(e) => openMenu(e, rowId)}
                        color="gray"
                        className={isMenuOpen ? 'opacity-100' : ''}
                    />

                    <ActionMenu
                        isOpen={isMenuOpen}
                        onClose={closeMenu}
                        position={menuState || { x: 0, y: 0 }}
                    >
                        {menuEntries.map((entry, index) => {
                            const isDanger = entry.variant === 'danger';
                            const isDisabled = entry.disabled ?? false;

                            const enabledClass = isDanger
                                ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10'
                                : 'text-gray-700 dark:text-[#ccc] hover:bg-gray-100 dark:hover:bg-[#333]';

                            const disabledClass = 'text-gray-300 dark:text-[#333] cursor-not-allowed';

                            return (
                                <button
                                    key={index}
                                    onClick={() => {
                                        if (!isDisabled) {
                                            entry.onClick();
                                            closeMenu();
                                        }
                                    }}
                                    disabled={isDisabled}
                                    className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${isDisabled ? disabledClass : enabledClass}`}
                                    title={isDisabled ? entry.disabledTitle : entry.label}
                                >
                                    <entry.icon size={14} />
                                    {entry.label}
                                </button>
                            );
                        })}
                    </ActionMenu>
                </div>
            )}
        </div>
    );
};
