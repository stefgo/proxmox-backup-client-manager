import { useLayoutEffect, useRef } from 'react';
import { Check, Copy } from 'lucide-react';
import { ActionButton, cn, useCopyToClipboard } from '@stefgo/react-ui-components';
import { isAtEnd } from '../lib/logScroll';

const TONE_CLASS = {
    live: 'bg-badge-info-bg text-badge-info-text',
    failed: 'bg-error-bg text-error',
    plain: 'bg-hover text-text-muted',
} as const;

interface RunLogProps {
    text: string;
    tone: keyof typeof TONE_CLASS;
    /** The run is still writing: the log stays at its end as lines arrive. */
    follow?: boolean;
}

/**
 * A run's output: as high as it is up to a limit, scrolling beyond it -- a backup of a few
 * thousand files used to push the rest of the list off the page.
 */
export const RunLog = ({ text, tone, follow = false }: RunLogProps) => {
    const box = useRef<HTMLDivElement>(null);
    // Whether the operator is reading the end. Starts true: a log opens at its last line.
    const atEnd = useRef(true);
    const { copied, unavailable: copyUnavailable, copy } = useCopyToClipboard();

    useLayoutEffect(() => {
        const el = box.current;
        if (follow && el && atEnd.current) el.scrollTop = el.scrollHeight;
    }, [text, follow]);

    // The clipboard API exists in a secure context only, and the dashboard is often reached
    // over plain HTTP in a LAN. There the log is selected instead, one keystroke from copied.
    const handleCopy = async () => {
        if (await copy(text)) return;
        if (box.current) window.getSelection()?.selectAllChildren(box.current);
    };

    return (
        <div className="mt-2 ml-6">
            <div className="relative">
                <div
                    ref={box}
                    onScroll={(e) => {
                        atEnd.current = isAtEnd(e.currentTarget);
                    }}
                    className={cn(
                        'max-h-96 overflow-y-auto text-xs font-mono p-2 pl-4 pr-10 rounded whitespace-pre-wrap cursor-text',
                        TONE_CLASS[tone],
                    )}
                >
                    {text}
                </div>
                <ActionButton
                    icon={copied ? Check : Copy}
                    size="sm"
                    color={copied ? 'green' : 'gray'}
                    tooltip={copied ? 'Copied!' : 'Copy log'}
                    onClick={handleCopy}
                    className="absolute top-1 right-3"
                />
            </div>
            {copyUnavailable && (
                <p role="status" className="mt-1 text-xs text-warning">
                    Copying is not available on this connection — the log is selected, press Ctrl/⌘+C.
                </p>
            )}
        </div>
    );
};
