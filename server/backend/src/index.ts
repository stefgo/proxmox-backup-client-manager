import "dotenv/config";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import cors from "@fastify/cors";
import staticFiles from "@fastify/static";
import jwt from "@fastify/jwt";
import path from "path";
import { fileURLToPath } from "url";

import { initOIDC, appConfig } from "./config/AppConfig.js";
import { AuthService } from "./services/AuthService.js";
import apiRoutes from "./routes/api.js";
import { WebSocketController } from "./controllers/WebSocketController.js";
import { CleanupService } from "./services/CleanupService.js";
import { ClientConnector } from "./services/ClientConnector.js";
import { TunnelService } from "./services/TunnelService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { initDatabase } from "./core/Database.js";

// Initialize Database & Services
await initDatabase();
await initOIDC();
await AuthService.initializeAdmin(); // Ensure admin user
await CleanupService.initialize();

import { loggerOptions } from "@pbcm/shared/node";

const server = Fastify({
    // Trust Proxy is required for correct IP detection behind Traefik
    trustProxy: true,
    disableRequestLogging: true,
    logger: loggerOptions,
});

// Custom Logging Hooks
server.addHook("onRequest", async (req) => {
    req.log.debug({ req: req }, "incoming request");
});

server.addHook("onResponse", async (req, reply) => {
    if (reply.statusCode >= 500) {
        req.log.error(
            { res: reply, responseTime: reply.elapsedTime },
            "request errored",
        );
    } else if (reply.statusCode >= 400) {
        req.log.warn(
            { res: reply, responseTime: reply.elapsedTime },
            "request failed",
        );
    } else {
        req.log.debug(
            { res: reply, responseTime: reply.elapsedTime },
            "request completed",
        );
    }
});

// Plugins
await server.register(cors);
await server.register(jwt, {
    secret: appConfig.jwtSecret,
    sign: appConfig.jwtExpiresIn ? { expiresIn: appConfig.jwtExpiresIn } : {},
});

await server.register(staticFiles, {
    root: path.join(__dirname, "../../dist/public"),
    prefix: "/",
});

await server.register(websocket);

// API Routes
server.register(apiRoutes, { prefix: "/api" });

// WebSocket Routes
server.register(async function (fastify) {
    fastify.get("/ws/dashboard", { websocket: true }, (con, req) =>
        WebSocketController.handleDashboardConnection(con, req, fastify),
    );
    fastify.get("/ws/agent", { websocket: true }, (con, req) =>
        WebSocketController.handleAgentConnection(con, req, fastify),
    );
});

// Catch-all for SPA
server.setNotFoundHandler(async (request, reply) => {
    if (request.raw.url && request.raw.url.startsWith("/api")) {
        return reply.code(404).send({ error: "Endpoint not found" });
    }
    return reply.sendFile("index.html");
});

// Start
try {
    await server.listen({
        port: 3000,
        host: "0.0.0.0",
    });
} catch (err) {
    server.log.error(err);
    process.exit(1);
}

// Dial every outbound client. Tunnels are NOT opened here — they are established
// on demand when a client requests a lease for a run.
ClientConnector.connectAll().catch((err) =>
    server.log.error({ err }, "Failed to connect outbound clients on startup"),
);

const shutdown = () => {
    server.log.info("Shutting down server...");
    TunnelService.shutdown();
    server.close(() => {
        process.exit(0);
    });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Registered only after listen() succeeded, so a failed startup (migration,
// OIDC, port already taken) still fails fast instead of being swallowed here.

// A rejected promise must not take the control plane down: agents would lose
// their WebSocket and every scheduled run would report as offline.
process.on("unhandledRejection", (reason) => {
    server.log.error({ err: reason }, "Unhandled promise rejection");
});

// An uncaught exception leaves the process in an unknown state. Log it and let
// the supervisor restart us (compose.yaml: restart: unless-stopped).
process.on("uncaughtException", (err) => {
    server.log.fatal({ err }, "Uncaught exception, terminating");
    TunnelService.shutdown();
    // Give the pino transport worker a moment to flush before we go.
    setTimeout(() => process.exit(1), 250);
});
