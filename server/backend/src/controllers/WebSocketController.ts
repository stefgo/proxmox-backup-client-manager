import { FastifyInstance } from "fastify";
import {
    WS_EVENTS,
    CONNECTION_MODE,
    WsMessage,
    AuthPayloadSchema,
    isIpAllowed,
    isIpInNetworks,
} from "@pbcm/shared";
import { ProxyService } from "../services/ProxyService.js";
import { appConfig } from "../config/AppConfig.js";
import { logger } from "@pbcm/shared/node";
import { ClientRepository } from "../repositories/ClientRepository.js";
import { JobHistoryRepository } from "../repositories/JobHistoryRepository.js";
import { SESSION_COOKIE } from "../services/SessionCookie.js";
import { attachHeartbeat, type HeartbeatSocket } from "./websocket/Heartbeat.js";
import {
    routeAgentMessage,
    type AgentLogger,
} from "./websocket/AgentMessageRouter.js";

/** What an agent presents when it dials in: the identity the server issued it. */
type AgentQuery = { token?: string; clientId?: string };

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
        connection: any,
        req: any,
        fastify: FastifyInstance,
    ) {
        const socket: HeartbeatSocket = connection.socket || connection;
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
        } catch (e) {
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
        connection: any,
        req: any,
        fastify: FastifyInstance,
    ) {
        // Correctly handle IP address with trustProxy (configured in Fastify)
        const clientIp = req.ip;
        fastify.log.info({ msg: "Client connected", ip: clientIp });

        const socket: HeartbeatSocket = connection.socket || connection;
        attachHeartbeat(socket, () =>
            fastify.log.warn({
                msg: "Agent client connection timed out (no pong). Terminating.",
                ip: clientIp,
                clientId,
            }),
        );
        let isAuthenticated = false;
        let clientId: string | null = null;
        let authTimeout: NodeJS.Timeout;

        // AUTHENTICATION LOGIC (Identity + IP)
        // 1. Extract the identity: query params first, then Authorization header.
        // WebSocket connections from browser usually use query params?token=..., agents might use Headers.
        const query = req.query as AgentQuery;
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

        // Outbound clients are dialed BY the server and have no allowed address to check.
        const isInbound =
            client.connection_mode !== CONNECTION_MODE.OUTBOUND;

        if (isInbound && !isIpAllowed(clientIp, client.inbound_allowed_ip)) {
            fastify.log.warn({
                msg: "IP mismatch for client",
                expected: client.inbound_allowed_ip,
                actual: clientIp,
                clientId: client.id,
            });
            socket.close(4003, "IP address mismatch");
            return;
        }

        // Wait for explicit AUTH handshake from Agent (Protocol compatibility)
        // The agent must send { type: 'AUTH' } as its first message to confirm readiness.
        // We enforce a 5-second timeout to prevent zombie connections.

        authTimeout = setTimeout(() => {
            if (!isAuthenticated && socket.readyState === socket.OPEN) {
                fastify.log.warn({
                    msg: "Client authentication timed out",
                    ip: clientIp,
                });
                socket.close(4001, "Authentication timed out");
            }
        }, 5000);

        socket.on("message", (message: Buffer) => {
            try {
                const data = JSON.parse(message.toString()) as WsMessage;

                if (!isAuthenticated) {
                    if (data.type === WS_EVENTS.AUTH) {
                        const parsed = AuthPayloadSchema.safeParse(
                            data.payload,
                        );
                        if (!parsed.success) {
                            socket.close(4000, "Invalid payload");
                            return;
                        }

                        isAuthenticated = true;
                        clientId = client.id;
                        clearTimeout(authTimeout);

                        const authPayload = parsed.data;
                        ClientRepository.updateAuthSuccess(
                            clientId!,
                            clientIp,
                            authPayload.version || null,
                        );

                        fastify.log.info({
                            msg: "Client authenticated",
                            clientId,
                        });
                        ProxyService.registerClient(clientId!, socket);

                        const lastSyncTime =
                            JobHistoryRepository.findLatestSyncTime(clientId!);

                        socket.send(
                            JSON.stringify({
                                type: WS_EVENTS.AUTH_SUCCESS,
                                payload: { lastSyncTime },
                            }),
                        );
                        ProxyService.broadcastClientUpdate();

                        socket.on("close", () => {
                            if (clientId) {
                                ClientRepository.updateLastSeen(clientId);
                                ProxyService.unregisterClient(clientId, socket);
                                fastify.log.info({
                                    msg: "Client disconnected",
                                    clientId,
                                });
                                ProxyService.broadcastClientUpdate();
                            }
                        });
                    } else {
                        socket.send(
                            JSON.stringify({
                                type: WS_EVENTS.AUTH_FAILURE,
                                payload: {},
                            }),
                        );
                        socket.close(4003, "Forbidden");
                    }
                    return;
                }

                void this.handleAgentMessage(clientId!, socket, data, fastify.log);
            } catch (err) {
                fastify.log.error({
                    msg: "Error processing WebSocket message",
                    err,
                });
            }
        });

    }

    /**
     * Handles every post-authentication message from an agent. Shared by both connection
     * modes: inbound clients dial in, outbound clients are dialed by the server, but the
     * protocol from here on is identical.
     *
     * The routing itself lives in websocket/AgentMessageRouter.ts; this stays as the name
     * both handshakes call.
     */
    static async handleAgentMessage(
        clientId: string,
        socket: any,
        data: WsMessage,
        log: AgentLogger,
    ) {
        await routeAgentMessage(clientId, socket, data, log);
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

        let isAuthenticated = false;
        let authResultSent = false;
        const notifyAuthResult = (success: boolean) => {
            if (!authResultSent) {
                authResultSent = true;
                onAuthResult?.(success);
            }
        };

        const authTimeout = setTimeout(() => {
            if (!isAuthenticated) {
                logger.warn({ clientId }, "Outbound agent authentication timed out");
                notifyAuthResult(false);
                socket.close(4001, "Authentication timed out");
            }
        }, 5000);

        socket.on("message", (message: Buffer) => {
            try {
                const data = JSON.parse(message.toString()) as WsMessage;

                if (!isAuthenticated) {
                    if (data.type !== WS_EVENTS.AUTH) return;

                    const parsed = AuthPayloadSchema.safeParse(data.payload);
                    if (!parsed.success) {
                        notifyAuthResult(false);
                        socket.close(4000, "Invalid payload");
                        return;
                    }

                    isAuthenticated = true;
                    clearTimeout(authTimeout);

                    const version = parsed.data.version || null;

                    // For a brand new client this creates the DB rows; for reconnects the
                    // rows already exist and only the metadata is refreshed.
                    onPersist?.(version);
                    ClientRepository.updateOutboundAuthSuccess(clientId, version);

                    logger.info({ clientId }, "Outbound agent authenticated");
                    ProxyService.registerClient(clientId, socket);
                    notifyAuthResult(true);

                    const lastSyncTime =
                        JobHistoryRepository.findLatestSyncTime(clientId);
                    socket.send(
                        JSON.stringify({
                            type: WS_EVENTS.AUTH_SUCCESS,
                            payload: { lastSyncTime },
                        }),
                    );
                    ProxyService.broadcastClientUpdate();
                    return;
                }

                void this.handleAgentMessage(clientId, socket, data, {
                    info: (o) => logger.info(o),
                    warn: (o) => logger.warn(o),
                    error: (o) => logger.error(o),
                });
            } catch (err) {
                logger.error({ err, clientId }, "Error processing outbound agent message");
            }
        });

        socket.on("close", () => {
            // The heartbeat clears itself — attachHeartbeat registers its own close
            // handler for exactly that.
            clearTimeout(authTimeout);
            notifyAuthResult(false);
            if (isAuthenticated) {
                ClientRepository.updateLastSeen(clientId);
                ProxyService.unregisterClient(clientId, socket);
                logger.info({ clientId }, "Outbound agent disconnected");
                ProxyService.broadcastClientUpdate();
            }
            onClose();
        });

        socket.on("error", (err: Error) => {
            logger.error({ err: err.message, clientId }, "Outbound agent socket error");
        });
    }
}
