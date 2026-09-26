import {
    WS_EVENTS,
    WsMessage,
    AuthPayloadSchema,
    ConnectionMode,
} from "@pbcm/shared";
import { ProxyService } from "../../services/ProxyService.js";
import { ClientRepository } from "../../repositories/ClientRepository.js";
import { JobHistoryRepository } from "../../repositories/JobHistoryRepository.js";
import { type HeartbeatSocket } from "./Heartbeat.js";
import { routeAgentMessage, type AgentLogger } from "./AgentMessageRouter.js";

/**
 * How long an agent has to send its `AUTH` before the socket is dropped.
 *
 * Short on purpose: a peer that got this far has already presented its credentials,
 * so anything that does not follow up is a zombie connection.
 */
const AUTH_TIMEOUT_MS = 5000;

/** Why the handshake did not complete. The caller decides what that means on its side. */
export type AuthFailureReason =
    | "timeout"
    | "invalid-payload"
    | "unexpected-message";

export interface AgentSessionOptions {
    /** The client this socket belongs to -- already resolved by the caller. */
    clientId: string;
    socket: HeartbeatSocket;
    connectionMode: ConnectionMode;
    /**
     * The address the peer came in from, or null when the server dialed it. It decides
     * which row update runs: an outbound connection must not write `ip_address`, because
     * the only address involved is the one the server dialed, already stored as
     * `outbound_target_address`.
     */
    ip: string | null;
    /**
     * `fastify.log` on the inbound route, the shared logger on the outbound one. Both are
     * pino, and `AgentLogger` is what the message router already asks for, so the session
     * passes the very same object straight through to it.
     */
    log: AgentLogger;
    /**
     * Called on a successful handshake, before the row is updated. This is where the
     * outbound path creates the entry for a client connecting for the first time.
     */
    onAuthenticated?: (version: string | null) => void;
    /** Called once per failed handshake, with the reason it failed. */
    onAuthFailed?: (reason: AuthFailureReason) => void;
    /** Called after an authenticated connection has been torn down. */
    onClose?: () => void;
}

/**
 * Runs an agent connection from the `AUTH` handshake to the close.
 *
 * Both connection kinds used to carry their own copy of this: the same timeout, the same
 * Zod check, the same register/send/broadcast sequence and the same close block, once for
 * the agent that dials the server and once for the agent the server dials. Two copies of
 * a handshake is how the two quietly drift apart -- as these two had, at the point where
 * each decides whom to let in.
 *
 * Deliberately *not* in here:
 * - **The heartbeat.** The inbound route attaches it before its credential checks, so
 *   that a rejected connection loses its ping timer too; by the time a session starts,
 *   it is already running.
 * - **Everything before the handshake.** Credentials and address checks inbound, the
 *   auth-result and reconnect plumbing outbound. Those are what actually differ.
 */
export function attachAgentSession(options: AgentSessionOptions): void {
    const {
        clientId,
        socket,
        connectionMode,
        ip,
        log,
        onAuthenticated,
        onAuthFailed,
        onClose,
    } = options;

    let isAuthenticated = false;

    const authTimeout = setTimeout(() => {
        if (!isAuthenticated && socket.readyState === socket.OPEN) {
            log.warn({ msg: "Agent authentication timed out", clientId, ip });
            onAuthFailed?.("timeout");
            socket.close(4001, "Authentication timed out");
        }
    }, AUTH_TIMEOUT_MS);

    // The socket may close before the handshake ever runs -- a dial that is refused, an
    // error, a peer that goes away. The timer has to go either way.
    socket.on("close", () => clearTimeout(authTimeout));

    socket.on("message", (message: Buffer) => {
        try {
            const data = JSON.parse(message.toString()) as WsMessage;

            if (isAuthenticated) {
                void routeAgentMessage(clientId, socket, data, log);
                return;
            }

            if (data.type !== WS_EVENTS.AUTH) {
                onAuthFailed?.("unexpected-message");
                socket.close(4003, "Forbidden");
                return;
            }

            const parsed = AuthPayloadSchema.safeParse(data.payload);
            if (!parsed.success) {
                onAuthFailed?.("invalid-payload");
                socket.close(4000, "Invalid payload");
                return;
            }

            isAuthenticated = true;
            clearTimeout(authTimeout);

            const version = parsed.data.version || null;
            const timezone = parsed.data.timezone || null;

            onAuthenticated?.(version);
            // The address is recorded only here, past the allowed-address check the
            // inbound route ran before starting this session: the stored value is then
            // always one that was let in, which is what makes it a useful reference in
            // the client editor.
            if (ip === null) {
                ClientRepository.updateOutboundAuthSuccess(clientId, version, timezone);
            } else {
                ClientRepository.updateAuthSuccess(clientId, ip, version, timezone);
            }

            log.info({ msg: "Agent authenticated", clientId, connectionMode });
            ProxyService.registerClient(clientId, socket);

            // The agent resumes its history from here, so the handshake has to carry the
            // last run the server already holds.
            const lastSyncTime = JobHistoryRepository.findLatestSyncTime(clientId);
            socket.send(
                JSON.stringify({
                    type: WS_EVENTS.AUTH_SUCCESS,
                    payload: { lastSyncTime, historyAck: true },
                }),
            );
            ProxyService.broadcastClientUpdate();

            socket.on("close", () => {
                ClientRepository.updateLastSeen(clientId);
                ProxyService.unregisterClient(clientId, socket);
                log.info({ msg: "Agent disconnected", clientId, connectionMode });
                ProxyService.broadcastClientUpdate();
                onClose?.();
            });
        } catch (err) {
            log.error({ msg: "Error processing agent message", clientId, err });
        }
    });
}
