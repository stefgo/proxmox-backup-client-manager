import { Connection } from "./core/Connection.js";
import { startWebServer, stopWebServer } from "./web/server.js";
import { config } from "./core/Config.js";
import { Logger } from "./core/Logger.js";
import { Scheduler } from "./features/Scheduler.js";
import { Executor } from "./features/Executor.js";

// Perform cleanup of stale running jobs on startup
await Executor.cleanupRunningJobs();
await Executor.resumeQueuedJobs();

// Start Client Web Server (can be disabled via DISABLE_WEB_UI=true)
if (process.env.DISABLE_WEB_UI !== "true") {
    startWebServer();
} else {
    Logger.info("Web UI disabled via DISABLE_WEB_UI environment variable.");
}

// Start Job Scheduler locally (independent of server connection)
Scheduler.start();

// Try to connect to server
Connection.connect();

// Handle graceful shutdown
const shutdown = async () => {
    Logger.info("Received shutdown signal, terminating client...");
    await stopWebServer();
    process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
