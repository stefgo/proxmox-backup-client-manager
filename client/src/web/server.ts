import Fastify, { FastifyRequest, FastifyReply } from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyWebSocket from "@fastify/websocket";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import {
    config,
    setServerUrl,
    persistIdentity,
    isRegistered,
    deleteRegistrationSecret,
} from "../core/Config.js";
import { Connection } from "../core/Connection.js";
import { startAgentActivity } from "../core/Lifecycle.js";
import { isCertificateError, serverRequest } from "../core/ServerHttp.js";
import { verifySetupPin, clearSetupPin } from "../core/SetupPin.js";
import db from "../core/Database.js";
import { logger } from "@pbcm/shared/node";
import { WS_EVENTS, isIpInNetworks } from "@pbcm/shared";
import { z } from "zod";

/**
 * What the agent's own setup page posts to `/api/register`.
 *
 * Validated for the same reason the server validates its endpoints: this runs on the
 * backed-up machine and the values decide which server the agent will trust from then on.
 */
const WebRegisterSchema = z.object({
    token: z.string().min(1),
    url: z.url(),
    /**
     * The PIN from this agent's own log. Without it anyone who can route to `listenPort`
     * could point an unregistered agent at a server of their choosing — see SetupPin.ts
     * on why this is a shared secret rather than a network list.
     */
    pin: z.string().min(1),
});

/** The identity the server presents on the agent session it opens. */
type AgentQuery = { token?: string; clientId?: string };

/** The optional server URL the status endpoint may be asked to check instead of the configured one. */
type StatusQuery = { url?: string };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let fastifyInstance: any = null;

