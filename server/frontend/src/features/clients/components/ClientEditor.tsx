import { Client, ClientUpdateSchema } from '@pbcm/shared';
import { X } from 'lucide-react';
import { ActionButton } from '@stefgo/react-ui-components';
import { useClient, type ClientUpdate } from '../../../queries/clients';
import { useEntityForm } from '../../../hooks/useEntityForm';
import { useUnsavedChangesGuard } from '../../../hooks/useUnsavedChangesGuard';
import {
    clientDraftFrom,
    clientFieldOf,
    clientInputFrom,
    clientRules,
    isOutbound,
    significantClientDraft,
    storedClientDraft,
    type ClientDraft,
} from '../lib/clientForm';
import { ClientIdentityCard } from './ClientIdentityCard';

interface ClientEditorProps {
    client: Client;
    /** Must reject on failure -- the card's footer is where the error is shown. */
    onSave: (id: string, data: ClientUpdate) => Promise<void>;
}

/**
 * Edits what a client *is*: its name and, for an outbound client, where the server dials it.
 * A page of its own, below the client's (`ROUTES.clientEdit`).
 *
 * The SSH tunnel is deliberately not here. It lives behind its own action in the client
 * list ({@link ClientTunnelEditor}) because it is a different resource with its own
 * endpoints and its own failure modes — and because it is not part of what a client is,
 * but of how a PBS is reached from it. Keeping the two apart also keeps this editor's save
 * button honest: it submits the one form it sits under and nothing else.
 *
 * Leaving is a navigation, and the control for it sits in the card's header — the one part
 * of the form that is in reach from every scroll position without a floating bar over the
 * content. Where it goes is the route tree's business: this editor sits below the client's
 * page, so that is where it closes onto, whichever surface opened it. Unsaved work is asked
 * about on every way out, by `useUnsavedChangesGuard`.
 *
 * The form is held here and not in the card, because this is where both of its readers
 * are: the card shows it, the guard asks about it.
 */
export const ClientEditor = ({ client, onSave }: ClientEditorProps) => {
    // The caller may hold a snapshot from when the editor opened; the tunnel state arrives
    // over the socket afterwards, so read it from the cache instead of the prop.
    const live = useClient(client.id) ?? client;

    // Fixed for the life of the page: a client does not change its connection mode.
    const outbound = isOutbound(client);
    const form = useEntityForm({
        schema: ClientUpdateSchema,
        initial: () => clientDraftFrom(client),
        toInput: (draft: ClientDraft) => clientInputFrom(draft, outbound),
        fieldOf: clientFieldOf,
        rules: (draft) => clientRules(draft, outbound),
        significant: (draft) => significantClientDraft(draft, outbound),
    });
    const { close } = useUnsavedChangesGuard(form.isDirty, 'client');

    return (
        <div className="space-y-6">
            <ClientIdentityCard
                client={live}
                form={form}
                onSubmit={() => form.submit((input) => onSave(client.id, input), { rebase: storedClientDraft })}
                action={<ActionButton icon={X} tooltip="Close" onClick={close} />}
            />
        </div>
    );
};
