import WebSocket from "ws";
import { randomUUID } from "crypto";
import {
    WS_EVENTS,
    CONNECTION_MODE,
    agentBaseUrl,
    isTlsTarget,
} from "@pbcm/shared";
import { logger } from "@pbcm/shared/node";
import {
    ClientRepository,
    type ClientRow,
} from "../repositories/ClientRepository.js";
import { WebSocketController } from "../controllers/WebSocketController.js";
import { appConfig } from "../config/AppConfig.js";

/** What the operator is told when the agent refused the value from the wizard. */
const WRONG_PIN =
    "The client rejected the setup PIN or registration secret. After 5 wrong attempts the agent replaces its PIN — read the current one from its log.";

/** The agent's own wording for that refusal, current and from before the setup PIN. */
const REJECTED_CREDENTIALS = new Set([
    "Wrong setup PIN or registration secret",
    "Secret mismatch",
]);

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
     * One of the agent's WebSocket routes, and the options the socket is opened with.
     *
     * The scheme is not decided here: it comes out of the stored address, so a client the
     * operator wrote as `wss://…` is dialled over TLS and every address stored before TLS
     * existed keeps meaning exactly what it did. The certificate is checked unless the
     * operator switched that off for the whole installation -- an agent on a home network
     * usually carries a self-signed one, which is a decision about the installation rather
     * than about this connection.
     *
     * The returned `url` carries no query. Callers that need one append it themselves and
     * keep logging this one: the auth token goes in that query, and a log line travels
     * further than this process.
     */
    private static agentSocket(
        address: string,
        path: string,
    ): { url: string; options: WebSocket.ClientOptions } {
        return {
            url: `${agentBaseUrl(address)}${path}`,
            options: isTlsTarget(address)
                ? {
                      rejectUnauthorized:
                          !appConfig.security.allow_self_signed_agent_certificates,
                  }
                : {},
        };
    }

    /**
     * Connects to every stored outbound client on startup. Registration cannot be retried
     * here — it needs the agent's setup PIN (or secret), which is only available in the create dialog.
     */
    static async connectAll(): Promise<void> {
        const clients = ClientRepository.findOutboundClients();
        const ready = clients.filter((c) => c.auth_token);
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
            id,
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
            return "The client is already registered (identity.json in the agent's data directory). To add it again, delete that file and restart the agent, then use the new setup PIN from its log.";
        }
        // Sent only by agents from before the setup PIN, which read the secret from config.yaml.
        if (code === 4003 && reason === "No registration secret configured") {
            return "The agent is an older version that needs registrationSecret in its config.yaml. Update the agent, or set that value and restart it.";
        }
        if (code === 4003) {
            return WRONG_PIN;
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
        id: string,
        outboundTargetAddress: string,
        registrationSecret: string,
    ): Promise<{ authToken: string | null; error?: string }> {
        const { url: wsUrl, options } = this.agentSocket(
            outboundTargetAddress,
            "/ws/register",
        );
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
                ws = new WebSocket(wsUrl, options);
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
                        payload: {
                            secret: registrationSecret,
                            authToken,
                            clientId: id,
                        },
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
                        const error: unknown = message?.payload?.error;
                        logger.error(
                            { error },
                            "ClientConnector: client rejected the registration",
                        );
                        // "Secret mismatch" is what agents from before the setup PIN send.
                        finish(
                            null,
                            typeof error === "string" && !REJECTED_CREDENTIALS.has(error)
                                ? `The client rejected the registration: ${error}`
                                : WRONG_PIN,
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
        const { url, options } = this.agentSocket(outboundTargetAddress, "/ws/agent");
        const wsUrl = `${url}?clientId=${encodeURIComponent(
            id,
        )}&token=${encodeURIComponent(authToken)}`;
        logger.info({ clientId: id, url }, "ClientConnector: connecting");

        return new Promise((resolve) => {
            let ws: WebSocket;
            try {
                ws = new WebSocket(wsUrl, options);
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
    static async connectClient(client: ClientRow): Promise<boolean> {
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
