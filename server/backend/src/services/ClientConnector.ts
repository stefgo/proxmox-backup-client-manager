import WebSocket from "ws";
import { randomUUID } from "crypto";
import { WS_EVENTS } from "@pbcm/shared";
import { logger } from "../core/logger.js";
import { ClientRepository } from "../repositories/ClientRepository.js";
import { WebSocketController } from "../controllers/WebSocketController.js";

const RECONNECT_DELAYS = [5000, 10000, 30000, 60000];
const HANDSHAKE_TIMEOUT_MS = 10000;

/**
 * Dials outbound clients: for those, the server is the connecting party and the client
 * agent hosts /ws/register and /ws/agent. Inbound clients are unaffected — they keep
 * dialing the server themselves (WebSocketController.handleAgentConnection).
 */
export class ClientConnector {
    private static reconnectTimers = new Map<string, NodeJS.Timeout>();
    private static reconnectAttempts = new Map<string, number>();

    /**
     * Connects to every stored outbound client on startup. Registration cannot be retried
     * here — it needs the one-time secret that is only available in the create dialog.
     */
    static async connectAll(): Promise<void> {
        const clients = ClientRepository.findOutboundClients();
        const ready = clients.filter((c: any) => c.auth_token);
        logger.info(
            `ClientConnector: connecting to ${ready.length} outbound client(s) on startup`,
        );
        for (const client of ready) {
            await this.connectClient(client);
        }
    }

    /**
     * First contact with a client that is not in the database yet: registration plus the
     * full AUTH handshake. onPersist is only called once AUTH succeeded — the caller
     * writes to the database there, so nothing is stored on failure.
     */
    static async firstConnect(
        id: string,
        outboundTargetAddress: string,
        registrationSecret: string,
        onPersist: (authToken: string, version: string | null) => void,
    ): Promise<boolean> {
        const authToken = await this.performRegistration(
            outboundTargetAddress,
            registrationSecret,
        );
        if (!authToken) return false;

        return this.connectWithToken(
            id,
            outboundTargetAddress,
            authToken,
            onPersist,
        );
    }

    /**
     * Performs the registration handshake and returns the generated authToken,
     * or null on failure. Writes nothing to the database.
     */
    private static performRegistration(
        outboundTargetAddress: string,
        registrationSecret: string,
    ): Promise<string | null> {
        const wsUrl = `ws://${outboundTargetAddress}/ws/register`;
        logger.info({ url: wsUrl }, "ClientConnector: starting registration");

        return new Promise((resolve) => {
            let ws: WebSocket;
            try {
                ws = new WebSocket(wsUrl);
            } catch (err) {
                logger.error(
                    { err },
                    "ClientConnector: failed to create registration socket",
                );
                resolve(null);
                return;
            }

            const authToken = randomUUID();
            const timeout = setTimeout(() => {
                ws.terminate();
                logger.warn("ClientConnector: registration timed out");
                resolve(null);
            }, HANDSHAKE_TIMEOUT_MS);

            ws.on("open", () => {
                ws.send(
                    JSON.stringify({
                        type: WS_EVENTS.REGISTRATION_REQUEST,
                        payload: { secret: registrationSecret, authToken },
                    }),
                );
            });

            ws.on("message", (data: WebSocket.RawData) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.type === WS_EVENTS.REGISTRATION_SUCCESS) {
                        clearTimeout(timeout);
                        logger.info("ClientConnector: registration successful");
                        ws.close(1000, "Registration complete");
                        resolve(authToken);
                    } else if (message.type === WS_EVENTS.REGISTRATION_FAILURE) {
                        clearTimeout(timeout);
                        logger.error(
                            "ClientConnector: client rejected registration secret",
                        );
                        ws.close();
                        resolve(null);
                    }
                } catch (err) {
                    clearTimeout(timeout);
                    logger.error(
                        { err },
                        "ClientConnector: error parsing registration response",
                    );
                    ws.close();
                    resolve(null);
                }
            });

            ws.on("error", (err) => {
                clearTimeout(timeout);
                logger.error(
                    { err: err.message },
                    "ClientConnector: registration connection error",
                );
                resolve(null);
            });

            ws.on("close", () => clearTimeout(timeout));
        });
    }

    /**
     * Opens an agent session with a known token. The client does not have to exist in the
     * database yet — onPersist creates it after a successful AUTH.
     */
    private static connectWithToken(
        id: string,
        outboundTargetAddress: string,
        authToken: string,
        onPersist?: (authToken: string, version: string | null) => void,
    ): Promise<boolean> {
        const wsUrl = `ws://${outboundTargetAddress}/ws/agent?token=${authToken}`;
        logger.info(
            { clientId: id, url: `ws://${outboundTargetAddress}/ws/agent` },
            "ClientConnector: connecting",
        );

        return new Promise((resolve) => {
            let ws: WebSocket;
            try {
                ws = new WebSocket(wsUrl);
            } catch (err) {
                logger.error(
                    { err, clientId: id },
                    "ClientConnector: failed to create socket",
                );
                resolve(false);
                return;
            }

            const timeout = setTimeout(() => {
                ws.terminate();
                logger.warn({ clientId: id }, "ClientConnector: connection timed out");
                resolve(false);
            }, HANDSHAKE_TIMEOUT_MS);

            ws.on("open", () => {
                clearTimeout(timeout);
                this.reconnectAttempts.delete(id);
                WebSocketController.handleOutboundAgentConnection(
                    id,
                    ws,
                    () => this.scheduleReconnect(id),
                    (authSuccess) => resolve(authSuccess),
                    (version) => onPersist?.(authToken, version),
                );
            });

            ws.on("error", (err) => {
                clearTimeout(timeout);
                logger.error(
                    { err: err.message, clientId: id },
                    "ClientConnector: connection error",
                );
                resolve(false);
            });
        });
    }

    /** Reconnects a client that already exists in the database. */
    static async connectClient(client: any): Promise<boolean> {
        if (!client?.outbound_target_address || !client?.auth_token) {
            logger.warn(
                { clientId: client?.id },
                "ClientConnector: missing target address or token, cannot connect",
            );
            return false;
        }

        const connected = await this.connectWithToken(
            client.id,
            client.outbound_target_address,
            client.auth_token,
        );
        if (!connected) this.scheduleReconnect(client.id);
        return connected;
    }

    /** Schedules a reconnect with backoff. Repeated calls collapse into one timer. */
    static scheduleReconnect(clientId: string): void {
        if (this.reconnectTimers.has(clientId)) return;

        const attempt = this.reconnectAttempts.get(clientId) ?? 0;
        const delay =
            RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
        this.reconnectAttempts.set(clientId, attempt + 1);

        logger.info({ clientId, delay }, "ClientConnector: scheduling reconnect");

        const timer = setTimeout(async () => {
            this.reconnectTimers.delete(clientId);
            const client = ClientRepository.findById(clientId);
            if (client && client.connection_mode === "outbound") {
                await this.connectClient(client);
            }
        }, delay);

        this.reconnectTimers.set(clientId, timer);
    }

    /** Triggers an immediate reconnect attempt, bypassing the backoff. */
    static async reconnectNow(clientId: string): Promise<boolean> {
        this.cancelReconnect(clientId);
        const client = ClientRepository.findById(clientId);
        if (!client || client.connection_mode !== "outbound") return false;
        return this.connectClient(client);
    }

    static cancelReconnect(clientId: string): void {
        const timer = this.reconnectTimers.get(clientId);
        if (timer) {
            clearTimeout(timer);
            this.reconnectTimers.delete(clientId);
        }
        this.reconnectAttempts.delete(clientId);
    }
}
