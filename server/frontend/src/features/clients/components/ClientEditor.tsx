import { useEffect, useState } from 'react';
import { Client } from '@pbcm/shared';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@stefgo/react-ui-components';
import { useClientStore } from '../../../stores/useClientStore';
import { ClientIdentityCard } from './ClientIdentityCard';
import { ClientTunnelCard } from './ClientTunnelCard';

interface ClientEditorProps {
    client: Client;
    onSave: (id: string, data: { displayName?: string; outboundTargetAddress?: string }) => Promise<void>;
    onCancel: () => void;
}

/**
 * Edits a client: one card per resource the backend actually exposes.
 *
 * The split is not cosmetic. `PUT /clients/:id` and `PUT /clients/:id/tunnel` are separate
 * endpoints with separate failure modes, and the previous single form gave them one
 * prominent save button that submitted only the first — SSH edits were lost without a
 * word. Two cards, two buttons, and no form spanning both.
 *
 * Leaving, on the other hand, belongs to the editor rather than to either card. It used to
 * hang off the first one, which meant that working the page top to bottom left the operator
 * at the end of the tunnel card with no way out but to scroll back up. The sticky bar below
 * is the editor's own: it is one pointer move away at every scroll position, and it is the
 * only place that can see both cards at once — so it is also where an unsaved change in
 * either of them can be reported.
 */
export const ClientEditor = ({ client, onSave, onCancel }: ClientEditorProps) => {
    // The caller may hold a snapshot from when the editor opened; the tunnel state arrives
    // over the socket afterwards, so read it from the store instead of the prop.
    const live = useClientStore((s) => s.clients.find((c) => c.id === client.id)) ?? client;
    const isOutbound = live.connectionMode === 'outbound';

    // `useState` setters are referentially stable, so the cards can list them in an effect's
    // dependencies without re-running it on every render of this component.
    const [identityDirty, setIdentityDirty] = useState(false);
    const [tunnelDirty, setTunnelDirty] = useState(false);
    const dirty = identityDirty || (isOutbound && tunnelDirty);

    // Escape closes the editor — the same thing the bar's button does, no more. It
    // deliberately does not ask for confirmation when something is unsaved: closing has
    // always discarded silently, and quietly refusing to close would be worse than the
    // warning in the bar, which at least says what is at stake before the key is pressed.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            // Not while a select, a dialog or an autocomplete is using Escape for itself.
            if (e.defaultPrevented) return;
            onCancel();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onCancel]);

    return (
        <div className="space-y-6">
            <ClientIdentityCard
                client={live}
                onSave={onSave}
                onDirtyChange={setIdentityDirty}
            />
            {isOutbound && (
                <ClientTunnelCard
                    clientId={live.id}
                    state={live.tunnel}
                    onDirtyChange={setTunnelDirty}
                />
            )}

            {/* `sticky bottom-0` as the last child: its resting place is the end of the
                editor, so it sits there once the operator has scrolled all the way down —
                and floats at the bottom of the viewport for the whole way there. The page
                itself is the scroll container, so nothing above clips it. */}
            <div className="sticky bottom-0 z-10 flex items-center justify-end gap-4 rounded-lg border border-border bg-card px-7 py-4 shadow-lg">
                {dirty && (
                    <span className="mr-auto flex items-center gap-2 text-sm text-warning">
                        <AlertTriangle size={16} aria-hidden />
                        Unsaved changes — closing discards them
                    </span>
                )}
                <Button type="button" variant="secondary" onClick={onCancel} icon={X}>
                    Close
                </Button>
            </div>
        </div>
    );
};
