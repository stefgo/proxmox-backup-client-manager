import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Client } from '@pbcm/shared';
import { X } from 'lucide-react';
import { ActionButton, ConfirmDialog } from '@stefgo/react-ui-components';
import { useClientStore } from '../../../stores/useClientStore';
import { ClientTunnelCard } from './ClientTunnelCard';

interface ClientTunnelEditorProps {
    client: Client;
}

/**
 * Sets up, changes or removes a client's SSH reverse tunnel — a page at
 * `/client/:clientId/tunnel`, reached from the client list for a client of either
 * connection mode.
 *
 * Its own surface rather than a card inside the client editor, because it answers its own
 * question. The client editor is about what the client *is*; this is about how the PBS is
 * reached from it, a decision that is made long after the client exists, revisited when a
 * host is reinstalled, and taken back when a route opens up. Giving it one entry point in
 * the list — "Add" or "Edit", depending on whether credentials are stored — says that in
 * the one place where the operator is looking at clients.
 *
 * The work is all in `ClientTunnelCard`; what this adds is the way out, handed to the card
 * so it lands in its header. The card ends with a key field and a host setup snippet, and
 * the header is the only place that stays reachable across all of it.
 */
export const ClientTunnelEditor = ({ client }: ClientTunnelEditorProps) => {
    const navigate = useNavigate();
    const location = useLocation();
    // A directly opened URL carries no state — the list is the honest fallback, since it
    // is the surface this client is guaranteed to appear on.
    const back = (location.state as { from?: string } | null)?.from ?? '/clients';

    // The caller holds a snapshot from when the editor opened; the tunnel state arrives
    // over the socket afterwards, so read it from the store instead of the prop.
    const live = useClientStore((s) => s.clients.find((c) => c.id === client.id)) ?? client;
    // Whether a tunnel exists is part of the client row (`tunnelConfigured`), and the
    // list's action label reads it — so leaving refetches.
    const fetchClients = useClientStore((s) => s.fetchClients);
    const [dirty, setDirty] = useState(false);
    const [confirmDiscard, setConfirmDiscard] = useState(false);

    const leave = useCallback(() => {
        fetchClients();
        navigate(back);
    }, [fetchClients, navigate, back]);

    /**
     * Leaving used to discard silently under a warning label. It asks now: a half-pasted
     * private key is the kind of thing that is not retyped from memory, and the exit sits
     * in the header, far from the field it would throw away.
     */
    const requestClose = useCallback(() => {
        if (dirty) {
            setConfirmDiscard(true);
            return;
        }
        leave();
    }, [dirty, leave]);

    // Escape does exactly what the header's button does — including asking first.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            // Not while a select, a dialog or an autocomplete is using Escape for itself —
            // this includes the discard dialog below, which closes on its own Escape.
            if (e.defaultPrevented) return;
            requestClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [requestClose]);

    return (
        <div className="space-y-6">
            <div className="px-1">
                <h2 className="text-xl font-bold text-text-primary">SSH Reverse Tunnel</h2>
                <p className="text-sm text-text-muted mt-1">
                    {live.displayName || live.hostname}
                    <span className="font-mono text-xs ml-2 opacity-70">{live.id}</span>
                </p>
            </div>

            <ClientTunnelCard
                clientId={live.id}
                state={live.tunnel}
                onDirtyChange={setDirty}
                action={<ActionButton icon={X} tooltip="Close" onClick={requestClose} />}
            />

            <ConfirmDialog
                isOpen={confirmDiscard}
                onClose={() => setConfirmDiscard(false)}
                onConfirm={leave}
                title="Discard your changes?"
                description="The tunnel credentials have not been saved. Leaving now keeps the stored ones — or none, if there were none."
                confirmLabel="Discard"
                cancelLabel="Keep editing"
                variant="danger"
            />
        </div>
    );
};
