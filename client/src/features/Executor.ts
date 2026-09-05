import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { JobHistoryRepository } from "../repositories/JobHistoryRepository.js";
import { JobRepository } from "../repositories/JobRepository.js";
import { config } from "../core/Config.js";
import {
    WS_EVENTS,
    ProtocolMap,
    JOB_STATUS,
    RestoreSnapshotPayload,
} from "@pbcm/shared";
import { logger } from "../core/logger.js";
import { Connection } from "../core/Connection.js";
import { TunnelClient, TunnelLease } from "./TunnelClient.js";
import { probeCertificate, normalizeFingerprint } from "../core/CertProbe.js";

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
     * Removes the temporary keyfile written for a run. The file holds the PBS
     * encryption key in plaintext, so it has to be dropped on every exit path --
     * success, failure and early abort alike.
     */
    private static removeTempKeyfile(keyfilePath: string | undefined) {
        if (!keyfilePath) return;
        try {
            fs.rmSync(keyfilePath, { force: true });
        } catch (e) {
            logger.error(
                { err: e, keyfilePath },
                "Failed to delete temp keyfile",
            );
        }
    }

    /**
     * Runs a pre- or post-execution script if configured.
     * The script is executed with two arguments: the operation type (backup/restore) and the job name.
     * Script output (stdout/stderr) is streamed to the server via WebSocket.
     *
     * scriptPath is executed directly, without a shell. It must therefore be an
     * executable file (shebang plus +x); a config value containing shell syntax
     * ("bash foo.sh", pipes, redirects) is not interpreted. Running it through a
     * shell would splice the server-supplied job name into the command line.
     *
     * @param scriptPath - The path to the script to execute.
     * @param type - The operation type ('backup' or 'restore').
     * @param jobName - The name of the job.
     * @param runId - The unique identifier for this job execution.
     * @returns A promise that resolves to true if the script finished successfully (exit code 0), false otherwise.
     */
    private static async runScript(
        scriptPath: string,
        type: string,
        jobName: string,
        runId: string,
    ): Promise<boolean> {
        logger.info(`Running script: ${scriptPath} ${type} "${jobName}"`);

        // Inform server about script start
        Connection.send(WS_EVENTS.LOG_UPDATE, {
            jobId: runId,
            output: `[Script Start] Running ${scriptPath} (Op: ${type}, Job: ${jobName})\n`,
            stream: "stdout",
        });

        return new Promise((resolve) => {
            try {
                const child = spawn(scriptPath, [type, jobName], {
                    shell: false,
                    env: { ...process.env },
                });

                child.stdout.on("data", (data: Buffer) => {
                    const chunk = data.toString();
                    process.stdout.write(chunk);
                    Connection.send(WS_EVENTS.LOG_UPDATE, {
                        jobId: runId,
                        output: `[Script Stdout] ${chunk}`,
                        stream: "stdout",
                    });
                });

                child.stderr.on("data", (data: Buffer) => {
                    const chunk = data.toString();
                    process.stderr.write(chunk);
                    Connection.send(WS_EVENTS.LOG_UPDATE, {
                        jobId: runId,
                        output: `[Script Stderr] ${chunk}`,
                        stream: "stderr",
                    });
                });

                child.on("close", (code) => {
                    const success = code === 0;
                    const resultMsg = success
                        ? "successfully"
                        : `with error code ${code}`;

                    // Inform server about script end
                    Connection.send(WS_EVENTS.LOG_UPDATE, {
                        jobId: runId,
                        output: `[Script End] ${scriptPath} finished ${resultMsg}.\n`,
                        stream: success ? "stdout" : "stderr",
                    });

                    if (success) {
                        logger.info(
                            `Script ${scriptPath} finished successfully.`,
                        );
                        resolve(true);
                    } else {
                        logger.error(
                            `Script ${scriptPath} failed with code ${code}.`,
                        );
                        resolve(false);
                    }
                });

                child.on("error", (err) => {
                    logger.error(
                        { err: err },
                        `Failed to start script ${scriptPath}:`,
                    );
                    Connection.send(WS_EVENTS.LOG_UPDATE, {
                        jobId: runId,
                        output: `[Script Error] Failed to start: ${err.message}\n`,
                        stream: "stderr",
                    });
                    resolve(false);
                });
            } catch (e: unknown) {
                logger.error({ err: e }, `Exception during script execution:`);
                resolve(false);
            }
        });
    }

    /**
     * Ends a run that failed before the backup process could even be started — currently
     * the tunnel paths. The history row already exists at this point, so it is closed out
     * rather than created.
     */
    private static finishFailedRun(
        runId: string,
        jobId: string | undefined,
        name: string,
        startTime: string,
        jobType: string,
        message: string,
    ) {
        try {
            JobHistoryRepository.finishJob(
                runId,
                JOB_STATUS.FAILED,
                new Date().toISOString(),
                null,
                null,
                message,
            );
        } catch (e) {
            logger.error({ err: e }, "DB Update Error (pre-spawn failure)");
        }

        const payload: ProtocolMap["STATUS_UPDATE"]["req"] = {
            id: runId,
            jobId: jobId,
            name,
            startTime,
            status: JOB_STATUS.FAILED,
            endTime: new Date().toISOString(),
            error: message,
            stderr: message,
            type: jobType,
        };
        Connection.send(WS_EVENTS.STATUS_UPDATE, payload);
    }

    /**
     * Determines which fingerprint to pin for a direct run.
     *
     * The stored value is a copy that ages: it is written when the job is saved and
     * nothing updates it when the PBS renews its certificate. Measuring here keeps the
     * client working on its own, including while the server is unreachable.
     *
     * A measured value is only adopted when regular CA validation vouched for it. That
     * check is the whole point — it is evidence from a source independent of the
     * fingerprint itself. Without it (a self-signed PBS) adopting whatever the peer
     * presents would turn the pin into a rubber stamp, so the stored value stands and a
     * genuine mismatch is left to fail the run, which is exactly what pinning is for.
     */
    private static async resolveFingerprint(
        repo: any,
        jobId?: string,
    ): Promise<string | undefined> {
        if (!repo?.baseUrl) return repo?.fingerprint;

        const probe = await probeCertificate(repo.baseUrl);
        if (!probe.reachable || !probe.fingerprint) return repo.fingerprint;

        const stored = normalizeFingerprint(repo.fingerprint);
        if (stored === probe.fingerprint) return repo.fingerprint;

        // Worth telling the server about either way: with a valid chain it is a renewal
        // the stored value has not caught up with, without one it may be worse.
        Connection.send(WS_EVENTS.FINGERPRINT_OBSERVED, {
            repositoryId: repo.repositoryId,
            baseUrl: repo.baseUrl,
            fingerprint: probe.fingerprint,
            caValid: probe.caValid,
        });

        if (!probe.caValid) {
            logger.warn(
                { baseUrl: repo.baseUrl, measured: probe.fingerprint },
                "Certificate differs from the pinned fingerprint and could not be validated — keeping the stored value",
            );
            return repo.fingerprint;
        }

        logger.info(
            { baseUrl: repo.baseUrl, measured: probe.fingerprint },
            "Certificate was renewed and validates against a trusted CA — adopting the new fingerprint",
        );

        if (jobId) this.persistFingerprint(jobId, probe.fingerprint);
        return probe.fingerprint;
    }

    /** Writes an adopted fingerprint back so the next offline run has it too. */
    private static persistFingerprint(jobId: string, fingerprint: string): void {
        try {
            const row = JobRepository.findById(jobId);
            if (!row?.config) return;

            const parsed = JSON.parse(row.config as string);
            if (!parsed.repository) return;

            parsed.repository.fingerprint = fingerprint;
            JobRepository.updateConfig(jobId, JSON.stringify(parsed));
        } catch (e) {
            logger.warn(
                { err: e, jobId },
                "Failed to persist the updated fingerprint",
            );
        }
    }

    /**
     * Everything a run needs once its command line is built. The two entry points
     * below differ only in how they fill this in — from here on backup and restore
     * are the same procedure, which is the point: the keyfile cleanup that this
     * class lost once already went missing because there were two copies of it.
     */
    private static async runProxmoxClient(spec: {
        runId: string;
        /** Backup only. Restores are authorised per run and carry no job id. */
        jobId?: string;
        jobType: "backup" | "restore";
        jobName: string;
        startTime: string;
        command: string;
        args: string[];
        env: NodeJS.ProcessEnv;
        password?: string;
        keyfilePath?: string;
        repository?: any;
        tunnelRequired: boolean;
        /** Backup only: this run holds a concurrency slot that must be handed back. */
        releaseSlot: boolean;
    }): Promise<void> {
        const {
            runId,
            jobId,
            jobType,
            jobName,
            startTime,
            command,
            args,
            env,
            password,
            keyfilePath,
            repository,
            tunnelRequired,
            releaseSlot,
        } = spec;

        const releaseSlotIfHeld = () => {
            if (releaseSlot && jobId) this.releaseJobSlot(jobId);
        };

        logger.info(
            `Starting ${jobType} ${runId}: ${command} ${args.join(" ")}`,
        );

        try {
            JobHistoryRepository.startRunningJob(
                runId,
                jobId ?? null,
                jobType,
                startTime,
                jobName,
            );
        } catch (e) {
            logger.error({ err: e }, "DB Log Error");
        }

        const runningPayload: ProtocolMap["STATUS_UPDATE"]["req"] = {
            id: runId,
            jobId: jobId,
            name: jobName,
            startTime: startTime,
            status: JOB_STATUS.RUNNING,
            type: jobType,
        };
        Connection.send(WS_EVENTS.STATUS_UPDATE, runningPayload);

        let stdoutBuffer = "";
        let stderrBuffer = "";

        // A tunnelled client reaches the PBS only through the SSH reverse tunnel. The
        // lease is requested here, immediately before the spawn, and released again in
        // every exit path below — a lease that is never released blocks the tunnel until
        // maxLeaseMs.
        let lease: TunnelLease | undefined;
        try {
            if (tunnelRequired && repository) {
                lease = await TunnelClient.acquire(runId, jobId);
                env.PBS_REPOSITORY = TunnelClient.buildRepositoryValue(
                    repository,
                    lease,
                );
                // Measured by the server moments ago; the copy in the job config may be
                // months old and is only the fallback if the server could not measure.
                if (lease.fingerprint) {
                    env.PBS_FINGERPRINT = lease.fingerprint;
                }
            }
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            logger.error({ err: e }, `Tunnel acquisition failed (${jobType})`);
            releaseSlotIfHeld();
            this.removeTempKeyfile(keyfilePath);
            this.finishFailedRun(
                runId,
                jobId,
                jobName,
                startTime,
                jobType,
                message,
            );
            return;
        }

        const child = spawn(command, args, {
            shell: false,
            env: env,
            // Standard IO pipes: [stdin, stdout, stderr, pipe3 (repository password)]
            stdio: ["pipe", "pipe", "pipe", "pipe"],
        });

        if (password) {
            const passwordPipe = child.stdio[3] as any;
            passwordPipe.on("error", () => {});
            passwordPipe.write(password);
            passwordPipe.end();
        }

        const pipeOutput = (
            source: NodeJS.ReadableStream,
            local: NodeJS.WritableStream,
            channel: "stdout" | "stderr",
        ) => {
            source.on("data", (data: Buffer) => {
                const chunk = data.toString();
                local.write(chunk);
                if (channel === "stdout") stdoutBuffer += chunk;
                else stderrBuffer += chunk;
                logger.debug({ output: chunk }, channel);
                Connection.send(WS_EVENTS.LOG_UPDATE, {
                    jobId: runId,
                    output: chunk,
                    stream: channel,
                });
            });
        };
        pipeOutput(child.stdout, process.stdout, "stdout");
        pipeOutput(child.stderr, process.stderr, "stderr");

        child.on("close", (code: number | null) => {
            TunnelClient.release(lease);
            lease = undefined;
            this.removeTempKeyfile(keyfilePath);

            const status = code === 0 ? JOB_STATUS.SUCCESS : JOB_STATUS.FAILED;
            const endTime = new Date().toISOString();
            logger.info(`${jobType} ${runId} finished with code ${code}`);

            try {
                JobHistoryRepository.finishJob(
                    runId,
                    status,
                    endTime,
                    code,
                    stdoutBuffer || null,
                    stderrBuffer || null,
                );
            } catch (e) {
                logger.error({ err: e }, "DB Update Error");
            }

            const finalPayload: ProtocolMap["STATUS_UPDATE"]["req"] = {
                id: runId,
                jobId: jobId,
                name: jobName,
                startTime: startTime,
                status: status,
                exitCode: code ?? undefined,
                endTime: endTime,
                stdout: stdoutBuffer,
                stderr: stderrBuffer,
                type: jobType,
            };
            Connection.send(WS_EVENTS.STATUS_UPDATE, finalPayload);

            // Post-Execution Script. The run is already recorded as finished; a
            // failing post-script downgrades a successful run to failed after the
            // fact, per the requirement that any error aborts the whole operation.
            if (config.postScript) {
                this.runScript(
                    config.postScript,
                    jobType,
                    jobName,
                    runId,
                ).then((success) => {
                    if (success || status !== JOB_STATUS.SUCCESS) return;

                    logger.error("Post-execution script failed.");
                    const stderrWithScript =
                        (stderrBuffer || "") + "\nPost-execution script failed.";

                    const downgraded: ProtocolMap["STATUS_UPDATE"]["req"] = {
                        id: runId,
                        jobId: jobId,
                        name: jobName,
                        startTime: startTime,
                        status: JOB_STATUS.FAILED,
                        exitCode: code ?? undefined,
                        endTime: endTime,
                        stdout: stdoutBuffer,
                        stderr: stderrWithScript,
                        type: jobType,
                    };
                    Connection.send(WS_EVENTS.STATUS_UPDATE, downgraded);

                    try {
                        JobHistoryRepository.failJob(runId, stderrWithScript);
                    } catch (e) {
                        logger.error(
                            { err: e },
                            "DB Update Error (Post-Script Failure)",
                        );
                    }
                });
            }

            releaseSlotIfHeld();
        });

        child.on("error", (err: Error) => {
            TunnelClient.release(lease);
            lease = undefined;
            releaseSlotIfHeld();
            this.removeTempKeyfile(keyfilePath);
            logger.error({ err: err }, "Spawn Error");

            const errorMsg = err.message;
            const endTime = new Date().toISOString();
            stderrBuffer += "\nSpawn Error: " + errorMsg;

            const errorPayload: ProtocolMap["STATUS_UPDATE"]["req"] = {
                id: runId,
                jobId: jobId,
                name: jobName,
                startTime: startTime,
                status: JOB_STATUS.FAILED,
                endTime: endTime,
                error: errorMsg,
                stderr: stderrBuffer,
                type: jobType,
            };
            Connection.send(WS_EVENTS.STATUS_UPDATE, errorPayload);

            try {
                // finishJob rather than failJob: it also writes end_time, which the
                // backup path left empty on a spawn error.
                JobHistoryRepository.finishJob(
                    runId,
                    JOB_STATUS.FAILED,
                    endTime,
                    null,
                    null,
                    stderrBuffer || null,
                );
            } catch (e) {
                logger.error({ err: e }, "DB Update Error (Spawn Failure)");
            }
        });
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
                    tempKeyfilePath = path.join(
                        os.tmpdir(),
                        `pbcm_key_${runId}.json`,
                    );
                    fs.writeFileSync(
                        tempKeyfilePath,
                        jobConfigData.encryption.keyContent,
                        { mode: 0o600 },
                    );
                    args.push(
                        "--crypt-mode",
                        "encrypt",
                        "--keyfile",
                        tempKeyfilePath,
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
                    const repo = jobConfigData.repository;

                    // Map repository credentials to environment variables for proxmox-backup-client
                    // The format username!tokenname@host:datastore is required for PBS_REPOSITORY.
                    // For tunneled clients host and port are replaced right before spawn,
                    // once the lease tells us the loopback port of the reverse forward.
                    env.PBS_REPOSITORY = TunnelClient.buildRepositoryValue(repo);

                    // Pass password via file descriptor 3 to avoid exposing it in process arguments
                    env.PBS_PASSWORD_FD = "3";
                    pbsPassword = repo.secret;

                    // Tunneled runs skip this: they reach the PBS as 127.0.0.1, where a
                    // CA check can never succeed. There the server measures instead and
                    // hands the value over with the lease, further down.
                    const fingerprint = TunnelClient.isRequired()
                        ? repo.fingerprint
                        : await this.resolveFingerprint(repo, jobId);

                    if (fingerprint) {
                        env.PBS_FINGERPRINT = fingerprint;
                    }
                } catch (e) {
                    logger.error(
                        { err: e },
                        `Error parsing PBS config for job ${jobName}`,
                    );
                }
            }

            args.push("backup");

            let pathsRaw = jobConfigData.archives || [];

            if (Array.isArray(pathsRaw) && pathsRaw.length > 0) {
                pathsRaw.forEach((item: any) => {
                    args.push(`${item.name}.pxar:${item.path}`);
                });
            }

            if (config.clientId) {
                args.push("--backup-id", config.clientId);
            }

            if (
                Array.isArray(config.backupParams) &&
                config.backupParams.length > 0
            ) {
                config.backupParams.forEach((param) => args.push(param));
            }
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
            this.removeTempKeyfile(tempKeyfilePath);
            this.releaseJobSlot(jobId);
            return;
        }

        // Pre-Execution Script
        if (config.preScript) {
            const success = await this.runScript(
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
                this.removeTempKeyfile(tempKeyfilePath);
                this.releaseJobSlot(jobId);
                return;
            }
        }

        await this.runProxmoxClient({
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
            tunnelRequired: TunnelClient.isRequired(),
            releaseSlot: true,
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
        try {
            if (encryption?.keyContent) {
                try {
                    tempKeyfilePath = path.join(
                        os.tmpdir(),
                        `pbcm_restore_key_${runId}.json`,
                    );
                    fs.writeFileSync(tempKeyfilePath, encryption.keyContent, {
                        mode: 0o600,
                    });
                    args.push("--keyfile", tempKeyfilePath);
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
                    env.PBS_REPOSITORY =
                        TunnelClient.buildRepositoryValue(repository);
                    env.PBS_PASSWORD_FD = "3";
                    pbsPassword = repository.secret;

                    const fingerprint = TunnelClient.isRequired()
                        ? repository.fingerprint
                        : await this.resolveFingerprint(repository);

                    if (fingerprint) {
                        env.PBS_FINGERPRINT = fingerprint;
                    }
                } catch (e) {
                    logger.error(
                        { err: e },
                        `Error parsing PBS config for restore`,
                    );
                    throw new Error("Invalid repository configuration");
                }
            }

            // We default to the first archive if multiple are provided, as the CLI usually handles one restore operation at a time.
            const archive = archives[0];
            if (!archive) throw new Error("No archive specified for restore");

            args.push("restore");
            args.push(snapshot);
            args.push(archive);
            args.push(targetPath);

            if (
                Array.isArray(config.restoreParams) &&
                config.restoreParams.length > 0
            ) {
                config.restoreParams.forEach((param) => args.push(param));
            }
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
            this.removeTempKeyfile(tempKeyfilePath);
            return;
        }

        await this.runProxmoxClient({
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
            tunnelRequired: TunnelClient.isRequired(),
            releaseSlot: false,
        });
    }
}
