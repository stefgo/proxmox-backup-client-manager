import { JobHistoryRepository } from "../repositories/JobHistoryRepository.js";
import { JobRepository } from "../repositories/JobRepository.js";
import { config, isRegistered } from "../core/Config.js";
import {
    WS_EVENTS,
    ProtocolMap,
    JOB_STATUS,
    RestoreSnapshotPayload,
} from "@pbcm/shared";
import { logger } from "@pbcm/shared/node";
import { Connection } from "../core/Connection.js";
import { ProcessRunner } from "./execution/ProcessRunner.js";
import {
    writeTempKeyfile,
    removeTempKeyfile,
    applyRepositoryEnv,
} from "./execution/RunPreparation.js";
import {
    buildBackupArgs,
    buildRestoreArgs,
} from "./execution/CommandBuilder.js";

export interface JobHistoryRow {
    id: string;
    job_id: string | null;
    name: string | null;
    type: string;
    status: string;
    start_time: string;
    end_time: string | null;
    exit_code: number | null;
    stdout: string | null;
    stderr: string | null;
}

export interface JobRow {
    id: string;
    name: string;
    config: string;
    schedule_enabled: number;
    schedule: string;
}

export class Executor {
    private static runningJobs = new Set<string>();
    private static pendingJobs = new Map<string, string>();

    /**
     * Cleans up stale jobs from the history table that are still marked as 'running'
     * by setting their status to 'abort'. This usually runs on client agent startup
     * to ensure no ghost jobs remain.
     */
    static async cleanupRunningJobs() {
        logger.info("Checking for stale 'running' jobs in history...");
        try {
            const changes = JobHistoryRepository.cleanUpRunningJobs();

            if (changes > 0) {
                logger.info(`Updated ${changes} stale jobs to 'abort' status.`);
            }
        } catch (e) {
            logger.error({ err: e }, "Failed to cleanup stale running jobs");
        }
    }

    /**
     * Resumes any jobs that were marked as 'queued' when the daemon was shut down or crashed.
     */
    static async resumeQueuedJobs() {
        logger.info("Checking for queued jobs to resume...");
        try {
            const queuedJobs = JobHistoryRepository.findQueuedJobs();

            for (const job of queuedJobs) {
                const jobId = job.job_id;
                if (!jobId) continue;
                logger.info(
                    `Resuming queued job ${jobId} (runId: ${job.id})...`,
                );
                const delayMs = (config.queueDelaySeconds || 5) * 1000;
                setTimeout(() => {
                    Executor.executeBackup(job.id, jobId);
                }, delayMs);
            }
        } catch (e) {
            logger.error({ err: e }, "Failed to resume queued jobs");
        }
    }

    /**
     * Frees the concurrency slot of a job and hands it over to a run that queued up
     * while this one was busy. Every exit path of executeBackup has to go through
     * here: leaving jobId in runningJobs blocks all later runs of that job until the
     * agent restarts, and dropping a pendingJobs entry leaves its history row on
     * 'queued' forever.
     */
    private static releaseJobSlot(jobId: string) {
        this.runningJobs.delete(jobId);

        const queuedRunId = this.pendingJobs.get(jobId);
        if (!queuedRunId) return;
        this.pendingJobs.delete(jobId);

        const delayMs = (config.queueDelaySeconds || 5) * 1000;
        logger.info(`Restarting queued job ${jobId} in ${delayMs / 1000}s...`);
        setTimeout(() => {
            Executor.executeBackup(queuedRunId, jobId);
        }, delayMs);
    }

