import { JobHistoryRepository } from "../repositories/JobHistoryRepository.js";
import { JobRepository } from "../repositories/JobRepository.js";
import { config } from "../core/Config.js";
import { isRegistered } from "../core/Identity.js";
import {
    WS_EVENTS,
    JOB_STATUS,
    JOB_PHASE,
    RestoreSnapshotPayload,
    BackupJob,
    type RunSnapshotDetails,
} from "@pbcm/shared";
import { logger } from "@pbcm/shared/node";
import { Connection } from "../core/Connection.js";
import { ProcessRunner } from "./execution/ProcessRunner.js";
import {
    KEYFILE_PREFIX,
    writeTempKeyfile,
    removeTempKeyfile,
    applyRepositoryEnv,
} from "./execution/RunPreparation.js";
import {
    buildBackupArgs,
    buildRestoreArgs,
} from "./execution/CommandBuilder.js";
import { querySnapshot } from "./execution/SnapshotQuery.js";
import { TunnelClient, TunnelLease } from "./TunnelClient.js";
import type { HistoryRow } from "../repositories/JobHistoryRepository.js";

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
     * Interrupted tunnel backups waiting for the server: their lease can only be requested
     * once it is connected. They stay `running` until then -- never a provisional `abort`,
     * which would be a second final status and a second webhook.
     */
    private static deferredChecks = new Map<string, HistoryRow>();

    /**
     * Settles the runs a previous agent process left `running`, on startup and before the
     * server is connected.
     *
     * A backup that knows its snapshot is looked up on the PBS first: it may well have
     * finished -- the process ended during the snapshot query, or after the backup and
     * before its status was written. Found and finished, it becomes `success`; otherwise
     * `abort`, as every other leftover run. A tunnel backup cannot be looked up yet (the
     * lease needs the server) and is checked once the connection is there.
     */
    static async cleanupRunningJobs() {
        logger.info("Checking for stale 'running' jobs in history...");
        try {
            for (const run of JobHistoryRepository.findInterruptedBackups()) {
                const job = run.job_id ? Executor.loadJobConfig(run.job_id) : null;
                if (job?.tunnel?.required) {
                    Executor.deferredChecks.set(run.id, run);
                    continue;
                }
                await Executor.checkInterruptedBackup(run, job);
            }

            const changes = JobHistoryRepository.cleanUpRunningJobs(
                new Set(Executor.deferredChecks.keys()),
            );
            if (changes > 0) {
                logger.info(`Updated ${changes} stale jobs to 'abort' status.`);
            }
            if (Executor.deferredChecks.size > 0) {
                logger.info(
                    { runs: [...Executor.deferredChecks.keys()] },
                    "Interrupted tunnel backups are checked once the server is connected",
                );
            }
        } catch (e) {
            logger.error({ err: e }, "Failed to cleanup stale running jobs");
        }
    }

    /**
     * Checks the tunnel backups `cleanupRunningJobs` held back. Called on every
     * authenticated connection; each run is taken out of the list before it is checked,
     * so a reconnect does not check it twice.
     */
    static async checkDeferredBackups() {
        const runs = [...Executor.deferredChecks.values()];
        Executor.deferredChecks.clear();
        for (const run of runs) {
            Connection.send(WS_EVENTS.STATUS_UPDATE, {
                id: run.id,
                jobId: run.job_id ?? undefined,
                name: run.name || "Unknown Backup",
                startTime: run.start_time,
                status: JOB_STATUS.RUNNING,
                type: run.type,
                phase: JOB_PHASE.SNAPSHOT,
                snapshot: run.snapshot,
            });
            const job = run.job_id ? Executor.loadJobConfig(run.job_id) : null;
            await Executor.checkInterruptedBackup(run, job);
        }
    }

    /** The stored configuration of a job, or null if there is none any more. */
    private static loadJobConfig(jobId: string): Partial<BackupJob> | null {
        try {
            const row = JobRepository.findById(jobId);
            return row?.config ? JSON.parse(row.config as string) : null;
        } catch (e) {
            logger.warn({ err: e, jobId }, "Could not read the job config");
            return null;
        }
    }

    /**
     * Looks up the snapshot of an interrupted backup on the PBS and gives the run its final
     * status. Never throws: a question that cannot be asked ends in `abort`, with the reason
     * as `snapshotError`, so the history shows that the status was not verified.
     */
    private static async checkInterruptedBackup(
        run: HistoryRow,
        job: Partial<BackupJob> | null,
    ): Promise<void> {
        const snapshot = run.snapshot as string;
        const abort = (note: string, error: string | null) => {
            JobHistoryRepository.settleInterruptedBackup(run.id, JOB_STATUS.ABORTED, note, {
                details: null,
                error,
            });
            Executor.reportSettled(run, JOB_STATUS.ABORTED, null, error);
        };

        if (!job?.repository) {
            abort(
                "Aborted on agent restart; the snapshot could not be checked.",
                "The job or its repository no longer exists",
            );
            return;
        }

        const env: NodeJS.ProcessEnv = { ...process.env };
        let lease: TunnelLease | undefined;
        try {
            const password = await applyRepositoryEnv(env, job.repository, {
                tunnelRequired: !!job.tunnel?.required,
                jobId: run.job_id ?? undefined,
            });
            if (job.tunnel?.required) {
                lease = await TunnelClient.acquire(run.id, run.job_id ?? undefined);
                env.PBS_REPOSITORY = TunnelClient.buildRepositoryValue(job.repository, lease);
                if (lease.fingerprint) env.PBS_FINGERPRINT = lease.fingerprint;
            }

            const result = await querySnapshot({
                snapshot,
                command: config.executable || "proxmox-backup-client",
                env,
                password,
            });

            if (result.details) {
                logger.info({ runId: run.id, snapshot }, "Interrupted backup had finished; marked as success");
                JobHistoryRepository.settleInterruptedBackup(
                    run.id,
                    JOB_STATUS.SUCCESS,
                    "Status after agent restart: the snapshot was found on the PBS.",
                    { details: result.details, error: null },
                );
                Executor.reportSettled(run, JOB_STATUS.SUCCESS, result.details, null);
            } else if (result.notFinished) {
                abort("Aborted on agent restart; the backup did not finish.", null);
            } else {
                abort("Aborted on agent restart; the snapshot could not be checked.", result.error);
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            logger.warn({ err: e, runId: run.id }, "Could not check an interrupted backup");
            abort("Aborted on agent restart; the snapshot could not be checked.", message);
        } finally {
            TunnelClient.release(lease);
        }
    }

    /**
     * Tells a connected server about a run settled after a restart. Before the connection
     * this goes nowhere, and the history sync carries the run instead.
     */
    private static reportSettled(
        run: HistoryRow,
        status: string,
        details: RunSnapshotDetails | null,
        error: string | null,
    ) {
        if (!Connection.isConnected()) return;
        Connection.send(WS_EVENTS.STATUS_UPDATE, {
            id: run.id,
            jobId: run.job_id ?? undefined,
            name: run.name || "Unknown Backup",
            startTime: run.start_time,
            endTime: new Date().toISOString(),
            status,
            type: run.type,
            phase: null,
            snapshot: run.snapshot,
            snapshotDetails: details,
            snapshotError: error,
        });
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
     * Executes a backup job. Resolves the job configuration from the local jobs.json,
     * mounts repository credentials and processes encryption keys, then hands the
     * finished command line to runProxmoxClient.
     *
     * @param runId - A unique identifier for this specific execution run.
     * @param jobId - The ID of the job configuration to execute.
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
        const command = config.executable || "proxmox-backup-client";
        let args: string[];
        const env: NodeJS.ProcessEnv = { ...process.env };
        // The job's stored config column, parsed. Partial because a row may hold no
        // config at all, and nothing here validates what JSON.parse returns.
        let jobConfigData: Partial<BackupJob>;

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
            ProcessRunner.finishFailedRun(
                runId,
                jobId,
                jobName || "Unknown Backup",
                new Date().toISOString(),
                "backup",
                "Config resolution failed: " +
                    (e instanceof Error ? e.message : String(e)),
            );
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
            // A job that asks for encryption and has no key must not quietly fall back
            // to a plain-text backup; failing the run is what tells the operator.
            if (
                jobConfigData.encryption?.enabled &&
                !jobConfigData.encryption.keyContent
            ) {
                throw new Error(
                    "Encryption is enabled for this job but no key is stored — refusing to run an unencrypted backup.",
                );
            }

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
                        { cause: e },
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
            ProcessRunner.finishFailedRun(
                runId,
                jobId,
                displayName,
                startTime,
                jobType,
                "Config resolution failed: " +
                    (e instanceof Error ? e.message : String(e)),
            );
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
                ProcessRunner.finishFailedRun(
                    runId,
                    jobId,
                    displayName,
                    startTime,
                    jobType,
                    "Pre-execution script failed. Operation aborted.",
                );
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
        const { snapshot, repository, encryption } = payload;
        let pbsPassword: string | undefined;
        let tempKeyfilePath: string | undefined;
        const command = config.executable || "proxmox-backup-client";
        let args: string[];
        const env: NodeJS.ProcessEnv = { ...process.env };
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
                        KEYFILE_PREFIX.restore,
                    );
                } catch (e: unknown) {
                    logger.error(
                        { err: e },
                        "Failed to write restore encryption key file",
                    );
                    throw new Error(
                        "Failed to write restore encryption key file: " +
                            (e instanceof Error ? e.message : String(e)),
                        { cause: e },
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
                    throw new Error("Invalid repository configuration", {
                        cause: e,
                    });
                }
            }

            args = buildRestoreArgs(payload, { keyfilePath: tempKeyfilePath });
        } catch (e: unknown) {
            logger.error({ err: e }, "Restore Config Error:");
            ProcessRunner.finishFailedRun(
                runId,
                undefined,
                jobName,
                startTime,
                jobType,
                "Config resolution failed: " +
                    (e instanceof Error ? e.message : String(e)),
            );
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
