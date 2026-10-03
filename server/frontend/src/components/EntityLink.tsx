import type { ReactNode } from 'react';
import { Link, type To } from 'react-router-dom';

interface EntityLinkProps {
    to: To;
    children: ReactNode;
    className?: string;
    title?: string;
}

/**
 * A name in a list that leads to the page of what it names -- a client in the history, in
 * the job list, in a repository's snapshots.
 *
 * It keeps the colour of the text around it and is underlined on hover, so a column of
 * names does not turn into a column of links. The click stops here: a row that expands or
 * selects on click must not do so when its link is followed.
 */
export const EntityLink = ({ to, children, className = '', title }: EntityLinkProps) => (
    <Link
        to={to}
        title={title}
        onClick={(e) => e.stopPropagation()}
        className={`hover:underline hover:text-primary focus-visible:underline ${className}`}
    >
        {children}
    </Link>
);
