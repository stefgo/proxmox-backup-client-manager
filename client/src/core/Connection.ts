import WebSocket from "ws";

import os from "os";
import { config } from "./Config.js";
import { WS_EVENTS, WsMessage, ProtocolMap } from "@pbcm/shared";
import { Handlers } from "../features/Handlers.js";

import { Logger } from "./Logger.js";

export class Connection {
    private static wsInstance: WebSocket | null = null;

    static isConnected(): boolean {
        return (
            this.wsInstance !== null &&
            this.wsInstance.readyState === WebSocket.OPEN
        );
    }

    static send<T extends keyof ProtocolMap>(
        type: T,
        payload: ProtocolMap[T]["req"],
    ): void {
        if (this.wsInstance && this.wsInstance.readyState === WebSocket.OPEN) {
            this.wsInstance.send(JSON.stringify({ type, payload }));
        }
    }

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
            Logger.warn(
                'No Token. Please register first. Connection skipped.',
            );
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
            const timeout = setTimeout(() => {
                resolve({
                    connected: false,
                    error: "Connection timeout (5s).",
                });
            }, 5000);

            ws.on("open", () => {
                Logger.info("Connected to server");
                Connection.send(WS_EVENTS.AUTH, {
                    hostname: os.hostname(),
                });
            });

            ws.on("message", (data: WebSocket.RawData) => {
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
                    Logger.error("Failed to parse message", err);
                }
            });

            ws.on("close", (code: number, reason: Buffer) => {
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
