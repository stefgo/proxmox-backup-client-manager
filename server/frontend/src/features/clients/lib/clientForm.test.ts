import { describe, expect, it } from 'vitest';
import { CLIENT_STATUS, CONNECTION_MODE, ClientUpdateSchema, type Client } from '@pbcm/shared';
import { checkDraft, isSameDraft } from '../../../lib/entityForm';
import {
    clientDraftFrom,
    clientFieldOf,
    clientInputFrom,
    clientRules,
    significantClientDraft,
    storedClientDraft,
    type ClientDraft,
} from './clientForm';

const client = (changes: Partial<Client> = {}): Client => ({
    id: '11111111-1111-4111-8111-111111111111',
    hostname: 'backup-01',
    status: CLIENT_STATUS.ONLINE,
    lastSeen: '2026-10-03T08:00:00.000Z',
    connectionMode: CONNECTION_MODE.INBOUND,
    ...changes,
});

const check = (draft: ClientDraft, outbound: boolean) =>
    checkDraft(
        {
            schema: ClientUpdateSchema,
            toInput: (d: ClientDraft) => clientInputFrom(d, outbound),
            fieldOf: clientFieldOf,
            rules: (d) => clientRules(d, outbound),
        },
        draft,
    );

describe('clientDraftFrom', () => {
    it('ticks the restriction for a client that has an allowed address', () => {
        expect(clientDraftFrom(client({ inboundAllowedIp: '10.0.0.0/24' }))).toMatchObject({
            restrictIp: true,
            allowedIp: '10.0.0.0/24',
        });
    });

    it('leaves it unticked when the stored address is null', () => {
        expect(clientDraftFrom(client({ inboundAllowedIp: null }))).toMatchObject({ restrictIp: false, allowedIp: '' });
    });
});

describe('clientInputFrom', () => {
    const draft: ClientDraft = { displayName: ' Web ', targetAddress: ' 10.0.0.5 ', restrictIp: true, allowedIp: ' 10.0.0.5 ' };

    it('sends the allowed address and no target address for an inbound client', () => {
        expect(clientInputFrom(draft, false)).toEqual({
            displayName: 'Web',
            outboundTargetAddress: undefined,
            inboundAllowedIp: '10.0.0.5',
        });
    });

    it('sends null, not nothing, when the restriction is switched off', () => {
        expect(clientInputFrom({ ...draft, restrictIp: false }, false).inboundAllowedIp).toBeNull();
    });

    it('sends the target address and no allowed address for an outbound client', () => {
        expect(clientInputFrom(draft, true)).toEqual({
            displayName: 'Web',
            outboundTargetAddress: '10.0.0.5',
            inboundAllowedIp: undefined,
        });
    });
});

describe('significantClientDraft', () => {
    const base: ClientDraft = { displayName: '', targetAddress: '', restrictIp: false, allowedIp: '' };

    it('does not count an address left under an unticked box', () => {
        expect(
            isSameDraft(significantClientDraft({ ...base, allowedIp: '10.0.0.5' }, false), significantClientDraft(base, false)),
        ).toBe(true);
    });

    it('counts unticking the box, although the field is untouched', () => {
        const stored: ClientDraft = { ...base, restrictIp: true, allowedIp: '10.0.0.5' };
        expect(
            isSameDraft(significantClientDraft({ ...stored, restrictIp: false }, false), significantClientDraft(stored, false)),
        ).toBe(false);
    });

    it('does not count the inbound fields of an outbound client', () => {
        expect(
            isSameDraft(significantClientDraft({ ...base, restrictIp: true, allowedIp: 'x' }, true), significantClientDraft(base, true)),
        ).toBe(true);
    });
});

describe('the client draft, checked', () => {
    const inbound: ClientDraft = { displayName: 'Web', targetAddress: '', restrictIp: false, allowedIp: '' };
    const outbound: ClientDraft = { displayName: 'Web', targetAddress: '10.0.0.5:3001', restrictIp: false, allowedIp: '' };

    it('accepts an inbound client without a restriction', () => {
        expect(check(inbound, false).isValid).toBe(true);
    });

    it('accepts an empty display name: the hostname stands in for it', () => {
        expect(check({ ...inbound, displayName: '' }, false).isValid).toBe(true);
    });

    it('asks for an address once the box is ticked', () => {
        expect(check({ ...inbound, restrictIp: true }, false).errors).toEqual({
            allowedIp: 'Enter an address or a network, or untick the box above.',
        });
    });

    it('shows the schema\'s message at the allowed address when it is not IPv4 or CIDR', () => {
        expect(check({ ...inbound, restrictIp: true, allowedIp: 'fe80::1' }, false).errors).toEqual({
            allowedIp: 'Must be an IPv4 address or an IPv4 network in CIDR notation',
        });
    });

    it('ignores what is left in the field while the box is unticked', () => {
        expect(check({ ...inbound, allowedIp: 'nonsense' }, false).isValid).toBe(true);
    });

    it('asks an outbound client for its target address', () => {
        expect(check({ ...outbound, targetAddress: ' ' }, true).errors).toEqual({
            targetAddress: 'An outbound client needs the address the server dials.',
        });
    });

    it('shows the schema\'s message at the target address when it carries a path', () => {
        expect(check({ ...outbound, targetAddress: '10.0.0.5/ws' }, true).errors).toEqual({
            targetAddress: 'Must be a host or host:port, without scheme, path or credentials',
        });
    });
});

describe('storedClientDraft', () => {
    it('trims what the server stores trimmed, so the saved form is not dirty', () => {
        expect(storedClientDraft({ displayName: ' Web ', targetAddress: ' a:1 ', restrictIp: true, allowedIp: ' 10.0.0.5 ' })).toEqual({
            displayName: 'Web',
            targetAddress: 'a:1',
            restrictIp: true,
            allowedIp: '10.0.0.5',
        });
    });
});