    /**
     * Executes a backup job. Resolves the job configuration from the local database,
     * mounts repository credentials and processes encryption keys, then hands the
     * finished command line to runProxmoxClient.
     *
     * @param runId - A unique identifier for this specific execution run.
     * @param jobId - The database ID of the job configuration to execute.
     */
    static async executeBackup(runId: string, jobId: string) {
        // Backstop to the lifecycle gate in core/Lifecycle.ts. Nothing should reach here
        // unregistered -- the scheduler is not running and the socket cannot be opened --
        // but a run that did would be filed in PBS under this machine's hostname, which is
        // what --backup-id falls back to, and belong to no client at all.
        if (!isRegistered()) {
            const message =
                "Backup refused: this client is not registered and has no identity to back up under.";
            logger.error({ jobId }, message);
            ProcessRunner.finishFailedRun(
                runId,
                jobId,
                "Unknown Backup",
                new Date().toISOString(),
                "backup",
                message,
            );
            return;
        }

        let jobName: string | undefined;
        let pbsPassword: string | undefined;
        let tempKeyfilePath: string | undefined;
        let command = config.executable || "proxmox-backup-client";
        let args: string[] = [];
        let env: NodeJS.ProcessEnv = { ...process.env };
        let jobConfigData: any = {};

        try {
            const jobConfig = JobRepository.findById(jobId);
            if (jobConfig) {
                jobName = jobConfig.name;
                jobConfigData = jobConfig.config
                    ? JSON.parse(jobConfig.config as string)
                    : {};
            } else {
                throw new Error("Config not found locally for job " + jobId);
            }
        } catch (e: unknown) {
            logger.error({ err: e }, "Job Config Resolution Error:");
            const statusPayload: ProtocolMap["STATUS_UPDATE"]["req"] = {
                id: runId,
                jobId: jobId,
                name: jobName || "Unknown Backup",
                startTime: new Date().toISOString(),
                status: JOB_STATUS.FAILED,
                error:
                    "Config resolution failed: " +
                    (e instanceof Error ? e.message : String(e)),
                stderr: e instanceof Error ? e.message : String(e),
                type: "backup",
            };
            Connection.send(WS_EVENTS.STATUS_UPDATE, statusPayload);
            return;
        }

        if (this.runningJobs.has(jobId)) {
            if (this.pendingJobs.has(jobId)) {
                logger.warn(
                    `Job ${jobId} is already running and already has a pending trigger. Skipping additional request.`,
                );
                // Create a history entry for the skipped job
                try {
                    JobHistoryRepository.insertSkippedJob(
                        runId,
                        jobId,
                        jobName,
                        "Job already running and another one is already queued.",
                    );
                } catch (e) {
                    logger.error({ err: e }, "Failed to log skipped job");
                }

                Connection.send(WS_EVENTS.STATUS_UPDATE, {
                    id: runId,
                    jobId: jobId,
                    name: jobName || "Unknown Backup",
                    startTime: new Date().toISOString(),
                    endTime: new Date().toISOString(),
                    status: JOB_STATUS.SKIPPED,
                    error: "Job already running and another one is already queued.",
                    type: "backup",
                });
                return;
            }

            logger.info(
                `Job ${jobId} is already running. Queuing for restart.`,
            );
            this.pendingJobs.set(jobId, runId);

            try {
                JobHistoryRepository.insertNewJob(
                    runId,
                    jobId,
                    "backup",
                    JOB_STATUS.QUEUED,
                    new Date().toISOString(),
                    jobName || "",
                );
            } catch (e) {
                logger.error({ err: e }, "DB Log Error for queued job");
            }

            Connection.send(WS_EVENTS.STATUS_UPDATE, {
                id: runId,
                jobId: jobId,
                name: jobName || "Unknown Backup",
                startTime: new Date().toISOString(),
                status: JOB_STATUS.QUEUED,
                type: "backup",
            });
            return;
        }

        this.runningJobs.add(jobId);

        const jobType = "backup";
        const displayName = jobName || "Unknown Backup";
        const startTime = new Date().toISOString();

        try {
            // Encryption: write keyContent to a temp file and configure --keyfile
            if (jobConfigData.encryption?.keyContent) {
                try {
                    tempKeyfilePath = writeTempKeyfile(
                        runId,
                        jobConfigData.encryption.keyContent,
                    );
                } catch (e: unknown) {
                    logger.error(
                        { err: e },
                        "Failed to write encryption key file",
                    );
                    throw new Error(
                        "Failed to write encryption key file: " +
                            (e instanceof Error ? e.message : String(e)),
                    );
                }
            }

            if (jobConfigData.repository) {
                try {
                    pbsPassword = await applyRepositoryEnv(
                        env,
                        jobConfigData.repository,
                        {
                            tunnelRequired: !!jobConfigData.tunnel?.required,
                            jobId,
                        },
                    );
                } catch (e) {
                    logger.error(
                        { err: e },
                        `Error parsing PBS config for job ${jobName}`,
                    );
                }
            }

            args = buildBackupArgs(jobConfigData, {
                keyfilePath: tempKeyfilePath,
            });
        } catch (e: unknown) {
            logger.error({ err: e }, "Job Config Resolution Error:");
            const statusPayload: ProtocolMap["STATUS_UPDATE"]["req"] = {
                id: runId,
                jobId: jobId,
                name: displayName,
                startTime: startTime,
                status: JOB_STATUS.FAILED,
                error:
                    "Config resolution failed: " +
                    (e instanceof Error ? e.message : String(e)),
                stderr: e instanceof Error ? e.message : String(e),
                type: jobType,
            };
            Connection.send(WS_EVENTS.STATUS_UPDATE, statusPayload);
            removeTempKeyfile(tempKeyfilePath);
            this.releaseJobSlot(jobId);
            return;
        }

        // Pre-Execution Script
        if (config.preScript) {
            const success = await ProcessRunner.runScript(
                config.preScript,
                jobType,
                displayName,
                runId,
            );
            if (!success) {
                logger.error("Aborting backup due to pre-script failure.");
                const statusPayload: ProtocolMap["STATUS_UPDATE"]["req"] = {
                    id: runId,
                    jobId: jobId,
                    name: displayName,
                    startTime: startTime,
                    status: JOB_STATUS.FAILED,
                    error: "Pre-execution script failed. Operation aborted.",
                    stderr: "Pre-execution script failed. Operation aborted.",
                    type: jobType,
                };
                Connection.send(WS_EVENTS.STATUS_UPDATE, statusPayload);
                removeTempKeyfile(tempKeyfilePath);
                this.releaseJobSlot(jobId);
                return;
            }
        }

        await ProcessRunner.runProxmoxClient({
            runId,
            jobId,
            jobType,
            jobName: displayName,
            startTime,
            command,
            args,
            env,
            password: pbsPassword,
            keyfilePath: tempKeyfilePath,
            repository: jobConfigData.repository,
            tunnelRequired: !!jobConfigData.tunnel?.required,
            // Hands the slot back and starts whatever queued up behind this run.
            onSlotRelease: () => Executor.releaseJobSlot(jobId),
        });
    }

