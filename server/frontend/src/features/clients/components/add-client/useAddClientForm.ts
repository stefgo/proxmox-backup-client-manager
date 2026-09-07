import { useState } from 'react';
import { Ipv4OrCidrSchema } from '@pbcm/shared';

export type ConnectionMode = 'inbound' | 'outbound';

export interface InboundForm {
    displayName: string;
    /** A single IPv4 address or a network in CIDR notation. Empty pins to the registering address. */
    allowedIp: string;
    /** Filled once the token has been issued; that this is set is what opens the token dialog. */
    token: string;
    expiresAt: string;
}

export interface OutboundForm {
    hostname: string;
    targetAddress: string;
    registrationSecret: string;
}

const EMPTY_INBOUND: InboundForm = {
    displayName: '',
    allowedIp: '',
    token: '',
    expiresAt: '',
};

const EMPTY_OUTBOUND: OutboundForm = {
    hostname: '',
    targetAddress: '',
    registrationSecret: '',
};

/** Empty is valid: without a pin the client is bound to the address it registers from. */
export const isAllowedIpValid = (value: string): boolean =>
    value.trim() === '' || Ipv4OrCidrSchema.safeParse(value.trim()).success;

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