export async function startWebServer() {
    fastifyInstance = Fastify({ logger: false });
    const fastify = fastifyInstance;

    await fastify.register(fastifyWebSocket);

    // Serve static assets (CSS, etc.)
    // We check multiple locations to handle both dev (src) and prod (dist)
    const possiblePaths = [
        path.join(__dirname, "public"),
        path.join(__dirname, "../src/web/public"),
        path.join(process.cwd(), "src/web/public"),
        path.join(process.cwd(), "dist/web/public"),
    ];

    let publicPath = "";
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            publicPath = p;
            break;
        }
    }

    if (publicPath) {
        logger.info(`Serving static files from ${publicPath}`);
        await fastify.register(fastifyStatic, {
            root: publicPath,
            prefix: "/",
            serve: true,
        });
    } else {
        logger.error("Could not find public directory for Client Web UI!");
        logger.debug("Tried paths: " + possiblePaths.join(", "));
    }

    // Redirect / based on auth token status
    fastify.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
        if (isRegistered()) {
            return reply.redirect("/status");
        } else {
            return reply.redirect("/register");
        }
    });

    const sendFileSafe = async (reply: FastifyReply, file: string) => {
        // `sendFile` exists on the reply only when @fastify/static registered above, and
        // that registration is conditional on the public directory being found. The cast
        // stays deliberately: the runtime check on the line is the whole point, and a
        // declaration claiming the method is always there would contradict it.
        if (typeof (reply as any).sendFile === "function") {
            return (reply as any).sendFile(file);
        }

        logger.error(
            `reply.sendFile is not a function. Frontend files might be missing. Attempted to send: ${file}`,
        );
        return reply.status(500).send({
            error: "Internal Server Error",
            message:
                "Static file serving is not initialized. The 'public' directory might be missing in the distribution.",
            details: `Attempted to serve: ${file}`,
        });
    };

    // Serve status page
    fastify.get(
        "/status",
        async (request: FastifyRequest, reply: FastifyReply) => {
            return sendFileSafe(reply, "status.html");
        },
    );

    // Serve registration page
    fastify.get(
        "/register",
        async (request: FastifyRequest, reply: FastifyReply) => {
            return sendFileSafe(reply, "register.html");
        },
    );

    // Check server reachability
    fastify.get(
        "/api/status/server",
        async (request: FastifyRequest, reply: FastifyReply) => {
            const query = request.query as StatusQuery;
            const checkUrl = query.url || config.serverUrl;
            let serverReachable = false;

            if (checkUrl) {
                try {
                    // Always tolerant: the answer is only "is there a PBCM server at this
                    // URL", nothing is sent and nothing is trusted from the reply.
                    const checkRes = await serverRequest(`${checkUrl}/api/v1/ping`, {
                        timeoutMs: 2000,
                        allowSelfSigned: true,
                    });
                    if (checkRes.ok) {
                        serverReachable = true;
                    }
                } catch (e) {
                    // Server not reachable
                }
            }

            return {
                serverUrl: checkUrl || null,
                serverReachable,
            };
        },
    );

    // Check auth token existence
    fastify.get(
        "/api/status/auth",
        async (request: FastifyRequest, reply: FastifyReply) => {
            return {
                hasAuthToken: isRegistered(),
            };
        },
    );

    // Check current connection status
    fastify.get(
        "/api/status/connection",
        async (request: FastifyRequest, reply: FastifyReply) => {
            return {
                connected: Connection.isConnected(),
            };
        },
    );

    /**
     * Liveness for the container's HEALTHCHECK and for monitoring.
     *
     * It deliberately does **not** consult `Connection.isConnected()`. The agent is
     * offline-capable by design: it runs its jobs from its own SQLite copy via
     * node-cron whether or not the server can be reached. Wiring the server
     * connection in here would translate every network hiccup into "agent broken"
     * and, under an orchestrator, into a restart that fixes nothing. The connection
     * has its own endpoint directly above; the two must not be conflated.
     */
    fastify.get(
        "/api/health",
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                db.prepare("SELECT 1").get();
                return { status: "ok" };
            } catch (err) {
                logger.error({ err }, "Health check failed: database unreachable");
                return reply.code(503).send({ status: "error" });
            }
        },
    );

    // Attempt to establish connection
    fastify.post(
        "/api/connect",
        async (request: FastifyRequest, reply: FastifyReply) => {
            const result = await Connection.connect();
            return {
                connected: result.connected,
                error: result.error,
            };
        },
    );

    // API to perform registration
    fastify.post(
        "/api/register",
        async (request: FastifyRequest, reply: FastifyReply) => {
            const parsed = WebRegisterSchema.safeParse(request.body);
            if (!parsed.success) {
                // The path is prefixed for the same reason the server does it: on its
                // own, "expected string, received undefined" leaves the caller to guess
                // which of three fields it meant.
                const issue = parsed.error.issues[0];
                const path = issue.path.join(".");
                return reply.status(400).send({
                    error: path ? `${path}: ${issue.message}` : issue.message,
                });
            }
            const { token, url, pin } = parsed.data;

            // Checked before the isRegistered() gate below, so the status code cannot be
            // used to find out whether this agent already has an identity — the same
            // reasoning the server applies in TokenController.register, where the schema
            // check comes before the token lookup.
            if (!verifySetupPin(pin)) {
                logger.warn(
                    { ip: request.ip },
                    "Registration denied: wrong or missing setup PIN",
                );
                return reply.status(403).send({
                    error: "Wrong setup PIN. It is printed in this agent's log on startup.",
                });
            }

            // Same rule the outbound handshake has always had: an agent that already
            // owns an identity does not get a second one. Registering again would leave
            // the client's old row on the server behind, jobs and history included.
            if (isRegistered()) {
                return reply.status(409).send({
                    error: "This client is already registered. Remove clientId and authToken from its config.yaml to register it again.",
                });
            }

            logger.info(`Web UI Registration requested with ${url}...`);

            try {
                // The registration token goes out and the auth token comes back, so the
                // certificate is checked unless the operator decided otherwise.
                const response = await serverRequest(`${url}/api/v1/register`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        token,
                        hostname: os.hostname(),
                    }),
                    allowSelfSigned: config.allowSelfSignedCertificates,
                });

                if (!response.ok) {
                    const errorText = response.text;
                    let errorMsg = errorText;
                    try {
                        const errorJson = JSON.parse(errorText);
                        if (errorJson.error) errorMsg = errorJson.error;
                    } catch {
                        // Response is not JSON, use raw text
                    }
                    return reply.status(400).send({ error: errorMsg });
                }

                const data = JSON.parse(response.text);

                if (data.token && data.clientId) {
                    setServerUrl(url);
                    persistIdentity(data.clientId, data.token);
                    // There is an identity now, so the PIN has nothing left to protect.
                    clearSetupPin();
                    logger.info(
                        "Web Registration successful! Identity received.",
                    );

                    // The agent has been idling without an identity; now it has one.
                    await startAgentActivity();

                    return {
                        success: true,
                        message: "Registration successful",
                    };
                } else {
                    return reply.status(500).send({
                        error: "Registration failed: The server did not return a complete identity.",
                    });
                }
            } catch (e: unknown) {
                logger.error({ err: e }, "Web registration error:");
                if (isCertificateError(e)) {
                    return reply.status(502).send({
                        error:
                            `The server's certificate could not be verified (${(e as Error).message}). ` +
                            "If it is self-signed on purpose, set allowSelfSignedCertificates: true in this agent's config.yaml and restart it.",
                    });
                }
                return reply.status(500).send({
                    error:
                        (e instanceof Error ? e.message : String(e)) ||
                        "Unknown error occurred during registration",
                });
            }
        },
    );

/**
 * The two endpoints below are the only way in for the server, and in outbound mode the
 * agent listens on every interface it has. Without a list this changes nothing -- with
 * one, the registration handshake in particular stops being reachable from the whole
 * routable network: it is the caller there who supplies the authToken the agent then
 * stores, so who may knock at all is worth deciding.
 *
 * The reason is logged, never sent: the caller learns that it was refused, not why.
 *
 * `req.ip` is the peer address of the socket -- this Fastify runs without `trustProxy`,
 * so no forwarding header can talk its way past the list. An agent behind a reverse proxy
 * therefore has to allow the proxy's address, not the server's.
 */
