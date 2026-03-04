import { FastifyInstance } from "fastify";
import { WS_EVENTS, WsMessage, ProtocolMap } from "@pbcm/shared";
import db from "../core/Database.js";
import { ProxyService } from "../services/ProxyService.js";
import { appConfig } from "../config/AppConfig.js";
import { isIpInNetworks } from "../utils/NetworkUtils.js";

export class WebSocketController {
    static async handleDashboardConnection(
        connection: any,
        req: any,
        fastify: FastifyInstance,
    ) {
        const socket = connection.socket || connection;

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

        const client = db
            .prepare("SELECT id, allowed_ip FROM clients WHERE auth_token = ?")
            .get(token) as any;

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

        if (!isTrusted && client.allowed_ip !== clientIp) {
            fastify.log.warn({
                msg: "IP mismatch for client",
                expected: client.allowed_ip,
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
                        isAuthenticated = true;
                        clientId = client.id;
                        clearTimeout(authTimeout);

                        const now = new Date().toISOString();
                        db.prepare(
                            `UPDATE clients SET last_seen=?, updated_at=?, ip_address=? WHERE id=?`,
                        ).run(now, now, clientIp, clientId);

                        fastify.log.info({
                            msg: "Client authenticated",
                            clientId,
                        });
                        ProxyService.registerClient(clientId!, socket);

                        // Find the latest sync time for this client
                        const lastSyncRecord = db
                            .prepare(
                                "SELECT end_time FROM job_history WHERE client_id = ? ORDER BY end_time DESC LIMIT 1",
                            )
                            .get(clientId) as
                            | { end_time: string | null }
                            | undefined;
                        const lastSyncTime = lastSyncRecord?.end_time || null;

                        socket.send(
                            JSON.stringify({
                                type: WS_EVENTS.AUTH_SUCCESS,
                                payload: { lastSyncTime },
                            }),
                        );
                        ProxyService.broadcastClientUpdate();

                        socket.on("close", () => {
                            if (clientId) {
                                const now = new Date().toISOString();
                                db.prepare(
                                    "UPDATE clients SET updated_at=? WHERE id = ?",
                                ).run(now, clientId);
                                ProxyService.unregisterClient(clientId);
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

                // Handle Messages from Agent
                // 1. Status Updates (Forward to Dashboard + Save to DB if final)
                if (data.type === WS_EVENTS.STATUS_UPDATE) {
                    const statusPayload =
                        data.payload as ProtocolMap["STATUS_UPDATE"]["req"];

                    // If job has ended, save to history
                    if (
                        ["success", "failed", "abort"].includes(
                            statusPayload.status,
                        )
                    ) {
                        try {
                            db.prepare(
                                `
                                INSERT OR REPLACE INTO job_history (id, client_id, job_id, name, type, status, start_time, end_time, exit_code, stdout, stderr)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `,
                            ).run(
                                statusPayload.id,
                                clientId,
                                statusPayload.id, // Using runId as job_id fallback, or extract actual jobId if possible. client sends runId as id. It might not pass jobId directly in STATUS_UPDATE. For now, leave it as id.
                                statusPayload.name || null,
                                statusPayload.type,
                                statusPayload.status,
                                statusPayload.startTime ||
                                    new Date().toISOString(),
                                statusPayload.endTime ||
                                    new Date().toISOString(),
                                statusPayload.exitCode ?? null,
                                statusPayload.stdout || null,
                                statusPayload.stderr || null,
                            );
                        } catch (err) {
                            fastify.log.error({
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
                    const logPayload =
                        data.payload as ProtocolMap["LOG_UPDATE"]["req"];
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
                    const syncPayload =
                        data.payload as ProtocolMap["SYNC_HISTORY"]["req"];
                    if (
                        syncPayload.history &&
                        Array.isArray(syncPayload.history)
                    ) {
                        const insertStmt = db.prepare(`
                            INSERT OR REPLACE INTO job_history (id, client_id, job_id, name, type, status, start_time, end_time, exit_code, stdout, stderr)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `);

                        const transaction = db.transaction((entries) => {
                            for (const entry of entries) {
                                insertStmt.run(
                                    entry.id,
                                    clientId,
                                    entry.jobConfigId || null,
                                    entry.name || null,
                                    entry.type,
                                    entry.status,
                                    entry.startTime,
                                    entry.endTime,
                                    entry.exitCode,
                                    entry.stdout || null,
                                    entry.stderr || null,
                                );
                            }
                        });

                        try {
                            transaction(syncPayload.history);
                            fastify.log.info({
                                msg: "Processed history sync from client",
                                clientId,
                                count: syncPayload.history.length,
                            });
                        } catch (err) {
                            fastify.log.error({
                                msg: "Failed to process history sync",
                                err,
                            });
                        }
                    }
                }

                // 4. Job Next Run Update
                if (data.type === WS_EVENTS.JOB_NEXT_RUN_UPDATE) {
                    const nextRunPayload =
                        data.payload as ProtocolMap["JOB_NEXT_RUN_UPDATE"]["req"];
                    ProxyService.updateJobNextRun(
                        clientId!,
                        nextRunPayload.jobId,
                        nextRunPayload.nextRunAt,
                    );
                }
            } catch (err) {
                fastify.log.error({
                    msg: "Error processing WebSocket message",
                    err,
                });
            }
        });

        // Handling StatusUpdate forwarding:
        // I need to patch ProxyService to allow broadcasting arbitrary messages.
        // It has `broadcastClientUpdate` which is specific.
    }
}
