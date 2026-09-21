import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyWebSocket, { type WebSocket } from "@fastify/websocket";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import { config, readTlsMaterial } from "../core/Config.js";
import { getIdentity, isRegistered, setIdentity } from "../core/Identity.js";
import {
    consumeRegistrationSecret,
    getAgentMode,
    getRegistrationSecret,
    getServerUrl,
    setServerUrl,
} from "../core/RegistrationState.js";
import { Connection } from "../core/Connection.js";
import { startAgentActivity } from "../core/Lifecycle.js";
import { isCertificateError, serverRequest } from "../core/ServerHttp.js";
import { verifySetupPin, clearSetupPin } from "../core/SetupPin.js";
import { secretEquals } from "../core/secrets.js";
import { DATA_DIR } from "../core/DataStore.js";
import { logger } from "@pbcm/shared/node";
import { WS_EVENTS, isIpInCidr, isIpInNetworks } from "@pbcm/shared";
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

let fastifyInstance: FastifyInstance | null = null;

/**
 * What to tell the operator when a registration could not be stored, or null when both
 * halves are on disk. The identity and the server URL live in different files, and which of
 * them failed decides what has to be made writable.
 */
function registrationWarning(identityStored: boolean, urlStored: boolean): string | null {
    if (identityStored && urlStored) return null;
    const what = !identityStored
        ? "the identity in this agent's data directory"
        : "the server URL in this agent's config.yaml";
    return (
        `Registered, but ${what} could not be written. ` +
        "The agent is working now and will come back unregistered after a restart -- " +
        "make the file writable and register again."
    );
}

/**
 * Which groups of routes this agent serves. Settled once at startup, from what the
 * configuration says the agent is for.
 *
 * - `statusPage` / `registerPage` -- the operator's two pages and the endpoints they call.
 * - `outbound` -- `/ws/register` and `/ws/agent`, the server dialling in. Every agent without
 *   a server URL: unregistered, it waits for the server to register it with the setup PIN (or
 *   `PBCM_REGISTRATION_SECRET`); registered, it needs `/ws/agent`. A server URL means inbound,
 *   which needs no route here -- the agent dials out itself.
 * - `health` -- `/api/health`, for the container's HEALTHCHECK only.
 */
export interface WebRoutes {
    statusPage: boolean;
    registerPage: boolean;
    outbound: boolean;
    health: boolean;
}

/**
 * Set by the client images. The health route exists for Docker's HEALTHCHECK, and an agent
 * installed on the host has nothing that would call it.
 */
function isRunningInContainer(): boolean {
    return process.env.PBCM_CONTAINER === "true";
}

export function getWebRoutes(): WebRoutes {
    return {
        statusPage: config.enableStatusPage,
        registerPage: config.enableRegisterPage,
        // Without a server URL the server has to dial in: to register an agent that has no
        // identity yet, with the setup PIN or the registration secret, and to reach one that has.
        outbound: !getServerUrl(),
        health: isRunningInContainer(),
    };
}

/**
 * Whether a request comes from this machine -- or, in a container, from inside the
 * container's own network namespace, which is where Docker runs a HEALTHCHECK.
 *
 * The socket's peer rather than `request.ip`, although the two agree while this Fastify runs
 * without `trustProxy`: this check must never start trusting a forwarding header should that
 * change. `isIpInCidr` strips the IPv4-mapped prefix and reads every other IPv6 address as 0,
 * which lies outside 127.0.0.0/8 -- so `::1` is the one IPv6 address to name.
 */
function isLoopback(request: FastifyRequest): boolean {
    const ip = request.socket.remoteAddress ?? "";
    return ip === "::1" || isIpInCidr(ip, "127.0.0.0/8");
}

export async function startWebServer() {
    const routes = getWebRoutes();
    const pages = routes.statusPage || routes.registerPage;

    if (!pages && !routes.outbound && !routes.health) {
        logger.info(
            "Web server not started: status page and register page are disabled, and the agent is not in outbound mode.",
        );
        return;
    }

    // Two calls rather than one conditional options object: `https` is what picks Fastify's
    // server type, so a ternary inside the argument leaves it with no overload to match.
    // The certificate and key were validated in Config.ts, so material that is present
    // here is material that works.
    const tls = readTlsMaterial();
    fastifyInstance = tls
        ? Fastify({ logger: false, https: { cert: tls.cert, key: tls.key } })
        : Fastify({ logger: false });
    const fastify = fastifyInstance;

    if (routes.outbound) {
        await fastify.register(fastifyWebSocket);
    }

    if (pages) {
        await registerPages(fastify, routes);
    }

    if (routes.health) {
        registerHealth(fastify);
    }

    if (routes.outbound) {
        registerOutbound(fastify);
    }

    // Without a page or the outbound routes nothing here is meant for another machine, and
    // the health route only answers loopback anyway -- so the socket need not be reachable.
    const host = pages || routes.outbound ? "0.0.0.0" : "127.0.0.1";
    try {
        const port = config.listenPort;
        await fastify.listen({ port, host });
        logger.info(
            {
                statusPage: routes.statusPage,
                registerPage: routes.registerPage,
                outbound: routes.outbound,
                health: routes.health,
            },
            `Client Web UI listening on ${host}:${port} (${config.tls ? "https" : "http"})`,
        );
    } catch (err) {
        logger.error({ err: err }, "Failed to start Client Web UI server");
    }
}

