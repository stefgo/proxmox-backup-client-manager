import { LoaderCircle } from 'lucide-react';
import { cn } from '@stefgo/react-ui-components';

interface LoadingIndicatorProps {
    /** What is being waited for. Shown next to the spinner and announced with it. */
    label?: string;
    className?: string;
}

/**
 * The one loading state, wherever a view has nothing to show yet.
 *
 * There used to be three: a hand-rolled CSS spinner in `HistoryOverview`, a large icon
 * with no text in `Settings`, and a line of muted text as the fallback for lazy routes.
 * No two looked alike. Anything that waits uses this instead of building another.
 *
 * `role="status"` so the text is announced when it appears; the spinner itself is
 * decorative and stays out of the accessibility tree.
 */
export const LoadingIndicator = ({
    label = 'Loading…',
    className,
}: LoadingIndicatorProps) => (
    <div
        role="status"
        className={cn(
            'flex items-center justify-center gap-2 py-8 text-sm text-text-muted',
            className,
        )}
    >
        <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
        {label}
    </div>
);
