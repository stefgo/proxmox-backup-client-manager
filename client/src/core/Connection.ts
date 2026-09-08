import WebSocket from "ws";
import { randomUUID } from "crypto";

import os from "os";
import { config } from "./Config.js";
import {
    WS_EVENTS,
    WsMessage,
    ProtocolMap,
    RunJobPayloadSchema,
    RestoreSnapshotPayloadSchema,
    FsListRequestSchema,
    GetVersionRequestSchema,
    JobListRequestSchema,
    JobSaveRequestSchema,
    JobDeleteRequestSchema,
    GenerateKeyRequestSchema,
    HistoryRequestSchema,
} from "@pbcm/shared";
import type { ZodType } from "zod";
import { Handlers } from "../features/Handlers.js";
import db from "./Database.js";

import { logger } from "@pbcm/shared/node";
import { VERSION } from "./Version.js";

/**
 * Schemas for everything the server pushes at us. The server has always validated
 * the agent's messages; this is the missing other half — and it matters more in this
 * direction, because RUN_BACKUP and RUN_RESTORE end up as arguments to a subprocess.
 *
 * Note that zod strips unknown keys, so an event listed here must have every field
 * the handlers actually read declared in its schema, or validation would quietly
 * remove it.
 */
/**
 * A row of the agent's own `job_history` table, as the delta sync reads it back.
 *
 * Written out rather than left as `any[]`: better-sqlite3 hands back `unknown`, and the
 * ten fields below are renamed one by one into the wire format a few lines down -- a typo
 * in one of those names would have travelled to the server as `undefined`.
 */
interface JobHistoryRow {
    id: string;
    job_id: string | null;
    name: string | null;
    type: string;
    status: string;
    start_time: string | null;
    end_time: string | null;
    exit_code: number | null;
    stdout: string | null;
    stderr: string | null;
}

const INBOUND_SCHEMAS: Partial<Record<string, ZodType>> = {
    [WS_EVENTS.RUN_BACKUP]: RunJobPayloadSchema,
    [WS_EVENTS.RUN_RESTORE]: RestoreSnapshotPayloadSchema,
    [WS_EVENTS.FS_LIST]: FsListRequestSchema,
    [WS_EVENTS.GET_VERSION]: GetVersionRequestSchema,
    [WS_EVENTS.JOB_LIST_CONFIG]: JobListRequestSchema,
    [WS_EVENTS.JOB_SAVE_CONFIG]: JobSaveRequestSchema,
    [WS_EVENTS.JOB_DELETE_CONFIG]: JobDeleteRequestSchema,
    [WS_EVENTS.GENERATE_KEY_CONFIG]: GenerateKeyRequestSchema,
    [WS_EVENTS.HISTORY]: HistoryRequestSchema,
};

export class Connection {
    private static wsInstance: WebSocket | null = null;
    /** Correlation table for requests this agent sends to the server. */
    private static pending = new Map<
        string,
        { resolve: (value: any) => void; reject: (err: Error) => void }
    >();

    /**
     * Checks if the WebSocket connection to the server is currently open.
     */
    static isConnected(): boolean {
        return (
            this.wsInstance !== null &&
            this.wsInstance.readyState === WebSocket.OPEN
        );
    }

    /**
     * Sends a typed message payload to the server over the WebSocket connection.
     *
     * @param type - The event type from WS_EVENTS.
     * @param payload - The data payload matching the protocol map for the event.
     */
    static send<T extends keyof ProtocolMap>(
        type: T,
        payload: ProtocolMap[T]["req"],
    ): void {
        if (this.wsInstance && this.wsInstance.readyState === WebSocket.OPEN) {
            this.wsInstance.send(JSON.stringify({ type, payload }));
        }
    }

    /**
     * Answers a request the server sent us. Identical on the wire to send(), but
     * typed against the other half of the ProtocolMap entry.
     *
     * An event name carries a different shape in each direction, so replying through
     * send() meant casting every answer to `any` — right at the boundary where two
     * separately deployed processes agree on their payloads, and therefore the worst
     * possible place to switch type checking off.
     */
    static respond<T extends keyof ProtocolMap>(
        type: T,
        payload: ProtocolMap[T]["res"],
    ): void {
        if (this.wsInstance && this.wsInstance.readyState === WebSocket.OPEN) {
            this.wsInstance.send(JSON.stringify({ type, payload }));
        }
    }

