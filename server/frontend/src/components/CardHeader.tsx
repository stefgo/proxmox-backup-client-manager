import { ReactNode } from 'react';

interface CardHeaderProps {
    title?: ReactNode;
    action?: ReactNode;
}

export const CardHeader = ({ title, action }: CardHeaderProps) => {
    if (!title && !action) return null;
    return (
        <div className="px-5 py-4 border-b border-gray-200 dark:border-[#333] flex justify-between items-center bg-gray-50/50 dark:bg-[#252525]/50 rounded-t-xl">
            {title && <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">{title}</h3>}
            {action && <div>{action}</div>}
        </div>
    );
};
