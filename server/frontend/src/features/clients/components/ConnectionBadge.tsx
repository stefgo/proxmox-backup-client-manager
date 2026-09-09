import { Network } from 'lucide-react';
import { Client } from '@pbcm/shared';

/**
 * Whether a tunnel is available to this client's jobs — worth showing at a glance, and
 * keyed on the tunnel rather than the connection mode: either mode can have one. Which
 * jobs take it is per job and not something a client row can answer.
 *
 * Shared by the client list and the detail header rather than built twice: the two show
 * the same fact, and a second hand-built badge is how they start disagreeing about what
 * "up" looks like.
 */
export const ConnectionBadge = ({ client }: { client: Client }) => {
    if (!client.tunnelConfigured) return null;
    const tunnel = client.tunnel;
    const tone = tunnel?.status === 'error'
        ? 'text-error'
        : tunnel?.status === 'up'
            ? 'text-success'
            : 'text-text-muted';
    return (
        <span className={`inline-flex items-center gap-1 text-xs ${tone}`} title={tunnel?.lastError || undefined}>
            <Network size={12} />
            Tunnel
            {tunnel?.activeLeases ? ` (${tunnel.activeLeases})` : ''}
        </span>
    );
};
