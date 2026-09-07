import { FastifyInstance } from "fastify";
import { WebSocket } from "ws";
import {
    WS_EVENTS,
    JOB_STATUS,
    CONNECTION_MODE,
    WsMessage,
    ProtocolMap,
    AuthPayloadSchema,
    StatusUpdatePayloadSchema,
    LogUpdatePayloadSchema,
    SyncHistoryPayloadSchema,
    JobNextRunUpdatePayloadSchema,
    TunnelAcquireSchema,
    TunnelReleaseSchema,
    FingerprintObservedSchema,
    parseRepositoryEndpoint,
} from "@pbcm/shared";
import { ProxyService } from "../services/ProxyService.js";
import { TunnelService } from "../services/TunnelService.js";
import { appConfig } from "../config/AppConfig.js";
import { isIpInCidr, isIpInNetworks } from "../utils/networkUtils.js";
import { logger } from "../core/logger.js";
import { ClientRepository } from "../repositories/ClientRepository.js";
import { ClientTunnelRepository } from "../repositories/ClientTunnelRepository.js";
import { JobHistoryRepository } from "../repositories/JobHistoryRepository.js";
import { RepositoryConfigRepository } from "../repositories/RepositoryConfigRepository.js";
import { FingerprintObservations } from "../services/FingerprintObservations.js";
import {
    probeCertificate,
    normalizeFingerprint,
} from "../services/CertProbe.js";

type AgentLogger = {
    info: (o: any) => void;
    warn: (o: any) => void;
    error: (o: any) => void;
};

/**
 * A run that reached one of these is over and belongs in the history table. Typed as
 * string[] on purpose: the payload's status stays a plain string on the wire, so an
 * agent on an older build is never dropped for reporting something unfamiliar.
 */
const TERMINAL_JOB_STATUSES: string[] = [
    JOB_STATUS.SUCCESS,
    JOB_STATUS.FAILED,
    JOB_STATUS.ABORTED,
];

/**
 * Does an inbound client's connection come from the address it is pinned to?
 *
 * The pin is a single address for a client that registered without one being
 * specified, and an IPv4 network for a client whose registration token carried
 * one -- a machine on DHCP is one address today and another one tomorrow, and
 * pinning it to the first was never the intent, only the default.
 *
 * A pin without a `/` keeps the exact comparison it always had. `isIpInCidr`
 * works on 32-bit integers and maps everything it cannot parse -- every IPv6
 * address -- to `0`, so routing a plain address through it would make any two
 * IPv6 clients match each other.
 */
const matchesPin = (clientIp: string, pin: string | null): boolean => {
    if (!pin) return false;
    return pin.includes("/") ? isIpInCidr(clientIp, pin) : pin === clientIp;
};

