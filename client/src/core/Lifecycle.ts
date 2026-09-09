import { logger } from "@pbcm/shared/node";
import { config, isOutboundMode, isRegistered } from "./Config.js";
import { Connection } from "./Connection.js";
import { Cleanup } from "../features/Cleanup.js";
import { Executor } from "../features/Executor.js";
import { Scheduler } from "../features/Scheduler.js";

/**
 * The single gate between "this process is running" and "this agent is working".
 *
 * Everything the agent does happens under its identity: a backup is filed in PBS under
 * `--backup-id`, a status update names a client the server has to recognise, a history row
 * is synced to that client's history. Without a registration there is no identity to do any
 * of it under, so an unregistered agent starts nothing at all -- it serves its Web UI and
 * waits to be registered.
 *
 * Two paths lead here, which is why the gate is one function instead of a check repeated at
 * each starting point: the process starting up already registered, and a registration
 * completing while the process runs. The second one is why this cannot live in index.ts --
 * an agent registered through its Web UI has to start working without being restarted.
 */
let activityStarted = false;

export async function startAgentActivity(): Promise<boolean> {
    if (!isRegistered()) {
        logger.warn(
            "Client is not registered — no jobs will run. Register it via the Web UI " +
                `(port ${config.listenPort}) or, in outbound mode, from the server.`,
        );
        return false;
    }

    // Both entry points may call this, and a second call must not schedule a second timer
    // or replay the queue.
    if (activityStarted) return true;
    activityStarted = true;

    logger.info({ clientId: config.clientId }, "Starting agent activity");

    // Tidy up what a previous process left behind before anything new is started, so a run
    // cut short by a restart does not stay 'running' forever.
    await Executor.cleanupRunningJobs();
    await Executor.resumeQueuedJobs();

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

    return true;
}
