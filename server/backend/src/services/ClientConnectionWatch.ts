import { randomUUID } from "crypto";
import { clientDisconnectedEvent, clientReconnectedEvent } from "@pbcm/shared";
import { WebhookService } from "./WebhookService.js";

/**
 * How long an agent may be gone before that is reported. The agent retries after 5 s,
 * 10 s, 30 s and then every 60 s, so a dropped connection, a restart or a self-update is
 * back well within it; what is still gone after two minutes is worth a message.
 */
const DISCONNECT_GRACE_MS = 120_000;

interface Away {
    disconnectedAt: string;
    /** Pending while the grace period runs; null once the disconnect has been reported. */
    timer: NodeJS.Timeout | null;
}

/**
 * Reports agents that went away and came back -- the one kind of event no agent can report
 * itself. `client.disconnected` once a connection has stayed closed past the grace period,
 * `client.reconnected` when it is back, and only after a reported disconnect: a reconnect
 * nobody was told about needs no all-clear.
 *
 * The state is in memory. After a server restart nothing is known to be away: an agent
 * that never reconnects then is not reported, and one that does reconnect gets no
 * `client.reconnected`.
 */
export class ClientConnectionWatch {
    private static away = new Map<string, Away>();

    /** The agent's current connection closed -- not one replaced by a newer connection. */
    static disconnected(clientId: string): void {
        const previous = this.away.get(clientId);
        // Already reported, and closed again before anything reopened it: nothing new.
        if (previous?.timer === null) return;
        if (previous?.timer) clearTimeout(previous.timer);

        const disconnectedAt = new Date().toISOString();
        const timer = setTimeout(() => {
            const entry = this.away.get(clientId);
            if (!entry || entry.timer !== timer) return;
            entry.timer = null;
            WebhookService.dispatch(clientId, [
                clientDisconnectedEvent(randomUUID(), clientId, disconnectedAt, new Date().toISOString()),
            ]);
        }, DISCONNECT_GRACE_MS);
        // A pending report must not keep the process alive on shutdown.
        timer.unref();
        this.away.set(clientId, { disconnectedAt, timer });
    }

    /** The agent authenticated on a new connection. */
    static connected(clientId: string): void {
        const entry = this.away.get(clientId);
        if (!entry) return;
        this.away.delete(clientId);
        if (entry.timer) {
            clearTimeout(entry.timer);
            return;
        }
        WebhookService.dispatch(clientId, [
            clientReconnectedEvent(randomUUID(), clientId, entry.disconnectedAt, new Date().toISOString()),
        ]);
    }

    /** The client was deleted: whatever was pending for it is moot. */
    static forget(clientId: string): void {
        const entry = this.away.get(clientId);
        if (entry?.timer) clearTimeout(entry.timer);
        this.away.delete(clientId);
    }
}