/**
 * Whether the register page is open right now. The route is settled at startup, the
 * registration state is not: the page is served only until the agent has an identity, and
 * from then on it answers like a page that does not exist. Registering a second time would
 * leave the client's old row on the server behind, jobs and history included, so there is
 * nothing a registered agent could do with it -- and the setup PIN that guards it is gone.
 */
function isRegisterPageOpen(routes: WebRoutes): boolean {
    return routes.registerPage && !isRegistered();
}

/** The status and register pages, their static files and the endpoints they call. */
async function registerPages(fastify: FastifyInstance, routes: WebRoutes) {
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

    // The static handler would otherwise serve a closed page as /status.html or
    // /register.html, next to the route that was left out on purpose. Asked per request,
    // because the register page closes when the agent is registered at runtime.
    const isHiddenFile = (pathName: string): boolean => {
        const file = path.posix.basename(pathName);
        if (file === "status.html") return !routes.statusPage;
        if (file === "register.html") return !isRegisterPageOpen(routes);
        return false;
    };

    if (publicPath) {
        logger.info(`Serving static files from ${publicPath}`);
        await fastify.register(fastifyStatic, {
            root: publicPath,
            prefix: "/",
            serve: true,
            allowedPath: (pathName) => !isHiddenFile(pathName),
        });
    } else {
        logger.error("Could not find public directory for Client Web UI!");
        logger.debug("Tried paths: " + possiblePaths.join(", "));
    }

    // Redirect / to the register page while it is open, to the status page otherwise.
    fastify.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
        if (isRegisterPageOpen(routes)) return reply.redirect("/register");
        if (routes.statusPage) return reply.redirect("/status");
        return reply.callNotFound();
    });

    const sendFileSafe = async (reply: FastifyReply, file: string) => {
        // `sendFile` exists on the reply only when @fastify/static registered above, and
        // that registration is conditional on the public directory being found. The cast
        // stays deliberately: the runtime check on the line is the whole point, and a
        // declaration claiming the method is always there would contradict it.
        const maybeStatic = reply as { sendFile?: (file: string) => unknown };
        if (typeof maybeStatic.sendFile === "function") {
            return maybeStatic.sendFile(file);
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
    if (routes.statusPage) {
        fastify.get(
            "/status",
            async (request: FastifyRequest, reply: FastifyReply) => {
                return sendFileSafe(reply, "status.html");
            },
        );
    }

    // Serve registration page
    if (routes.registerPage) {
        fastify.get(
            "/register",
            async (request: FastifyRequest, reply: FastifyReply) => {
                if (!isRegisterPageOpen(routes)) {
                    return routes.statusPage ? reply.redirect("/status") : reply.callNotFound();
                }
                return sendFileSafe(reply, "register.html");
            },
        );
    }

    // Check server reachability
    fastify.get(
        "/api/status/server",
        async (request: FastifyRequest, _reply: FastifyReply) => {
            const query = request.query as StatusQuery;
            const checkUrl = query.url || getServerUrl();
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
                } catch {
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
        async (_request: FastifyRequest, _reply: FastifyReply) => {
            return {
                hasAuthToken: isRegistered(),
                // Which of the two pages the other one may link to.
                registerPageOpen: isRegisterPageOpen(routes),
                statusPage: routes.statusPage,
            };
        },
    );

    if (routes.statusPage) registerStatusApi(fastify);
    if (routes.registerPage) registerRegisterApi(fastify, routes);
}

/** The endpoints only the status page calls. */
function registerStatusApi(fastify: FastifyInstance) {
    // Check current connection status
    fastify.get(
        "/api/status/connection",
        async (_request: FastifyRequest, _reply: FastifyReply) => {
            return {
                connected: Connection.isConnected(),
            };
        },
    );

    // Attempt to establish connection
    fastify.post(
        "/api/connect",
        async (_request: FastifyRequest, _reply: FastifyReply) => {
            const result = await Connection.connect();
            return {
                connected: result.connected,
                error: result.error,
            };
        },
    );
}

function registerHealth(fastify: FastifyInstance) {
    /**
     * Liveness for the container's HEALTHCHECK, and for nothing else: registered only in the
     * container image, and answering only loopback, which is where Docker runs the check.
     * Everyone else gets the 404 an absent route would give.
     *
     * It deliberately does **not** consult `Connection.isConnected()`. The agent is
     * offline-capable by design: it runs its jobs from its own data files
     * whether or not the server can be reached. Wiring the server
     * connection in here would translate every network hiccup into "agent broken"
     * and, under an orchestrator, into a restart that fixes nothing. The connection
     * has its own endpoint, `/api/status/connection`; the two must not be conflated.
     */
    fastify.get(
        "/api/health",
        async (request: FastifyRequest, reply: FastifyReply) => {
            if (!isLoopback(request)) {
                return reply.callNotFound();
            }
            try {
                // What the agent cannot work without: a data directory it can write to.
                // Every run, every schedule step and every job save lands there.
                fs.accessSync(DATA_DIR, fs.constants.W_OK);
                return { status: "ok" };
            } catch (err) {
                logger.error({ err }, "Health check failed: data directory not writable");
                return reply.code(503).send({ status: "error" });
            }
        },
    );
}

/**
 * The endpoint behind the register page. Registered only together with the page: without it
 * there is no legitimate caller, and this endpoint decides which server the agent obeys.
 * Open exactly as long as the page is -- see isRegisterPageOpen().
 */
function registerRegisterApi(fastify: FastifyInstance, routes: WebRoutes) {
    // API to perform registration
    fastify.post(
        "/api/register",
        async (request: FastifyRequest, reply: FastifyReply) => {
            // First, and as a 404: once the agent is registered the endpoint is closed, not
            // refusing. Answering before the PIN check gives nothing away that
            // /api/status/auth does not already say.
            if (!isRegisterPageOpen(routes)) {
                return reply.callNotFound();
            }

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

            if (!verifySetupPin(pin)) {
                logger.warn(
                    { ip: request.ip },
                    "Registration denied: wrong or missing setup PIN",
                );
                return reply.status(403).send({
                    error: "Wrong setup PIN. It is printed in this agent's log on startup.",
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
                    // Both are stored before anything else is reported: the server has
                    // registered this agent either way, so what is still open is only
                    // whether the agent will still know it after a restart.
                    const identityStored = setIdentity(data.clientId, data.token);
                    const urlStored = setServerUrl(url);
                    // There is an identity now, so the PIN has nothing left to protect.
                    clearSetupPin();
                    logger.info(
                        "Web Registration successful! Identity received.",
                    );

                    // The agent has been idling without an identity; now it has one.
                    await startAgentActivity();

                    // Reported rather than only logged: the registration worked and the
                    // agent is running, but it would come back unregistered. Whoever is
                    // standing in front of the register page is the one who can fix it,
                    // and they are not reading the log.
                    const warning = registrationWarning(identityStored, urlStored);
                    if (warning) logger.error(warning);

                    return {
                        success: true,
                        message: "Registration successful",
                        ...(warning ? { warning } : {}),
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
}

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
    isIpInNetworks(req.ip, config.allowedNetworks, true);

function registerOutbound(fastify: FastifyInstance) {
    // Outbound connection mode: the server dials this agent instead of the other way
    // round. Registration is open while the agent has no identity; the server presents the
    // setup PIN or PBCM_REGISTRATION_SECRET.
    fastify.get(
        "/ws/register",
        { websocket: true },
        (socket: WebSocket, req: FastifyRequest) => {
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
                    // The secret first: a wrong value then counts against the PIN only when it
                    // matched neither, and a right secret never costs the operator their PIN.
                    // The close reason stays "Invalid secret" for servers that match on it.
                    const accepted =
                        secretEquals(secret, getRegistrationSecret()) ||
                        verifySetupPin(secret);
                    if (!accepted) {
                        clearTimeout(timeout);
                        logger.warn(
                            { ip: req.ip },
                            "Registration rejected: wrong setup PIN or registration secret",
                        );
                        socket.send(
                            JSON.stringify({
                                type: WS_EVENTS.REGISTRATION_FAILURE,
                                payload: { error: "Wrong setup PIN or registration secret" },
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

                    const identityStored = setIdentity(clientId, authToken);
                    consumeRegistrationSecret();
                    // There is an identity now, so the PIN has nothing left to protect.
                    clearSetupPin();
                    clearTimeout(timeout);

                    // Logged, not sent back: the caller here is the server, which has
                    // registered this client either way. What a failed write costs is the
                    // next restart, and that is an operator's problem on this host.
                    if (!identityStored) {
                        logger.error(
                            "Registered, but the identity could not be written to the data directory -- " +
                                "this agent will come back unregistered after a restart.",
                        );
                    }

                    logger.info("Registration successful, identity stored");

                    // The scheduler was held back for the unregistered agent.
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
        (socket: WebSocket, req: FastifyRequest) => {
            if (!isFromAllowedNetwork(req)) {
                logger.warn(
                    { ip: req.ip },
                    "Agent connection denied: not in allowed networks",
                );
                socket.close(4003, "Access denied");
                return;
            }

            // The routes are settled at startup, the mode is not: an agent started for
            // outbound can still be registered inbound through its register page, and from
            // then on it dials the server itself.
            if (getAgentMode() !== "outbound") {
                logger.warn("Agent connection from the server rejected: not in outbound mode");
                socket.close(4003, "Not in outbound mode");
                return;
            }

            const { token, clientId } = (req.query as AgentQuery) ?? {};

            // The id is checked as well as the token: the server has to be dialling the
            // client it thinks it is, or a target address pointed at the wrong host
            // would hand that host somebody else's jobs.
            const identity = getIdentity();
            if (!secretEquals(token, identity?.authToken)) {
                logger.warn("Agent connection from the server rejected: invalid token");
                socket.close(4001, "Unauthorized");
                return;
            }

            if (!clientId || clientId !== identity?.clientId) {
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
