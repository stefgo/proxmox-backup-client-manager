import { logger } from "@pbcm/shared/node";
import { config } from "./Config.js";
import { getIdentity, isRegistered } from "./Identity.js";
import { getAgentMode, getRegistrationSecret, getServerUrl } from "./RegistrationState.js";
import { Connection } from "./Connection.js";
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
        // Only the ways that are actually open: an operator told to use a page that is
        // switched off would go looking for a fault that is not there.
        const ways: string[] = [];
        if (config.enableRegisterPage) {
            ways.push(`via the register page (port ${config.listenPort})`);
        }
        if (!getServerUrl()) {
            ways.push(
                getRegistrationSecret()
                    ? "from the server (outbound mode, with PBCM_REGISTRATION_SECRET)"
                    : "from the server (outbound mode, with the setup PIN above)",
            );
        }
        logger.warn(
            ways.length > 0
                ? `Client is not registered — no jobs will run. Register it ${ways.join(" or ")}.`
                : "Client is not registered — no jobs will run, and there is no way to register it: " +
                      "enable the register page, or remove the serverUrl so the server can register it (outbound mode).",
        );
        return false;
    }

    // Both entry points may call this, and a second call must not schedule a second timer
    // or replay the queue.
    if (activityStarted) return true;
    activityStarted = true;

    logger.info({ clientId: getIdentity()?.clientId }, "Starting agent activity");

    // Tidy up what a previous process left behind before anything new is started, so a run
    // cut short by a restart does not stay 'running' forever.
    await Executor.cleanupRunningJobs();
    await Executor.resumeQueuedJobs();

    Scheduler.start();

    // In outbound mode the server dials us: the agent only hosts /ws/register and /ws/agent
    // and must not try to connect out (it has no server URL to connect to).
    if (getAgentMode() === "outbound") {
        logger.info(
            "Outbound connection mode: waiting for the server to connect to this agent.",
        );
    } else {
        Connection.connect();
    }

    return true;
}
