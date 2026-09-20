import { FastifyInstance, FastifyRequest } from "fastify";
import {
    WS_EVENTS,
    CONNECTION_MODE,
    isIpAllowed,
    isIpInNetworks,
} from "@pbcm/shared";
import { ProxyService } from "../services/ProxyService.js";
import { appConfig } from "../config/AppConfig.js";
import { logger } from "@pbcm/shared/node";
import { ClientRepository } from "../repositories/ClientRepository.js";
import { SESSION_COOKIE } from "../services/SessionCookie.js";
import { attachHeartbeat, type HeartbeatSocket } from "./websocket/Heartbeat.js";
import { attachAgentSession } from "./websocket/AgentSession.js";

/** What an agent presents when it dials in: the identity the server issued it. */
export type AgentQuery = { token?: string; clientId?: string };

/** The agent route's request, with its query string named rather than read out of `any`. */
type AgentRequest = FastifyRequest<{ Querystring: AgentQuery }>;

/**
 * The WebSocket entry points, and nothing else.
 *
 * This file used to be 769 lines and did three jobs: the two handshakes, the message
 * routing, and the tunnel-lease authorisation. The latter two now live next door under
 * `websocket/` — see AgentMessageRouter.ts and TunnelLease.ts. What stays here is what
 * `index.ts` and `ClientConnector` actually call.
 */
export class WebSocketController {
    static async handleDashboardConnection(
        socket: HeartbeatSocket,
        req: FastifyRequest,
        fastify: FastifyInstance,
    ) {
        // Attached before the auth checks below: those close the socket and return early,
        // and attachHeartbeat registers the close handler that clears the interval.
        attachHeartbeat(socket);

        // Read from the cookie, which the browser attaches to the WebSocket handshake by
        // itself. It used to arrive as ?token=<JWT> — the browser WebSocket API cannot
        // set headers, so the query string was the only place a bearer token could go,
        // and it landed in every proxy and server access log along the way.
        const token = req.cookies?.[SESSION_COOKIE];
        if (!token) {
            socket.close(4001, "Unauthorized");
            return;
        }

        try {
            fastify.jwt.verify(token);
        } catch {
            socket.close(4001, "Invalid Token");
            return;
        }

        ProxyService.addDashboardClient(socket);

        // Send initial state
        const clients = ProxyService.getClientsWithStatus();
        socket.send(
            JSON.stringify({ type: "CLIENTS_UPDATE", payload: clients }),
        );

        socket.on("close", () => {
            ProxyService.removeDashboardClient(socket);
        });
    }

