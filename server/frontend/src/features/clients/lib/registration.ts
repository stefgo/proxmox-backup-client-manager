import { CONNECTION_MODE, type Client } from '@pbcm/shared';
import { formatDate } from '../../../utils';
import { parseTimestamp } from '../../../lib/time';

/**
 * Whether an inbound client still waits for its first agent. It is created when its token
 * is issued and has been seen by nobody since; an outbound client is only stored once the
 * server has reached its agent, so it never waits.
 */
export const awaitsRegistration = (client: Pick<Client, 'connectionMode' | 'lastSeen'>): boolean =>
    client.connectionMode !== CONNECTION_MODE.OUTBOUND && !client.lastSeen;

/** Where a client's registration token stands: none open, valid, or run out. */
export type RegistrationTokenState = 'none' | 'open' | 'expired';

export function registrationTokenState(
    expiresAt: string | null | undefined,
    now: number = Date.now(),
): RegistrationTokenState {
    const at = parseTimestamp(expiresAt);
    if (!at) return 'none';
    return at.getTime() > now ? 'open' : 'expired';
}

/** What the page of a waiting client says above its tabs. */
export interface RegistrationNotice {
    title: string;
    lines: string[];
}

/**
 * That the client waits, and whether the token issued for it can still register the agent.
 * Jobs live on the agent, so they wait for it; the tunnel is the server's and can be set up
 * meanwhile.
 */
export function registrationNotice(
    { registrationExpiresAt }: Pick<Client, 'registrationExpiresAt'>,
    now: number = Date.now(),
    locale?: string,
): RegistrationNotice {
    const state = registrationTokenState(registrationExpiresAt, now);
    const until = registrationExpiresAt ? formatDate(registrationExpiresAt, locale) : '';
    return {
        title: 'This client is waiting for its agent',
        lines: [
            state === 'open'
                ? `Register the agent with the token issued for this client. The token is valid until ${until}.`
                : state === 'expired'
                  ? `The token issued for this client expired on ${until}. Generate a new one to register the agent.`
                  : 'Generate a token to register the agent.',
            'Jobs can be set up once the agent is connected; an SSH tunnel can be added already.',
        ],
    };
}
