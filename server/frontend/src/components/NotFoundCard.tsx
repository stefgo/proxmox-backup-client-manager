import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card } from '@stefgo/react-ui-components';

interface NotFoundCardProps {
    title: string;
    /** What was looked for and not found. */
    children: ReactNode;
    /** Where the button leads, and what it says. */
    backTo: string;
    backLabel: string;
}

/**
 * A page whose subject does not exist. It says so and offers the way back to the list the
 * subject would be in, instead of silently redirecting to that list and losing the URL.
 */
export const NotFoundCard = ({ title, children, backTo, backLabel }: NotFoundCardProps) => {
    const navigate = useNavigate();

    return (
        <Card title={title} padding="md" classNames={{ content: 'space-y-4' }}>
            <p className="text-text-secondary">{children}</p>
            <Button variant="secondary" onClick={() => navigate(backTo)}>
                {backLabel}
            </Button>
        </Card>
    );
};
