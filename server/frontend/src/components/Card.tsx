import { ReactNode } from 'react';

interface CardProps {
    children: ReactNode;
    className?: string;
    title?: ReactNode;
    action?: ReactNode;
    noPadding?: boolean;
}

export const Card = ({ children, className = '', title, action, noPadding = false }: CardProps) => {
    return (
        <div className={`bg-white dark:bg-[#1e1e1e] rounded-xl border border-gray-200 dark:border-[#333] shadow-lg ${className}`}>
            {(title || action) && (
                <div className="px-5 py-4 border-b border-gray-200 dark:border-[#333] flex justify-between items-center bg-gray-50/50 dark:bg-[#252525]/50 rounded-t-xl">
                    {title && <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">{title}</h3>}
                    {action && <div>{action}</div>}
                </div>
            )}
            <div className={noPadding ? '' : 'p-6'}>
                {children}
            </div>
        </div>
    );
};