export class WebSocketController {
    static async handleDashboardConnection(
        connection: any,
        req: any,
        fastify: FastifyInstance,
    ) {
        const socket = connection.socket || connection;
        (socket as any).isAlive = true;

        socket.on("pong", () => {
            (socket as any).isAlive = true;
        });

        const pingInterval = setInterval(() => {
            if ((socket as any).isAlive === false) {
                socket.terminate();
                return;
            }
            (socket as any).isAlive = false;
            socket.ping();
        }, 30000);

        // Registered before the auth checks below: those close the socket and return
        // early, and without this handler their ping interval would never be cleared.
        socket.on("close", () => {
            clearInterval(pingInterval);
        });

        const token = (req.query as any).token;
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

        const socket = connection.socket || connection;
        (socket as any).isAlive = true;

        socket.on("pong", () => {
            (socket as any).isAlive = true;
        });

        const pingInterval = setInterval(() => {
            if ((socket as any).isAlive === false) {
                fastify.log.warn({
                    msg: "Agent client connection timed out (no pong). Terminating.",
                    ip: clientIp,
                    clientId,
                });
                socket.terminate();
                return;
            }
            (socket as any).isAlive = false;
            socket.ping();
        }, 30000);

        socket.on("close", () => {
            clearInterval(pingInterval);
        });
        let isAuthenticated = false;
        let clientId: string | null = null;
        let authTimeout: NodeJS.Timeout;

        // AUTHENTICATION LOGIC (Token + IP)
        // 1. Extract Token: Check query params first, then Authorization header.
        // WebSocket connections from browser usually use query params?token=..., agents might use Headers.
        let token = (req.query as any).token;
        if (!token && req.headers["authorization"]) {
            const parts = req.headers["authorization"].split(" ");
            if (parts.length === 2 && parts[0] === "Bearer") {
                token = parts[1];
            }
        }

        if (!token) {
            fastify.log.warn({
                msg: "Client connected without token",
                ip: clientIp,
            });
            socket.close(4001, "Authentication required");
            return;
        }

        const client = ClientRepository.findByToken(token);

        if (!client) {
            fastify.log.warn({ msg: "Invalid token used", ip: clientIp });
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

        // Strict IP Check (Skip if in trusted networks)
        const trustedNetworks = appConfig.security?.trusted_networks || [];
        const isTrusted = isIpInNetworks(clientIp, trustedNetworks, false);

        // Outbound clients are dialed BY the server and have no registered IP to pin against.
        const isInbound =
            client.connection_mode !== CONNECTION_MODE.OUTBOUND;

        if (isInbound && !isTrusted && !matchesPin(clientIp, client.inbound_registered_ip)) {
            fastify.log.warn({
                msg: "IP mismatch for client",
                expected: client.inbound_registered_ip,
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
     */
    static async handleAgentMessage(
        clientId: string,
        socket: any,
        data: WsMessage,
        log: AgentLogger,
    ) {
            // Handle Messages from Agent
            // 1. Status Updates (Forward to Dashboard + Save to DB if final)
            if (data.type === WS_EVENTS.STATUS_UPDATE) {
                const parsed = StatusUpdatePayloadSchema.safeParse(
                    data.payload,
                );
                if (!parsed.success) {
                    log.warn({
                        msg: "Invalid STATUS_UPDATE payload",
                        errors: parsed.error,
                    });
                    return;
                }
                const statusPayload = parsed.data;

                // If job has ended, save to history
                if (TERMINAL_JOB_STATUSES.includes(statusPayload.status)) {
                    try {
                        JobHistoryRepository.upsertStatus(
                            clientId,
                            statusPayload,
                        );
                    } catch (err) {
                        log.error({
                            msg: "Failed to save job history",
                            err,
                        });
                    }
                }

                const updateMsg = {
                    type: "JOB_UPDATE",
                    payload: {
                        clientId: clientId,
                        job: statusPayload,
                    },
                };
                // We need to implement this method in ProxyService or expose dashboardClients
                // I'll assume I update ProxyService or access it if I change it to public.
                // Better: update ProxyService.
                ProxyService.broadcastToDashboard(updateMsg);
            }

            // 2. Log Updates
            // Stream stdout/stderr from client jobs to the dashboard for real-time monitoring.
            if (data.type === WS_EVENTS.LOG_UPDATE) {
                const parsed = LogUpdatePayloadSchema.safeParse(
                    data.payload,
                );
                if (!parsed.success) return;
                const logPayload = parsed.data;
                const updateMsg = {
                    type: "LOG_UPDATE",
                    payload: {
                        clientId: clientId,
                        ...logPayload,
                    },
                };
                ProxyService.broadcastToDashboard(updateMsg);
            }

            // 3. Sync History (Delta load from client)
            if (data.type === WS_EVENTS.SYNC_HISTORY) {
                const parsed = SyncHistoryPayloadSchema.safeParse(
                    data.payload,
                );
                if (!parsed.success) {
                    log.warn({
                        msg: "Invalid SYNC_HISTORY payload",
                        errors: parsed.error,
                    });
                    return;
                }
                const syncPayload = parsed.data;
                if (
                    syncPayload.history &&
                    Array.isArray(syncPayload.history)
                ) {
                    try {
                        JobHistoryRepository.upsertHistoryBatch(
                            clientId,
                            syncPayload.history,
                        );
                        log.info({
                            msg: "Processed history sync from client",
                            clientId,
                            count: syncPayload.history.length,
                        });
                    } catch (err) {
                        log.error({
                            msg: "Failed to process history sync",
                            err,
                        });
                    }
                }
            }

            // 4. Job Next Run Update
            if (data.type === WS_EVENTS.JOB_NEXT_RUN_UPDATE) {
                const parsed = JobNextRunUpdatePayloadSchema.safeParse(
                    data.payload,
                );
                if (!parsed.success) return;
                const nextRunPayload = parsed.data;
                ProxyService.updateJobNextRun(
                    clientId,
                    nextRunPayload.jobId,
                    nextRunPayload.nextRunAt,
                );
            }

            // 5. Tunnel lease requests (outbound clients only).
            // The client never names a target: jobId (backup) or runId (restore) is
            // resolved server-side into the actual PBS host and port.
            if (data.type === WS_EVENTS.TUNNEL_ACQUIRE) {
                await this.handleTunnelAcquire(clientId, socket, data, log);
            }

            if (data.type === WS_EVENTS.FINGERPRINT_OBSERVED) {
                const parsed = FingerprintObservedSchema.safeParse(data.payload);
                if (!parsed.success) return;
                this.handleFingerprintObserved(clientId, parsed.data, log);
            }

            if (data.type === WS_EVENTS.TUNNEL_RELEASE) {
                const parsed = TunnelReleaseSchema.safeParse(data.payload);
                if (!parsed.success) return;
                TunnelService.release(clientId, parsed.data.leaseId);
            }
    }

    /**
     * Grants or denies a tunnel lease. Everything security relevant happens here:
     * the requested job must belong to the requesting client, and the target is derived
     * from the job's repository — never from the request.
     */
    private static async handleTunnelAcquire(
        clientId: string,
        socket: any,
        data: WsMessage,
        log: AgentLogger,
    ) {
        const parsed = TunnelAcquireSchema.safeParse(data.payload);
        if (!parsed.success) {
            log.warn({ msg: "Invalid TUNNEL_ACQUIRE payload", clientId });
            return;
        }
        const { requestId, runId, jobId } = parsed.data;

        const deny = (error: string) => {
            log.warn({ msg: "Tunnel request denied", clientId, runId, jobId, error });
            socket.send(
                JSON.stringify({
                    type: WS_EVENTS.TUNNEL_ACQUIRE_RESULT,
                    payload: { requestId, granted: false, error },
                }),
            );
        };

        try {
            if (!ClientRepository.findById(clientId)) {
                deny("Unknown client");
                return;
            }
            // The connection mode says nothing here: a tunnelled inbound client is as
            // entitled to a lease as an outbound one, and an outbound client whose jobs
            // go straight to the PBS is not entitled to one at all.
            if (!ClientTunnelRepository.isConfigured(clientId)) {
                deny("No SSH tunnel is configured for this client");
                return;
            }

            const target = await this.resolveTunnelTarget(clientId, runId, jobId);
            if (!target) {
                deny(
                    "No permitted tunnel target for this request — job unknown or belongs to another client",
                );
                return;
            }

            // Measured here rather than taken from the job snapshot: the client will
            // reach the PBS as 127.0.0.1 and can never validate the certificate itself.
            const fingerprint = await this.resolveFingerprint(target, log);

            const lease = await TunnelService.acquire(
                clientId,
                target,
                runId,
                jobId,
            );
            socket.send(
                JSON.stringify({
                    type: WS_EVENTS.TUNNEL_ACQUIRE_RESULT,
                    payload: {
                        requestId,
                        granted: true,
                        leaseId: lease.leaseId,
                        bindHost: lease.bindHost,
                        bindPort: lease.bindPort,
                        fingerprint,
                    },
                }),
            );
        } catch (e) {
            deny(e instanceof Error ? e.message : String(e));
        }
    }

    /**
     * Resolves the PBS endpoint for a request. Backups carry a jobId whose repository is
     * looked up in the server-side job cache; restores carry only a runId, which the
     * server pre-authorised when it triggered the restore.
     *
     * The cached job is also what authorises the request: a job not configured for the
     * tunnel gets no target and therefore no lease, however the agent asks. The server
     * never takes the client's word for the route — it reads back the job it pushed out.
     */
    private static async resolveTunnelTarget(
        clientId: string,
        runId: string,
        jobId?: string,
    ): Promise<{ host: string; port: number } | undefined> {
        if (!jobId) {
            return TunnelService.resolveRunTarget(clientId, runId);
        }

        let job = ProxyService.getCachedJob(clientId, jobId);
        if (!job) {
            // Cache may be cold right after a restart — refresh once before giving up.
            await ProxyService.refreshJobCache(clientId);
            job = ProxyService.getCachedJob(clientId, jobId);
        }
        if (!job?.repository?.baseUrl) return undefined;
        if (!job.tunnel?.required) return undefined;

        return this.repositoryTarget(job.repository.baseUrl);
    }

    /**
     * Records a fingerprint a client measured. Logged and kept for the operator to look
     * at — never written into the repository config, because a single compromised client
     * must not be able to set the value every other client then trusts.
     */
    private static handleFingerprintObserved(
        clientId: string,
        payload: { repositoryId?: string; baseUrl: string; fingerprint: string; caValid: boolean },
        log: AgentLogger,
    ) {
        const repo = payload.repositoryId
            ? RepositoryConfigRepository.findById(payload.repositoryId)
            : RepositoryConfigRepository.findAll().find(
                  (r: any) => r.base_url === payload.baseUrl,
              );

        if (!repo) {
            log.warn({
                msg: "Fingerprint reported for an unknown repository",
                clientId,
                baseUrl: payload.baseUrl,
            });
            return;
        }

        FingerprintObservations.record(
            repo.id,
            clientId,
            payload.fingerprint,
            payload.caValid,
        );
    }

    /**
     * Determines which fingerprint a tunneled run should pin. A measured value is only
     * used when the regular CA validation vouched for it; otherwise the stored value —
     * which an operator confirmed by hand — stays authoritative.
     */
    private static async resolveFingerprint(
        target: { host: string; port: number },
        log: AgentLogger,
    ): Promise<string | undefined> {
        const repo = RepositoryConfigRepository.findAll().find((r: any) => {
            const t = this.repositoryTarget(r.base_url);
            return t?.host === target.host && t?.port === target.port;
        });

        const baseUrl = repo?.base_url ?? `https://${target.host}:${target.port}`;
        const stored = normalizeFingerprint(repo?.fingerprint);

        const probe = await probeCertificate(baseUrl);

        if (probe.caValid && probe.fingerprint) {
            if (stored && stored !== probe.fingerprint) {
                log.warn({
                    msg: "Stored fingerprint is outdated — using the measured one for this run",
                    baseUrl,
                    stored,
                    measured: probe.fingerprint,
                });
            }
            return probe.fingerprint;
        }

        // A failed probe must never block a backup: fall back to what is stored.
        return repo?.fingerprint || undefined;
    }

    /**
     * Turns a repository base URL into the host/port the tunnel must forward to.
     * The port is whatever the URL says — see parseRepositoryEndpoint; a PBS on its own
     * API port has to be written as `https://pbs.example.com:8007`.
     */
    static repositoryTarget(
        baseUrl: string,
    ): { host: string; port: number } | undefined {
        const endpoint = parseRepositoryEndpoint(baseUrl);
        return endpoint
            ? { host: endpoint.host, port: endpoint.port }
            : undefined;
    }

    /**
     * Handles a connection the server opened itself (outbound mode). Same AUTH handshake
     * as inbound, but without the IP check: the server chose the peer, so there is no
     * remote address to pin.
     */
    static handleOutboundAgentConnection(
        clientId: string,
        socket: WebSocket,
        onClose: () => void,
        onAuthResult?: (success: boolean) => void,
        onPersist?: (version: string | null) => void,
    ): void {
        logger.info(
            { clientId },
            "Outbound agent connection established, awaiting AUTH",
        );

        (socket as any).isAlive = true;
        socket.on("pong", () => {
            (socket as any).isAlive = true;
        });

        const pingInterval = setInterval(() => {
            if ((socket as any).isAlive === false) {
                socket.terminate();
                return;
            }
            (socket as any).isAlive = false;
            socket.ping();
        }, 30000);

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
            clearInterval(pingInterval);
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
