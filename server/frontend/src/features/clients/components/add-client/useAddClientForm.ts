import { useState } from 'react';
import { Ipv4OrCidrSchema, ConnectionMode, normaliseTargetAddress } from '@pbcm/shared';

export interface InboundForm {
    /** Required: until the agent reports a hostname it is all the client is known by. */
    displayName: string;
    /** A single IPv4 address or a network in CIDR notation. Empty leaves the check off. */
    allowedIp: string;
}

export interface OutboundForm {
    hostname: string;
    targetAddress: string;
    /** The agent's setup PIN or its `PBCM_REGISTRATION_SECRET`, sent as `registrationSecret` either way. */
    registrationSecret: string;
}

const EMPTY_INBOUND: InboundForm = {
    displayName: '',
    allowedIp: '',
};

const EMPTY_OUTBOUND: OutboundForm = {
    hostname: '',
    targetAddress: '',
    registrationSecret: '',
};

/** Empty is valid: without a value the client is not checked against an address at all. */
export const isAllowedIpValid = (value: string): boolean =>
    value.trim() === '' || Ipv4OrCidrSchema.safeParse(value.trim()).success;

/**
 * Whether the inbound branch holds enough to create the client: a display name, because the
 * client exists before its agent reports a hostname, and an address the endpoint takes.
 */
export const isInboundComplete = (form: InboundForm): boolean =>
    form.displayName.trim() !== '' && isAllowedIpValid(form.allowedIp);

/**
 * Whether what has been typed so far is a usable target address. Empty counts as not yet
 * invalid -- an untouched field must not show an error -- and the same function the
 * endpoint applies decides it, so the wizard cannot accept what the server would refuse.
 */
export const isTargetAddressInvalid = (value: string): boolean =>
    value.trim() !== '' && normaliseTargetAddress(value) === null;

/**
 * The whole state of the add-client wizard, held above the steps.
 *
 * `Wizard` renders only the current step, so anything a step kept in its own
 * `useState` would be gone the moment the user went back. Inbound and outbound
 * are separate objects rather than one flat form: switching the connection mode
 * in step 1 and switching back must not cost the answers already given.
 */
export const useAddClientForm = () => {
    const [mode, setMode] = useState<ConnectionMode | null>(null);
    const [inbound, setInbound] = useState<InboundForm>(EMPTY_INBOUND);
    const [outbound, setOutbound] = useState<OutboundForm>(EMPTY_OUTBOUND);

    const patchInbound = (patch: Partial<InboundForm>) =>
        setInbound((prev) => ({ ...prev, ...patch }));

    const patchOutbound = (patch: Partial<OutboundForm>) =>
        setOutbound((prev) => ({ ...prev, ...patch }));

    return { mode, setMode, inbound, patchInbound, outbound, patchOutbound };
};
