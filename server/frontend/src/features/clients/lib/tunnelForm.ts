import { TunnelCreateSchema, TunnelUpdateSchema, type TunnelInfo } from '@pbcm/shared';
import type { z } from 'zod';
import type { FieldErrors, FieldOf } from '../../../lib/entityForm';

/** Where the key the request carries comes from: the stored one, a generated one, a pasted one. */
export type SshKeyMode = 'keep' | 'generate' | 'manual';

/** The tunnel card's fields, as typed. */
export interface TunnelDraft {
    sshHost: string;
    /** Text, like the field: an empty one is the default port. */
    sshPort: string;
    sshUser: string;
    keyMode: SshKeyMode;
    /** Write-only: the stored key never leaves the backend, so this is only ever a new one. */
    privateKey: string;
    passphrase: string;
}

const DEFAULT_SSH_PORT = 22;

/**
 * What a new tunnel can be checked against before the host has answered: everything the
 * create request carries except the host key, which the test that precedes it measures.
 */
export const NewTunnelSchema = TunnelCreateSchema.omit({ hostKeySha256: true });

export type NewTunnelInput = z.input<typeof NewTunnelSchema>;
export type TunnelUpdateInput = z.input<typeof TunnelUpdateSchema>;

/** The draft of the stored credentials, or the setup form a client without a tunnel gets. */
export function tunnelDraftFrom(info: TunnelInfo | null): TunnelDraft {
    return {
        sshHost: info?.sshHost ?? '',
        sshPort: String(info?.sshPort ?? DEFAULT_SSH_PORT),
        sshUser: info?.sshUser ?? '',
        // A stored tunnel keeps its key unless told otherwise; a new one has none to keep.
        keyMode: info ? 'keep' : 'generate',
        privateKey: '',
        passphrase: '',
    };
}

/** The port as a number. Empty is the default; anything else that is no number is `NaN`. */
export function sshPortFrom(text: string): number {
    return text.trim() === '' ? DEFAULT_SSH_PORT : Number(text);
}

/** Whether the draft brings a key of its own, rather than relying on the stored one. */
export const carriesNewKey = (draft: TunnelDraft) => draft.keyMode !== 'keep' && !!draft.privateKey.trim();

/** Only a pasted key can have one: a generated key is made without. */
const passphraseOf = (draft: TunnelDraft) =>
    draft.keyMode === 'manual' && draft.passphrase ? draft.passphrase : undefined;

/** The credentials of a tunnel that does not exist yet, as the test and the create take them. */
export function newTunnelInputFrom(draft: TunnelDraft): NewTunnelInput {
    return {
        sshHost: draft.sshHost,
        sshPort: sshPortFrom(draft.sshPort),
        sshUser: draft.sshUser,
        privateKey: draft.privateKey.trim(),
        passphrase: passphraseOf(draft),
    };
}

/**
 * The draft as `PUT /api/v1/clients/:id/tunnel` takes it. The key is in it only when a new
 * one was entered -- an absent key leaves the stored one alone -- and then the passphrase
 * goes with it, as `null` when the new key has none: that clears the stored one.
 */
export function tunnelUpdateInputFrom(draft: TunnelDraft): TunnelUpdateInput {
    const address = { sshHost: draft.sshHost, sshPort: sshPortFrom(draft.sshPort), sshUser: draft.sshUser };
    if (!carriesNewKey(draft)) return address;
    return { ...address, privateKey: draft.privateKey.trim(), passphrase: passphraseOf(draft) ?? null };
}

/**
 * What counts as a change. Switching the key mode alone is none, and neither is a
 * passphrase without a key: nothing of either is sent.
 */
export function significantTunnelDraft(draft: TunnelDraft) {
    return {
        sshHost: draft.sshHost,
        sshPort: draft.sshPort,
        sshUser: draft.sshUser,
        privateKey: carriesNewKey(draft) ? draft.privateKey.trim() : '',
    };
}

/** What the schema says in terms nobody typed, and what only a setup form requires. */
export function tunnelRules(draft: TunnelDraft, isNew: boolean): FieldErrors<TunnelDraft> {
    const errors: FieldErrors<TunnelDraft> = {};
    if (!draft.sshHost.trim()) errors.sshHost = 'Enter the host the server connects to.';
    if (!draft.sshUser.trim()) errors.sshUser = 'Enter the user the server logs in as.';
    const port = sshPortFrom(draft.sshPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) errors.sshPort = 'A port between 1 and 65535.';
    if (isNew && !draft.privateKey.trim()) {
        errors.privateKey = draft.keyMode === 'manual' ? 'Paste the private key.' : 'Generate a key pair first.';
    }
    return errors;
}

export const tunnelFieldOf: FieldOf<TunnelDraft> = (path) => {
    switch (path[0]) {
        case 'sshHost':
        case 'sshPort':
        case 'sshUser':
        case 'privateKey':
        case 'passphrase':
            return path[0];
        default:
            return null;
    }
};

/** Stored, the key is the one to keep, and the field that carried it is empty again. */
export function storedTunnelDraft(draft: TunnelDraft): TunnelDraft {
    return { ...draft, keyMode: 'keep', privateKey: '', passphrase: '' };
}
