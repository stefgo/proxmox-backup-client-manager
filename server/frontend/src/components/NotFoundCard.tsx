import { ReactNode } from 'react';
import { useNavigate, type To } from 'react-router-dom';
import { Button, Card, EmptyState } from '@stefgo/react-ui-components';

interface NotFoundCardProps {
    title: string;
    /** What was looked for and not found. */
    children: ReactNode;
    /** Where the button leads, and what it says. */
    backTo: To;
    backLabel: string;
}

/**
 * A page whose subject does not exist. It says so and offers the way back to the list the
 * subject would be in, instead of silently redirecting to that list and losing the URL.
 *
 * The library's `EmptyState` inside a card; what stays here is the router, which the
 * library does not know.
 */
export const NotFoundCard = ({ title, children, backTo, backLabel }: NotFoundCardProps) => {
    const navigate = useNavigate();

    return (
        <Card title={title} padding="md">
            <EmptyState
                title={children}
                action={
                    <Button variant="secondary" onClick={() => navigate(backTo)}>
                        {backLabel}
                    </Button>
                }
            />
        </Card>
    );
};
