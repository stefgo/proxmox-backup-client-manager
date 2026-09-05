import { useState } from 'react';
import { Ipv4OrCidrSchema } from '@pbcm/shared';
import { SshKeyMode } from '../SshKeyFields';

export type ConnectionMode = 'inbound' | 'outbound';

export interface TunnelTestResult {
    ok: boolean;
    hostKeySha256?: string;
    boundPort?: number;
    error?: string;
}

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
    /**
     * Whether the server should reach the PBS through an SSH reverse tunnel to this
     * host. Optional and independent of the connection mode — an outbound client that
     * can reach the PBS itself needs none, and it can still be added later in the
     * client editor.
     */
    useTunnel: boolean;
    sshHost: string;
    sshPort: string;
    sshUser: string;
    keyMode: SshKeyMode;
    privateKey: string;
    passphrase: string;
    /** The last tunnel test's outcome — kept only to report a failed attempt. */
    test: TunnelTestResult | null;
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
    useTunnel: true,
    sshHost: '',
    sshPort: '22',
    sshUser: '',
    keyMode: 'generate',
    privateKey: '',
    passphrase: '',
    test: null,
};

/**
 * Changing any of these clears the last tunnel test's outcome.
 *
 * The test result is only ever shown as a report on the fields as they stood
 * when it ran; leaving a green result under an edited host would claim a
 * connection nobody made. The pinned fingerprint itself never comes from here —
 * "Test & Create" tests and creates in one go and uses that run's own answer.
 */
const SSH_FIELDS: (keyof OutboundForm)[] = [
    'useTunnel',
    'sshHost',
    'sshPort',
    'sshUser',
    'keyMode',
    'privateKey',
    'passphrase',
];

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
        setOutbound((prev) => {
            const touchesSsh = SSH_FIELDS.some((field) => field in patch);
            return {
                ...prev,
                ...patch,
                ...(touchesSsh ? { test: null } : {}),
            };
        });

    return { mode, setMode, inbound, patchInbound, outbound, patchOutbound };
};
