import { Client, CONNECTION_MODE } from '@pbcm/shared';
import type { ConfirmOptions } from '@stefgo/react-ui-components';

/**
 * The history and the tunnel go with the row -- both tables reference clients(id)
 * ON DELETE CASCADE. What does not go is the agent: it runs its downloaded jobs from its
 * own database and keeps doing so offline, which is the part an operator does not expect
 * and therefore the part named first.
 */
export function describeDeleteClient(client: Client): ConfirmOptions {
    return {
        title: `Delete "${client.displayName || client.hostname}"?`,
        description:
            'Its entire job history is deleted with it, along with the SSH tunnel and the key stored for it. The agent on the host keeps the jobs it has already downloaded and goes on running them offline until it is uninstalled.' +
            (client.connectionMode === CONNECTION_MODE.OUTBOUND
                ? ' The connection mode cannot be changed, so bringing this host back means registering it again from scratch.'
                : ''),
        confirmLabel: 'Delete client',
        variant: 'danger'
    };
}

export function describeRemoveTunnel(): ConfirmOptions {
    return {
        title: 'Remove the SSH tunnel?',
        description: 'The stored key is deleted with it. Runs go directly to the PBS from then on — which fails for a host that has no route there. The client and its history stay.',
        confirmLabel: 'Remove tunnel',
        variant: 'danger'
    };
}

/**
 * Before a new registration token is issued for a client whose agent is registered. Nothing
 * changes yet -- the risk is in what comes next: the first agent that registers with the
 * token takes the client over, and the one connected now is cut off at that moment.
 */
export function describeReregister(client: Client): ConfirmOptions {
    return {
        title: `Register a new agent for "${client.displayName || client.hostname}"?`,
        description:
            'A new registration token is issued for this client. The agent connected now keeps working until an agent registers with the token; from then on only that agent is accepted, under the same client with its tunnel and history. Jobs live on the agent: a reinstalled one starts without them. Use this after reinstalling the agent or moving it to another host.',
        confirmLabel: 'Generate token',
    };
}