    /**
     * Establishes a WebSocket connection to the central backend server using the
     * configured URL and authentication token. Implements automatic reconnection,
     * handles incoming messages and routes them to the appropriate Handlers.
     *
     * @returns A promise resolving to an object indicating connection success or failure.
     */
    static connect(): Promise<{ connected: boolean; error?: string }> {
        if (this.isConnected()) {
            return Promise.resolve({ connected: true });
        }

        if (!config.websocketURL) {
            logger.warn("No Websocket URL configured. Connection skipped.");
            return Promise.resolve({
                connected: false,
                error: "No Websocket URL configured.",
            });
        }

        if (!config.authToken || !config.clientId) {
            logger.warn(
                "No identity. Please register first. Connection skipped.",
            );
            return Promise.resolve({
                connected: false,
                error: "No identity. Register first.",
            });
        }

        // Close any stale instance before retrying
        if (this.wsInstance) {
            try {
                this.wsInstance.close();
            } catch (_) {}
            this.wsInstance = null;
        }

        const wsUrl = new URL(config.websocketURL);
        wsUrl.searchParams.set("clientId", config.clientId);
        wsUrl.searchParams.set("token", config.authToken);

        logger.info(`Connecting to ${wsUrl.toString()}...`);

        const ws = new WebSocket(wsUrl.toString());
        this.wsInstance = ws;

        return new Promise((resolve) => {
            let pingTimeout: NodeJS.Timeout;

            function heartbeat() {
                clearTimeout(pingTimeout);
                pingTimeout = setTimeout(() => {
                    logger.warn(
                        "WebSocket heartbeat timeout. Terminating connection.",
                    );
                    ws.terminate();
                }, 35000); // 30s server interval + 5s buffer
            }

            const timeout = setTimeout(() => {
                resolve({
                    connected: false,
                    error: "Connection timeout (5s).",
                });
            }, 5000);

            ws.on("open", () => {
                heartbeat();
                logger.info("Connected to server");
                Connection.send(WS_EVENTS.AUTH, {
                    hostname: os.hostname(),
                    version: VERSION,
                });
            });

            ws.on("ping", heartbeat);

            this.attach(ws, {
                onAuthSuccess: () => {
                    clearTimeout(timeout);
                    resolve({ connected: true });
                },
                onHeartbeat: heartbeat,
                onClose: (code, reasonStr) => {
                    clearTimeout(pingTimeout);
                    clearTimeout(timeout);
                    resolve({
                        connected: false,
                        error: `${reasonStr} (Code: ${code})`,
                    });
                    logger.warn("Reconnecting in 5s...");
                    setTimeout(() => Connection.connect(), 5000);
                },
            });

            ws.on("error", (err: Error) => {
                logger.error("Connection error: " + err.message);
                ws.close();
            });
        });
    }

