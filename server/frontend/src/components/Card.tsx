import { ReactNode } from 'react';

interface CardProps {
    children: ReactNode;
    className?: string;
}

export const Card = ({ children, className = '' }: CardProps) => {
    return (
        <div className={`bg-white dark:bg-[#1e1e1e] rounded-xl border border-gray-200 dark:border-[#333] shadow-lg ${className}`}>
            {children}
        </div>
    );
};
