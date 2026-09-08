import { startWebServer, stopWebServer } from "./web/server.js";
import { logger } from "@pbcm/shared/node";
import { startAgentActivity } from "./core/Lifecycle.js";
import { initDatabase } from "./core/Database.js";

// Initialize Database
await initDatabase();

// Start Client Web Server (can be disabled via DISABLE_WEB_UI=true). It runs whether or not
// the agent is registered — it is the surface an operator registers it through.
if (process.env.DISABLE_WEB_UI !== "true") {
    startWebServer();
} else {
    logger.info("Web UI disabled via DISABLE_WEB_UI environment variable.");
}

// Scheduler, cleanup and the server connection start only for a registered agent. An
// unregistered one idles here until a registration lets startAgentActivity through.
await startAgentActivity();

// Handle graceful shutdown
const shutdown = async () => {
    logger.info("Received shutdown signal, terminating client...");
    await stopWebServer();
    process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Registered only after initialization completed, so a failed startup (migration,
// config) still fails fast instead of being swallowed here.

// The agent has to survive a stray rejection: it is the only thing triggering the
// scheduled backups on this machine, and nobody is watching it interactively.
process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "Unhandled promise rejection");
});

// An uncaught exception leaves the process in an unknown state. Log it and exit so
// a supervisor restarts us; cleanupRunningJobs() then tidies up the history rows of
// any run that was cut short.
process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception, terminating");
    // Give the pino transport worker a moment to flush before we go.
    setTimeout(() => process.exit(1), 250);
});