    /**
     * Executes a restore operation. Resolves the snapshot, target path and encryption
     * key into a command line, then hands it to runProxmoxClient.
     *
     * @param runId - A unique identifier for this specific restore run.
     * @param payload - Payload containing restore configuration (snapshot, targetPath, etc.).
     */
    static async executeRestore(
        runId: string,
        payload: RestoreSnapshotPayload,
    ) {
        const { snapshot, targetPath, repository, archives, encryption } =
            payload;
        let pbsPassword: string | undefined;
        let tempKeyfilePath: string | undefined;
        let command = config.executable || "proxmox-backup-client";
        let args: string[] = [];
        let env: NodeJS.ProcessEnv = { ...process.env };
        const jobType = "restore";
        const jobName = `Restore: ${snapshot}`;

        const startTime = new Date().toISOString();

        // Same gate as executeBackup: an unregistered agent has no client to report this
        // run to, so it does not start one.
        if (!isRegistered()) {
            const message =
                "Restore refused: this client is not registered.";
            logger.error({ runId }, message);
            ProcessRunner.finishFailedRun(
                runId,
                undefined,
                jobName,
                startTime,
                jobType,
                message,
            );
            return;
        }

        try {
            if (encryption?.keyContent) {
                try {
                    // Own prefix, as before: the two kinds of run are told apart in
                    // /tmp at a glance when something is left behind.
                    tempKeyfilePath = writeTempKeyfile(
                        runId,
                        encryption.keyContent,
                        "pbcm_restore_key",
                    );
                } catch (e: unknown) {
                    logger.error(
                        { err: e },
                        "Failed to write restore encryption key file",
                    );
                    throw new Error(
                        "Failed to write restore encryption key file: " +
                            (e instanceof Error ? e.message : String(e)),
                    );
                }
            }

            if (repository) {
                try {
                    pbsPassword = await applyRepositoryEnv(env, repository, {
                        tunnelRequired: !!payload?.tunnel?.required,
                    });
                } catch (e) {
                    logger.error(
                        { err: e },
                        `Error parsing PBS config for restore`,
                    );
                    throw new Error("Invalid repository configuration");
                }
            }

            args = buildRestoreArgs(payload, { keyfilePath: tempKeyfilePath });
        } catch (e: unknown) {
            logger.error({ err: e }, "Restore Config Error:");
            const statusPayload: ProtocolMap["STATUS_UPDATE"]["req"] = {
                id: runId,
                name: jobName,
                startTime: startTime,
                status: JOB_STATUS.FAILED,
                error:
                    "Config resolution failed: " +
                    (e instanceof Error ? e.message : String(e)),
                stderr: e instanceof Error ? e.message : String(e),
                type: jobType,
            };
            Connection.send(WS_EVENTS.STATUS_UPDATE, statusPayload);
            removeTempKeyfile(tempKeyfilePath);
            return;
        }

        await ProcessRunner.runProxmoxClient({
            runId,
            jobType,
            jobName,
            startTime,
            command,
            args,
            env,
            password: pbsPassword,
            keyfilePath: tempKeyfilePath,
            repository,
            tunnelRequired: !!payload?.tunnel?.required,
            // A restore holds no slot: it is not scheduled and cannot queue.
        });
    }
}
