import { Connection } from "./core/Connection.js";
import { startWebServer, stopWebServer } from "./web/server.js";
import { config, isOutboundMode } from "./core/Config.js";
import { logger } from "./core/logger.js";
import { Scheduler } from "./features/Scheduler.js";
import { Executor } from "./features/Executor.js";
import { Cleanup } from "./features/Cleanup.js";
import { initDatabase } from "./core/Database.js";

// Initialize Database
await initDatabase();

// Perform cleanup of stale running jobs on startup
await Executor.cleanupRunningJobs();
await Executor.resumeQueuedJobs();

// Start Client Web Server (can be disabled via DISABLE_WEB_UI=true)
if (process.env.DISABLE_WEB_UI !== "true") {
    startWebServer();
} else {
    logger.info("Web UI disabled via DISABLE_WEB_UI environment variable.");
}

// Start Job Scheduler locally (independent of server connection)
Cleanup.initialize();
Scheduler.start();

// In outbound mode the server dials us: the agent only hosts /ws/register and /ws/agent
// and must not try to connect out (it has no server URL to connect to).
if (isOutboundMode()) {
    logger.info(
        "Outbound connection mode: waiting for the server to connect to this agent.",
    );
} else {
    Connection.connect();
}

// Handle graceful shutdown
const shutdown = async () => {
    logger.info("Received shutdown signal, terminating client...");
    await stopWebServer();
    process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
