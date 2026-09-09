import { RefreshCw } from 'lucide-react';

/**
 * The one full-panel loading state.
 *
 * There used to be two: a hand-rolled CSS spinner in `HistoryOverview` (a bare `div`
 * with `animate-spin` and a palette colour) and this icon in `Settings`. They did not
 * look alike, and only one of them survived a theme switch. Anything that needs to
 * show a page or panel waiting uses this instead of building a third.
 *
 * `className` sizes the box, because the two callers sit in different layouts — one
 * fills a flex column, the other needs its own height.
 */
export const LoadingIndicator = ({ className = 'h-64' }: { className?: string }) => (
    <div className={`flex items-center justify-center ${className}`}>
        <RefreshCw className="animate-spin text-primary" size={32} aria-hidden />
        <span className="sr-only">Loading</span>
    </div>
);