const isFromAllowedNetwork = (req: FastifyRequest): boolean =>
    isIpInNetworks(req.ip, config.allowedNetworks ?? [], true);

    // Outbound connection mode: the server dials this agent instead of the other way
    // round. Registration is only possible while a one-time secret is configured and no
    // auth token exists yet.
    fastify.get(
        "/ws/register",
        { websocket: true },
        (socket: any, req: FastifyRequest) => {
            if (!isFromAllowedNetwork(req)) {
                logger.warn(
                    { ip: req.ip },
                    "Registration connection denied: not in allowed networks",
                );
                socket.close(4003, "Access denied");
                return;
            }
            if (isRegistered()) {
                socket.close(4003, "Already registered");
                return;
            }
            if (!config.registrationSecret) {
                socket.close(4003, "No registration secret configured");
                return;
            }

            logger.info("Registration connection received from the server (outbound mode)");

            const timeout = setTimeout(() => {
                if (socket.readyState === socket.OPEN) {
                    socket.close(4001, "Registration timed out");
                }
            }, 10000);

            socket.on("message", (data: Buffer) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.type !== WS_EVENTS.REGISTRATION_REQUEST) return;

                    const { secret, authToken, clientId } =
                        message.payload || {};
                    if (!secret || secret !== config.registrationSecret) {
                        clearTimeout(timeout);
                        logger.warn("Registration rejected: secret mismatch");
                        socket.send(
                            JSON.stringify({
                                type: WS_EVENTS.REGISTRATION_FAILURE,
                                payload: { error: "Secret mismatch" },
                            }),
                        );
                        socket.close(4003, "Invalid secret");
                        return;
                    }

                    // Both halves or none: an agent holding a token without the id it
                    // belongs to could not open a session, and the secret would already
                    // be spent by then.
                    if (!authToken || !clientId) {
                        clearTimeout(timeout);
                        logger.warn(
                            "Registration rejected: server sent an incomplete identity",
                        );
                        socket.send(
                            JSON.stringify({
                                type: WS_EVENTS.REGISTRATION_FAILURE,
                                payload: { error: "Incomplete identity" },
                            }),
                        );
                        socket.close(4000, "Incomplete identity");
                        return;
                    }

                    persistIdentity(clientId, authToken);
                    deleteRegistrationSecret();
                    clearTimeout(timeout);

                    logger.info("Registration successful, identity stored");

                    // Scheduler and cleanup were held back for the unregistered agent.
                    // The server opens the agent session itself right after this.
                    void startAgentActivity();
                    socket.send(
                        JSON.stringify({
                            type: WS_EVENTS.REGISTRATION_SUCCESS,
                            payload: { hostname: os.hostname() },
                        }),
                    );
                    socket.close(1000, "Registration complete");
                } catch (err) {
                    clearTimeout(timeout);
                    logger.error({ err }, "Error during registration handshake");
                    socket.close(4000, "Protocol error");
                }
            });

            socket.on("close", () => clearTimeout(timeout));
        },
    );

    // Outbound connection mode: regular agent session opened by the server.
    fastify.get(
        "/ws/agent",
        { websocket: true },
        (socket: any, req: FastifyRequest) => {
            if (!isFromAllowedNetwork(req)) {
                logger.warn(
                    { ip: req.ip },
                    "Agent connection denied: not in allowed networks",
                );
                socket.close(4003, "Access denied");
                return;
            }

            const { token, clientId } = (req.query as AgentQuery) ?? {};

            // The id is checked as well as the token: the server has to be dialling the
            // client it thinks it is, or a target address pointed at the wrong host
            // would hand that host somebody else's jobs.
            if (!token || !config.authToken || token !== config.authToken) {
                logger.warn("Agent connection from the server rejected: invalid token");
                socket.close(4001, "Unauthorized");
                return;
            }

            if (!clientId || clientId !== config.clientId) {
                logger.warn(
                    { presented: clientId },
                    "Agent connection from the server rejected: client id mismatch",
                );
                socket.close(4001, "Unauthorized");
                return;
            }

            logger.info("Agent connection from the server accepted");
            Connection.handleIncoming(socket);
        },
    );

    try {
        const port = config.listenPort;
        await fastify.listen({ port, host: "0.0.0.0" });
        logger.info(`Client Web UI listening on port ${port}`);
    } catch (err) {
        logger.error({ err: err }, "Failed to start Client Web UI server");
    }
}

export async function stopWebServer() {
    if (fastifyInstance) {
        logger.info("Shutting down Client Web UI...");
        try {
            await fastifyInstance.close();
            logger.info("Client Web UI shut down gracefully.");
        } catch (err) {
            logger.error({ err: err }, "Error shutting down Client Web UI");
        }
    }
}
