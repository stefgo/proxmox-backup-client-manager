import { startWebServer, stopWebServer } from "./web/server.js";
import { logger } from "@pbcm/shared/node";
import { startAgentActivity } from "./core/Lifecycle.js";
import { importLegacyDatabase } from "./core/LegacyImport.js";
import { isRegistered } from "./core/Identity.js";
import { logSetupPin } from "./core/SetupPin.js";
import { ensureDataDir } from "./core/DataStore.js";
import { config } from "./core/Config.js";
import { getRegistrationSecret, getServerUrl } from "./core/RegistrationState.js";

ensureDataDir();

// An agent that still has its SQLite database moves its jobs into the data files first.
await importLegacyDatabase();

// Start Client Web Server. Which routes it serves -- and whether it starts at all -- follows
// from config.yaml; see getWebRoutes(). It runs whether or not the agent is registered: the
// register page and /ws/register are the surfaces it is registered through.
await startWebServer();

// The setup PIN guards /api/register and /ws/register and only matters while there is no
// identity yet: with the register page served, or without a serverUrl, where the server
// registers the agent -- unless a PBCM_REGISTRATION_SECRET is set for that, in which case the
// agent gets no second way in. Printed here rather than inside the web server so it lands
// after the "listening on" line, where an operator is already looking.
const outboundPin = !getServerUrl() && !getRegistrationSecret();
if (!isRegistered() && (config.enableRegisterPage || outboundPin)) {
    logSetupPin();
}

// Scheduler and the server connection start only for a registered agent. An
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

// Registered only after initialization completed, so a failed startup (import,
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