    static async handleAgentConnection(
        socket: HeartbeatSocket,
        req: AgentRequest,
        fastify: FastifyInstance,
    ) {
        // Correctly handle IP address with trustProxy (configured in Fastify)
        const clientIp = req.ip;
        fastify.log.info({ msg: "Client connected", ip: clientIp });

        // Read by the timeout log below, which fires long after this line: null while the
        // peer is still anonymous, the resolved id once the credentials below named a row.
        let clientId: string | null = null;
        attachHeartbeat(socket, () =>
            fastify.log.warn({
                msg: "Agent client connection timed out (no pong). Terminating.",
                ip: clientIp,
                clientId,
            }),
        );

        // AUTHENTICATION LOGIC (Identity + IP)
        // 1. Extract the identity: query params first, then Authorization header.
        // WebSocket connections from browser usually use query params?token=..., agents might use Headers.
        const query = req.query;
        let token = query.token;
        if (!token && req.headers["authorization"]) {
            const parts = req.headers["authorization"].split(" ");
            if (parts.length === 2 && parts[0] === "Bearer") {
                token = parts[1];
            }
        }
        const presentedId = query.clientId;

        if (!token || !presentedId) {
            fastify.log.warn({
                msg: "Client connected without a complete identity",
                ip: clientIp,
            });
            socket.close(4001, "Authentication required");
            return;
        }

        // Both halves have to name the same row. An agent that predates the issued
        // identity sends no clientId and lands in the branch above -- it has to be
        // registered again, which is what the release notes say.
        const client = ClientRepository.findByIdAndToken(presentedId, token);

        if (!client) {
            fastify.log.warn({
                msg: "Invalid credentials used",
                ip: clientIp,
                clientId: presentedId,
            });
            socket.close(4003, "Invalid credentials");
            return;
        }

        // Global Security Check: Allowed Networks
        const allowedNetworks = appConfig.security?.allowed_networks || [];
        if (!isIpInNetworks(clientIp, allowedNetworks, true)) {
            fastify.log.warn({
                msg: "Connection denied: IP not in allowed networks",
                ip: clientIp,
            });
            socket.close(4003, "Access denied");
            return;
        }

        // An outbound client is dialed by the server and never connects here. Refused
        // explicitly: its auth token has no allowed address, and with null meaning "check
        // switched off" that token would otherwise be accepted from anywhere. Skipping
        // the check for it, as this used to, left exactly that hole open.
        if (client.connection_mode === CONNECTION_MODE.OUTBOUND) {
            fastify.log.warn({
                msg: "Outbound client tried to connect inbound",
                ip: clientIp,
                clientId: client.id,
            });
            socket.close(4003, "Access denied");
            return;
        }

        if (!isIpAllowed(clientIp, client.inbound_allowed_ip)) {
            fastify.log.warn({
                msg: "IP mismatch for client",
                expected: client.inbound_allowed_ip,
                actual: clientIp,
                clientId: client.id,
            });
            socket.close(4003, "IP address mismatch");
            return;
        }

        clientId = client.id;

        // From here the connection is an ordinary agent session: the agent sends
        // { type: 'AUTH' } as its first message, and everything after that is the same
        // in both directions.
        attachAgentSession({
            clientId,
            socket,
            connectionMode: CONNECTION_MODE.INBOUND,
            ip: clientIp,
            log: fastify.log,
            // The agent is told it was turned away only when it sent something other than
            // AUTH: a malformed AUTH payload gets the close code alone, which is what
            // names the problem. An unexpected first message is the case where the peer
            // may simply be out of step with the handshake.
            onAuthFailed: (reason) => {
                if (reason === "unexpected-message") {
                    socket.send(
                        JSON.stringify({
                            type: WS_EVENTS.AUTH_FAILURE,
                            payload: {},
                        }),
                    );
                }
            },
        });
    }

    /**
     * Handles a connection the server opened itself (outbound mode). Same AUTH handshake
     * as inbound, but without the IP check: the server chose the peer, so there is no
     * remote address to pin.
     */
    static handleOutboundAgentConnection(
        clientId: string,
        socket: HeartbeatSocket,
        onClose: () => void,
        onAuthResult?: (success: boolean) => void,
        onPersist?: (version: string | null) => void,
    ): void {
        logger.info(
            { clientId },
            "Outbound agent connection established, awaiting AUTH",
        );

        attachHeartbeat(socket);

        // Ensures onAuthResult is called exactly once regardless of failure mode.
        let authResultSent = false;
        const notifyAuthResult = (success: boolean) => {
            if (!authResultSent) {
                authResultSent = true;
                onAuthResult?.(success);
            }
        };

        attachAgentSession({
            clientId,
            socket,
            connectionMode: CONNECTION_MODE.OUTBOUND,
            // No address to record: the server dialed this agent, so the only address
            // involved is the one it was dialed at, already stored as
            // outbound_target_address.
            ip: null,
            log: logger,
            onAuthenticated: (version) => {
                // For a brand new client this creates the DB rows; for reconnects the
                // rows already exist and the session's own update refreshes them.
                onPersist?.(version);
                notifyAuthResult(true);
            },
            onAuthFailed: () => notifyAuthResult(false),
            onClose,
        });

        // Covers all remaining failure paths: socket closed before AUTH completed, or
        // after an error -- notifyAuthResult is a no-op if already called. onClose now
        // runs only once a session was established: a close before that leaves no client
        // row behind in the registration path, and connectClient schedules its own
        // reconnect when the handshake fails.
        socket.on("close", () => {
            notifyAuthResult(false);
        });

        socket.on("error", (err: Error) => {
            logger.error({ err: err.message, clientId }, "Outbound agent socket error");
        });
    }
}
