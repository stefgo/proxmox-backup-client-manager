import { describe, expect, it } from 'vitest';
import { TunnelUpdateSchema, type TunnelInfo } from '@pbcm/shared';
import { checkDraft, isSameDraft } from '../../../lib/entityForm';
import {
    NewTunnelSchema,
    newTunnelInputFrom,
    significantTunnelDraft,
    sshPortFrom,
    storedTunnelDraft,
    tunnelDraftFrom,
    tunnelFieldOf,
    tunnelRules,
    tunnelUpdateInputFrom,
    type TunnelDraft,
} from './tunnelForm';

const info: TunnelInfo = {
    sshHost: 'backup-01.example.com',
    sshPort: 2222,
    sshUser: 'tunnel',
    hostKeySha256: 'SHA256:abc',
    remoteBindHost: '127.0.0.1',
};

const stored = tunnelDraftFrom(info);
const KEY = '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----';

const checkNew = (draft: TunnelDraft) =>
    checkDraft(
        { schema: NewTunnelSchema, toInput: newTunnelInputFrom, fieldOf: tunnelFieldOf, rules: (d: TunnelDraft) => tunnelRules(d, true) },
        draft,
    );
const checkStored = (draft: TunnelDraft) =>
    checkDraft(
        { schema: TunnelUpdateSchema, toInput: tunnelUpdateInputFrom, fieldOf: tunnelFieldOf, rules: (d: TunnelDraft) => tunnelRules(d, false) },
        draft,
    );

describe('tunnelDraftFrom', () => {
    it('keeps the stored key of a tunnel that exists', () => {
        expect(stored).toEqual({
            sshHost: 'backup-01.example.com',
            sshPort: '2222',
            sshUser: 'tunnel',
            keyMode: 'keep',
            privateKey: '',
            passphrase: '',
        });
    });

    it('starts a setup form on the default port, with a key to generate', () => {
        expect(tunnelDraftFrom(null)).toMatchObject({ sshPort: '22', keyMode: 'generate' });
    });
});

describe('sshPortFrom', () => {
    it('takes an empty field for the default port', () => {
        expect(sshPortFrom('  ')).toBe(22);
    });

    it('does not turn text into the default port', () => {
        expect(sshPortFrom('ssh')).toBeNaN();
    });
});

describe('tunnelUpdateInputFrom', () => {
    it('leaves the key out while the stored one is kept', () => {
        expect(tunnelUpdateInputFrom({ ...stored, sshHost: 'other' })).toEqual({
            sshHost: 'other',
            sshPort: 2222,
            sshUser: 'tunnel',
        });
    });

    it('leaves the key out when the mode was switched but no key entered', () => {
        expect(tunnelUpdateInputFrom({ ...stored, keyMode: 'manual', passphrase: 'pw' })).not.toHaveProperty('privateKey');
    });

    it('sends null as the passphrase of a generated key, which clears the stored one', () => {
        expect(tunnelUpdateInputFrom({ ...stored, keyMode: 'generate', privateKey: KEY })).toMatchObject({
            privateKey: KEY,
            passphrase: null,
        });
    });

    it('sends the passphrase of a pasted key', () => {
        expect(tunnelUpdateInputFrom({ ...stored, keyMode: 'manual', privateKey: KEY, passphrase: 'pw' }).passphrase).toBe('pw');
    });
});

describe('newTunnelInputFrom', () => {
    it('sends no passphrase with a generated key, whatever is left in the field', () => {
        const input = newTunnelInputFrom({ ...tunnelDraftFrom(null), privateKey: KEY, passphrase: 'left over' });
        expect(input.passphrase).toBeUndefined();
    });
});

describe('significantTunnelDraft', () => {
    it('does not count a key mode switched without a key', () => {
        expect(isSameDraft(significantTunnelDraft({ ...stored, keyMode: 'manual' }), significantTunnelDraft(stored))).toBe(true);
    });

    it('does not count a passphrase without a key', () => {
        expect(
            isSameDraft(significantTunnelDraft({ ...stored, keyMode: 'manual', passphrase: 'pw' }), significantTunnelDraft(stored)),
        ).toBe(true);
    });

    it('counts a pasted key', () => {
        expect(
            isSameDraft(significantTunnelDraft({ ...stored, keyMode: 'manual', privateKey: KEY }), significantTunnelDraft(stored)),
        ).toBe(false);
    });
});

describe('the tunnel draft, checked', () => {
    it('accepts stored credentials as they are', () => {
        expect(checkStored(stored).isValid).toBe(true);
    });

    it('asks a setup form for host, user and key', () => {
        expect(checkNew(tunnelDraftFrom(null)).errors).toEqual({
            sshHost: 'Enter the host the server connects to.',
            sshUser: 'Enter the user the server logs in as.',
            privateKey: 'Generate a key pair first.',
        });
    });

    it('asks for a pasted key in the words of that mode', () => {
        expect(checkNew({ ...tunnelDraftFrom(null), keyMode: 'manual' }).errors.privateKey).toBe('Paste the private key.');
    });

    it('does not ask a stored tunnel for a key: the stored one is kept', () => {
        expect(checkStored({ ...stored, keyMode: 'manual' }).isValid).toBe(true);
    });

    it('refuses a port that is no port instead of falling back to 22', () => {
        expect(checkStored({ ...stored, sshPort: 'ssh' }).errors).toEqual({ sshPort: 'A port between 1 and 65535.' });
        expect(checkStored({ ...stored, sshPort: '70000' }).errors).toEqual({ sshPort: 'A port between 1 and 65535.' });
        expect(checkStored({ ...stored, sshPort: '22.5' }).errors).toEqual({ sshPort: 'A port between 1 and 65535.' });
    });

    it('accepts a complete setup form', () => {
        expect(checkNew({ ...tunnelDraftFrom(null), sshHost: 'h', sshUser: 'u', privateKey: KEY }).isValid).toBe(true);
    });
});

describe('storedTunnelDraft', () => {
    it('goes back to keeping the key, with the key field empty', () => {
        expect(storedTunnelDraft({ ...stored, keyMode: 'manual', privateKey: KEY, passphrase: 'pw' })).toEqual(stored);
    });
});
