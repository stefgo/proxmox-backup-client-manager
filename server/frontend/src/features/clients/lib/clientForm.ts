import { CONNECTION_MODE, ClientUpdateSchema, type Client } from '@pbcm/shared';
import type { z } from 'zod';
import type { FieldErrors, FieldOf } from '../../../lib/entityForm';

/** The client editor's fields, as typed. */
export interface ClientDraft {
    displayName: string;
    /** Outbound clients only: where the server dials the agent. */
    targetAddress: string;
    /** Inbound clients only: whether connections are checked against `allowedIp`. */
    restrictIp: boolean;
    allowedIp: string;
}

export type ClientUpdateInput = z.input<typeof ClientUpdateSchema>;

export const isOutbound = (client: Pick<Client, 'connectionMode'>) =>
    client.connectionMode === CONNECTION_MODE.OUTBOUND;

export function clientDraftFrom(client: Client): ClientDraft {
    return {
        displayName: client.displayName || '',
        targetAddress: client.outboundTargetAddress || '',
        restrictIp: !!client.inboundAllowedIp,
        allowedIp: client.inboundAllowedIp || '',
    };
}

/**
 * The draft as `PUT /api/v1/clients/:id` takes it. Which address is sent follows from the
 * connection mode: the backend rejects a target address for an inbound client and an
 * allowed address for an outbound one.
 */
export function clientInputFrom(draft: ClientDraft, outbound: boolean): ClientUpdateInput {
    return {
        displayName: draft.displayName.trim(),
        outboundTargetAddress: outbound ? draft.targetAddress.trim() : undefined,
        // `null` is not "unchanged" here but "switch the check off" -- only the absent
        // key leaves the stored value alone.
        inboundAllowedIp: outbound ? undefined : draft.restrictIp ? draft.allowedIp.trim() : null,
    };
}

/**
 * What of the draft is sent at all, and so what counts as a change. Turning the
 * restriction off is a change in its own right; the address left in the field under an
 * unticked box is not.
 */
export function significantClientDraft(draft: ClientDraft, outbound: boolean): Partial<ClientDraft> {
    if (outbound) return { displayName: draft.displayName, targetAddress: draft.targetAddress };
    return {
        displayName: draft.displayName,
        restrictIp: draft.restrictIp,
        allowedIp: draft.restrictIp ? draft.allowedIp : '',
    };
}

/** What the schema cannot say: which of the two addresses this client has to have. */
export function clientRules(draft: ClientDraft, outbound: boolean): FieldErrors<ClientDraft> {
    if (outbound) {
        return draft.targetAddress.trim() ? {} : { targetAddress: 'An outbound client needs the address the server dials.' };
    }
    // Required only while the box is ticked: that is what ticking it means.
    return draft.restrictIp && !draft.allowedIp.trim()
        ? { allowedIp: 'Enter an address or a network, or untick the box above.' }
        : {};
}

export const clientFieldOf: FieldOf<ClientDraft> = (path) => {
    switch (path[0]) {
        case 'displayName':
            return 'displayName';
        case 'outboundTargetAddress':
            return 'targetAddress';
        case 'inboundAllowedIp':
            return 'allowedIp';
        default:
            return null;
    }
};

/** What the form holds once it is stored: the server keeps the trimmed values. */
export function storedClientDraft(draft: ClientDraft): ClientDraft {
    return {
        ...draft,
        displayName: draft.displayName.trim(),
        targetAddress: draft.targetAddress.trim(),
        allowedIp: draft.allowedIp.trim(),
    };
}
