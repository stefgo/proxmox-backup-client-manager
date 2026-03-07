import WebSocket from "ws";

import os from "os";
import { config } from "./Config.js";
import { WS_EVENTS, WsMessage, ProtocolMap } from "@pbcm/shared";
import { Handlers } from "../features/Handlers.js";
import db from "./Database.js";

import { Logger } from "./Logger.js";
import { VERSION } from "./Version.js";

export class Connection {
    private static wsInstance: WebSocket | null = null;

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
            Logger.warn("No Websocket URL configured. Connection skipped.");
            return Promise.resolve({
                connected: false,
                error: "No Websocket URL configured.",
            });
        }

        if (!config.authToken) {
            Logger.warn("No Token. Please register first. Connection skipped.");
            return Promise.resolve({
                connected: false,
                error: "No Token. Register first.",
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
        wsUrl.searchParams.set("token", config.authToken);

        Logger.info(`Connecting to ${wsUrl.toString()}...`);

        const ws = new WebSocket(wsUrl.toString());
        this.wsInstance = ws;

        return new Promise((resolve) => {
            let pingTimeout: NodeJS.Timeout;

            function heartbeat() {
                clearTimeout(pingTimeout);
                pingTimeout = setTimeout(() => {
                    Logger.warn(
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
                Logger.info("Connected to server");
                Connection.send(WS_EVENTS.AUTH, {
                    hostname: os.hostname(),
                    version: VERSION,
                });
            });

            ws.on("ping", heartbeat);

            ws.on("message", (data: WebSocket.RawData) => {
                heartbeat();
                try {
                    const message = JSON.parse(data.toString()) as WsMessage;
                    if (message.type !== WS_EVENTS.LOG_UPDATE) {
                        Logger.debug("Received: " + message.type);
                    }

                    // Route messages to appropriate handlers based on event type
                    switch (message.type) {
                        case WS_EVENTS.AUTH_SUCCESS:
                            clearTimeout(timeout);
                            Logger.info("Authenticated successfully");

                            // Delta Sync History
                            try {
                                const lastSyncTime =
                                    message.payload?.lastSyncTime;
                                let historyToSync = [];
                                if (lastSyncTime) {
                                    historyToSync = db
                                        .prepare(
                                            "SELECT * FROM job_history WHERE updated_at > ?",
                                        )
                                        .all(lastSyncTime) as any[];
                                } else {
                                    historyToSync = db
                                        .prepare(
                                            "SELECT * FROM job_history WHERE updated_at IS NOT NULL",
                                        )
                                        .all() as any[];
                                }

                                if (historyToSync.length > 0) {
                                    const formattedHistory = historyToSync.map(
                                        (h: any) => ({
                                            id: h.id,
                                            jobConfigId: h.job_id,
                                            name: h.name,
                                            type: h.type,
                                            status: h.status,
                                            startTime: h.start_time,
                                            endTime: h.end_time,
                                            exitCode: h.exit_code,
                                            stdout: h.stdout,
                                            stderr: h.stderr,
                                        }),
                                    );

                                    Logger.info(
                                        `Syncing ${formattedHistory.length} history records to server...`,
                                    );
                                    Connection.send(WS_EVENTS.SYNC_HISTORY, {
                                        history: formattedHistory,
                                    });
                                }
                            } catch (e) {
                                Logger.error({ err: e }, "Failed to sync history");
                            }

                            resolve({ connected: true });
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
                    }
                } catch (err) {
                    Logger.error({ err: err }, "Failed to parse message");
                }
            });

            ws.on("close", (code: number, reason: Buffer) => {
                clearTimeout(pingTimeout);
                clearTimeout(timeout);
                this.wsInstance = null;
                const reasonStr = reason.toString() || "No reason provided";
                Logger.warn(
                    `Disconnected (Code: ${code}, Reason: ${reasonStr}). Reconnecting in 5s...`,
                );
                resolve({
                    connected: false,
                    error: `${reasonStr} (Code: ${code})`,
                });
                setTimeout(() => Connection.connect(), 5000);
            });

            ws.on("error", (err: Error) => {
                Logger.error("Connection error: " + err.message);
                ws.close();
            });
        });
    }
}