    /**
     * Installs the message routing on a socket. Used by both directions: the outbound
     * connection this agent dials itself, and an inbound session the server opened to us.
     */
    private static attach(
        ws: WebSocket,
        opts: {
            onAuthSuccess?: () => void;
            onHeartbeat?: () => void;
            onClose?: (code: number, reason: string) => void;
        },
    ): void {
        ws.on("message", (data: WebSocket.RawData) => {
            opts.onHeartbeat?.();
            try {
                const message = JSON.parse(data.toString()) as WsMessage;
                if (message.type !== WS_EVENTS.LOG_UPDATE) {
                    logger.debug("Received: " + message.type);
                }

                const schema = INBOUND_SCHEMAS[message.type];
                if (schema) {
                    const parsed = schema.safeParse(message.payload);
                    if (!parsed.success) {
                        logger.warn(
                            {
                                type: message.type,
                                issues: parsed.error.issues,
                            },
                            "Discarding malformed message from server",
                        );
                        return;
                    }
                    message.payload = parsed.data;
                }

                // Route messages to appropriate handlers based on event type
                switch (message.type) {
                    case WS_EVENTS.AUTH_SUCCESS:
                        logger.info("Authenticated successfully");

                        // Delta Sync History
                        try {
                            const lastSyncTime =
                                message.payload?.lastSyncTime;
                            let historyToSync: JobHistoryRow[] = [];
                            if (lastSyncTime) {
                                historyToSync = db
                                    .prepare(
                                        "SELECT * FROM job_history WHERE updated_at > ?",
                                    )
                                    .all(lastSyncTime) as JobHistoryRow[];
                            } else {
                                historyToSync = db
                                    .prepare(
                                        "SELECT * FROM job_history WHERE updated_at IS NOT NULL",
                                    )
                                    .all() as JobHistoryRow[];
                            }

                            if (historyToSync.length > 0) {
                                // A row without a start time cannot be sent: the server
                                // validates SYNC_HISTORY as a whole, so one such row would
                                // cost the entire batch rather than just itself. The
                                // column carries DEFAULT CURRENT_TIMESTAMP, so this is a
                                // guard against rows written before that, not the norm.
                                const syncable = historyToSync.filter(
                                    (h) => h.start_time !== null,
                                );
                                const skipped =
                                    historyToSync.length - syncable.length;
                                if (skipped > 0) {
                                    logger.warn(
                                        `Skipping ${skipped} history record(s) without a start time`,
                                    );
                                }

                                const formattedHistory = syncable.map((h) => ({
                                    id: h.id,
                                    jobConfigId: h.job_id,
                                    name: h.name,
                                    type: h.type,
                                    status: h.status,
                                    startTime: h.start_time as string,
                                    endTime: h.end_time,
                                    exitCode: h.exit_code,
                                    stdout: h.stdout,
                                    stderr: h.stderr,
                                }));

                                logger.info(
                                    `Syncing ${formattedHistory.length} history records to server...`,
                                );
                                Connection.send(WS_EVENTS.SYNC_HISTORY, {
                                    history: formattedHistory,
                                });
                            }
                        } catch (e) {
                            logger.error({ err: e }, "Failed to sync history");
                        }

                        opts.onAuthSuccess?.();
                        break;
                    case WS_EVENTS.RUN_BACKUP:
                        Handlers.handleRunJob(message.payload);
                        break;
                    case WS_EVENTS.JOB_LIST_CONFIG:
                        Handlers.handleJobList(message.payload);
                        break;
                    case WS_EVENTS.JOB_SAVE_CONFIG:
                        Handlers.handleJobSave(message.payload);
                        break;
                    case WS_EVENTS.JOB_DELETE_CONFIG:
                        Handlers.handleJobDelete(message.payload);
                        break;
                    case WS_EVENTS.GENERATE_KEY_CONFIG:
                        Handlers.handleGenerateKey(message.payload);
                        break;
                    case WS_EVENTS.HISTORY:
                        Handlers.handleHistory(message.payload);
                        break;
                    case WS_EVENTS.FS_LIST:
                        Handlers.handleFsList(message.payload);
                        break;
                    case WS_EVENTS.GET_VERSION:
                        Handlers.handleGetVersion(message.payload);
                        break;
                    case WS_EVENTS.RUN_RESTORE:
                        Handlers.handleRestoreSnapshot(message.payload);
                        break;
                    case WS_EVENTS.TUNNEL_ACQUIRE_RESULT:
                        Connection.resolvePending(message.payload);
                        break;
                }
            } catch (err) {
                logger.error({ err: err }, "Failed to parse message");
            }
        });

        ws.on("close", (code: number, reason: Buffer) => {
            this.wsInstance = null;
            this.rejectPending("Lost connection to the server");
            const reasonStr = reason.toString() || "No reason provided";
            logger.warn(`Disconnected (Code: ${code}, Reason: ${reasonStr}).`);
            opts.onClose?.(code, reasonStr);
        });

    }

    /**
     * Accepts a session the server opened to this agent (outbound connection mode).
     * The agent still sends AUTH first — the protocol is identical from there on.
     */
    static handleIncoming(ws: WebSocket): void {
        if (this.wsInstance) {
            try {
                this.wsInstance.close(4000, "Replaced by new connection");
            } catch (_) {}
        }
        this.wsInstance = ws;

        logger.info("Inbound server connection received, sending AUTH...");

        this.attach(ws, {
            onClose: () => {
                // No reconnect here: the server dials us and handles retries itself.
                logger.warn("Inbound server connection closed.");
            },
        });

        ws.send(
            JSON.stringify({
                type: WS_EVENTS.AUTH,
                payload: { hostname: os.hostname(), version: VERSION },
            }),
        );
    }

    /**
     * Request/response towards the server — the mirror image of ProxyService.sendRequest.
     * Needed because the tunnel lease is requested by the client, not pushed by the server.
     */
    static request<T extends keyof ProtocolMap>(
        type: T,
        payload: Omit<ProtocolMap[T]["req"], "requestId">,
        timeoutMs: number,
    ): Promise<ProtocolMap[T]["res"]> {
        return new Promise((resolve, reject) => {
            if (!this.isConnected()) {
                reject(new Error("Keine Serververbindung"));
                return;
            }

            const requestId = randomUUID();
            const timer = setTimeout(() => {
                this.pending.delete(requestId);
                reject(new Error("Server request timed out"));
            }, timeoutMs);

            this.pending.set(requestId, {
                resolve: (value: any) => {
                    clearTimeout(timer);
                    resolve(value);
                },
                reject: (err: Error) => {
                    clearTimeout(timer);
                    reject(err);
                },
            });

            this.wsInstance!.send(
                JSON.stringify({ type, payload: { ...payload, requestId } }),
            );
        });
    }

    /** Resolves a pending request by its correlation id. */
    static resolvePending(payload: any): void {
        const entry = payload?.requestId
            ? this.pending.get(payload.requestId)
            : undefined;
        if (!entry) return;
        this.pending.delete(payload.requestId);
        entry.resolve(payload);
    }

    private static rejectPending(reason: string): void {
        for (const [id, entry] of [...this.pending.entries()]) {
            this.pending.delete(id);
            entry.reject(new Error(reason));
        }
    }
}
