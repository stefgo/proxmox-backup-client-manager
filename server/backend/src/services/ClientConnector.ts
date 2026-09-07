import WebSocket from "ws";
import { randomUUID } from "crypto";
import { WS_EVENTS, CONNECTION_MODE } from "@pbcm/shared";
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
    ): Promise<{ ok: boolean; error?: string }> {
        const registration = await this.performRegistration(
            outboundTargetAddress,
            registrationSecret,
        );
        if (!registration.authToken) {
            return { ok: false, error: registration.error };
        }

        const connected = await this.connectWithToken(
            id,
            outboundTargetAddress,
            registration.authToken,
            onPersist,
        );
        return connected
            ? { ok: true }
            : {
                  ok: false,
                  error: "Registration succeeded, but the agent connection (AUTH) that follows it was never established.",
              };
    }

    /** Turns a WebSocket close code from the agent into a message for the operator. */
    private static describeRegistrationClose(
        code: number,
        reason: string,
    ): string {
        if (code === 4003 && reason === "Already registered") {
            return "The client is already registered (authToken in its config.yaml). To add it again, remove the authToken on the client host and set a new registrationSecret.";
        }
        if (code === 4003 && reason === "No registration secret configured") {
            return "No registrationSecret is configured on the client host. Set one in the agent's config.yaml and restart the agent.";
        }
        if (code === 4003) {
            return "The client rejected the registration secret.";
        }
        return `Der Client hat die Registrierungsverbindung beendet (Code ${code}${
            reason ? `: ${reason}` : ""
        }).`;
    }

    /**
     * Performs the registration handshake and returns the generated authToken, or an
     * error describing why it failed. Writes nothing to the database.
     *
     * Every terminal event — including a bare `close` without any protocol message, which
     * is how the agent rejects an already-registered host — has to settle the promise.
     * Otherwise the HTTP request that started the handshake would hang forever.
     */
    private static performRegistration(
        outboundTargetAddress: string,
        registrationSecret: string,
    ): Promise<{ authToken: string | null; error?: string }> {
        const wsUrl = `ws://${outboundTargetAddress}/ws/register`;
        logger.info({ url: wsUrl }, "ClientConnector: starting registration");

        return new Promise((resolve) => {
            let settled = false;
            let timeout: NodeJS.Timeout | undefined;
            const finish = (authToken: string | null, error?: string) => {
                if (settled) return;
                settled = true;
                if (timeout) clearTimeout(timeout);
                resolve({ authToken, error });
            };

            let ws: WebSocket;
            try {
                ws = new WebSocket(wsUrl);
            } catch (err) {
                logger.error(
                    { err },
                    "ClientConnector: failed to create registration socket",
                );
                finish(
                    null,
                    `Registrierungsverbindung konnte nicht aufgebaut werden: ${
                        err instanceof Error ? err.message : String(err)
                    }`,
                );
                return;
            }

            const authToken = randomUUID();
            timeout = setTimeout(() => {
                logger.warn("ClientConnector: registration timed out");
                finish(
                    null,
                    "Registration timed out — the client did not answer.",
                );
                ws.terminate();
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
                        logger.info("ClientConnector: registration successful");
                        finish(authToken);
                        ws.close(1000, "Registration complete");
                    } else if (message.type === WS_EVENTS.REGISTRATION_FAILURE) {
                        logger.error(
                            "ClientConnector: client rejected registration secret",
                        );
                        finish(
                            null,
                            message?.payload?.error
                                ? `The client rejected the registration: ${message.payload.error}`
                                : "The client rejected the registration secret.",
                        );
                        ws.close();
                    }
                } catch (err) {
                    logger.error(
                        { err },
                        "ClientConnector: error parsing registration response",
                    );
                    finish(
                        null,
                        "Invalid response from the client to the registration.",
                    );
                    ws.close();
                }
            });

            ws.on("error", (err) => {
                logger.error(
                    { err: err.message },
                    "ClientConnector: registration connection error",
                );
                finish(
                    null,
                    `Registration connection failed: ${err.message}`,
                );
            });

            // A close without a protocol message is a rejection by the agent — resolve it
            // instead of silently dropping the promise.
            ws.on("close", (code: number, reason: Buffer) => {
                const text = reason?.toString() ?? "";
                logger.warn(
                    { code, reason: text },
                    "ClientConnector: registration socket closed",
                );
                finish(null, this.describeRegistrationClose(code, text));
            });
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

            // Safety net: a close that never produced an AUTH result must still settle
            // the promise. A later resolve after a successful AUTH is a no-op.
            ws.on("close", () => {
                clearTimeout(timeout);
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
            if (client && client.connection_mode === CONNECTION_MODE.OUTBOUND) {
                await this.connectClient(client);
            }
        }, delay);

        this.reconnectTimers.set(clientId, timer);
    }

    /** Triggers an immediate reconnect attempt, bypassing the backoff. */
    static async reconnectNow(clientId: string): Promise<boolean> {
        this.cancelReconnect(clientId);
        const client = ClientRepository.findById(clientId);
        if (!client || client.connection_mode !== CONNECTION_MODE.OUTBOUND)
            return false;
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
