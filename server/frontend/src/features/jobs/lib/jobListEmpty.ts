import { CLIENT_STATUS } from '@pbcm/shared';

/**
 * Why the job list across all clients is empty. The server knows a client's jobs only
 * while its agent is connected, so an empty list says "no jobs" only as far as the
 * clients that answered go.
 */
export type JobListEmpty =
    /** Every client is connected, or there is none: there really are no jobs. */
    | { kind: 'none' }
    /** No client is connected: nothing is known about any job. */
    | { kind: 'allOffline' }
    /** The connected clients have no jobs; `offline` others could not be asked. */
    | { kind: 'someOffline'; offline: number };

export function jobListEmpty(clients: readonly { status?: string | null }[]): JobListEmpty {
    const offline = clients.filter((c) => c.status !== CLIENT_STATUS.ONLINE).length;
    if (offline === 0) return { kind: 'none' };
    if (offline === clients.length) return { kind: 'allOffline' };
    return { kind: 'someOffline', offline };
}
