import { ReactNode } from 'react';
import { Card } from './Card';
import { CardHeader } from './CardHeader';

interface DataCardProps {
    children: ReactNode;
    className?: string;
    title?: ReactNode;
    action?: ReactNode;
    noPadding?: boolean;
}

export const DataCard = ({ children, className = '', title, action, noPadding = false }: DataCardProps) => {
    return (
        <Card className={className}>
            <CardHeader title={title} action={action} />
            <div className={noPadding ? '' : 'p-6'}>
                {children}
            </div>
        </Card>
    );
};
