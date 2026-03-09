import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { JobHistoryRepository } from "../repositories/JobHistoryRepository.js";
import { JobRepository } from "../repositories/JobRepository.js";
import { config } from "../core/Config.js";
import { WS_EVENTS, ProtocolMap, JOB_STATUS } from "@pbcm/shared";
import { logger } from "../core/logger.js";
import { Connection } from "../core/Connection.js";

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
     * Runs a pre- or post-execution script if configured.
     * The script is executed with two arguments: the operation type (backup/restore) and the job name.
     * Script output (stdout/stderr) is streamed to the server via WebSocket.
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
                    shell: true,
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
     * Executes a backup job by spawning the proxmox-backup-client CLI tool.
     * Resolves the job configuration from the local database, mounts repository
     * credentials, processes encryption keys, and pipes live log streams back
     * to the backend server via WebSocket.
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
        let env: any = { ...process.env };
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
                status: "failed",
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
                    const cred = repo;

                    let hostStr = "";
                    try {
                        const u = new URL(repo.baseUrl);
                        hostStr = u.hostname;
                        if (u.port) hostStr += ":" + u.port;
                    } catch (e) {
                        hostStr = repo.baseUrl;
                    }

                    // Map repository credentials to environment variables for proxmox-backup-client
                    // The format username!tokenname@host:datastore is required for PBS_REPOSITORY
                    env.PBS_REPOSITORY = `${cred.username}!${cred.tokenname}@${hostStr}:${repo.datastore}`;

                    // Pass password via file descriptor 3 to avoid exposing it in process arguments
                    env.PBS_PASSWORD_FD = "3";
                    pbsPassword = cred.secret;

                    if (repo.fingerprint) {
                        env.PBS_FINGERPRINT = repo.fingerprint;
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
                name: jobName || "Unknown Backup",
                startTime: startTime,
                status: "failed",
                error:
                    "Config resolution failed: " +
                    (e instanceof Error ? e.message : String(e)),
                stderr: e instanceof Error ? e.message : String(e),
                type: "backup",
            };
            Connection.send(WS_EVENTS.STATUS_UPDATE, statusPayload);
            return;
        }

        const jobType = "backup";

        // Pre-Execution Script
        if (config.preScript) {
            const success = await this.runScript(
                config.preScript,
                jobType,
                jobName || "Unknown",
                runId,
            );
            if (!success) {
                logger.error("Aborting backup due to pre-script failure.");
                const statusPayload: ProtocolMap["STATUS_UPDATE"]["req"] = {
                    id: runId,
                    jobId: jobId,
                    name: jobName || "Unknown Backup",
                    startTime: startTime,
                    status: "failed",
                    error: "Pre-execution script failed. Operation aborted.",
                    stderr: "Pre-execution script failed. Operation aborted.",
                    type: jobType,
                };
                Connection.send(WS_EVENTS.STATUS_UPDATE, statusPayload);
                return;
            }
        }

        logger.info(`Starting restore ${runId}: ${command} ${args.join(" ")}`);

        try {
            JobHistoryRepository.startRunningJob(
                runId,
                jobId,
                jobType,
                startTime,
                jobName || null,
            );
        } catch (e) {
            logger.error({ err: e }, "DB Log Error");
        }

        const runningPayload: ProtocolMap["STATUS_UPDATE"]["req"] = {
            id: runId,
            jobId: jobId,
            name: jobName || "Unknown Backup",
            startTime: startTime,
            status: "running",
            type: jobType,
        };
        Connection.send(WS_EVENTS.STATUS_UPDATE, runningPayload);

        let stdoutBuffer = "";
        let stderrBuffer = "";

        const child = spawn(command, args, {
            shell: false,
            env: env,
            // Standard IO pipes: [stdin, stdout, stderr, pipe3 (repository password)]
            stdio: ["pipe", "pipe", "pipe", "pipe"],
        });

        if (pbsPassword) {
            const passwordPipe = child.stdio[3] as any;
            passwordPipe.on("error", () => {});
            passwordPipe.write(pbsPassword);
            passwordPipe.end();
        }

        child.stdout.on("data", (data: Buffer) => {
            const chunk = data.toString();
            process.stdout.write(chunk);
            stdoutBuffer += chunk;
            logger.debug({ err: chunk }, "stdout");
            Connection.send(WS_EVENTS.LOG_UPDATE, {
                jobId: runId,
                output: chunk,
                stream: "stdout",
            });
        });

        child.stderr.on("data", (data: Buffer) => {
            const chunk = data.toString();
            process.stderr.write(chunk);
            stderrBuffer += chunk;
            logger.debug({ err: chunk }, "stderr");
            Connection.send(WS_EVENTS.LOG_UPDATE, {
                jobId: runId,
                output: chunk,
                stream: "stderr",
            });
        });

        child.on("close", (code: number | null) => {
            const status = code === 0 ? "success" : "failed";
            const endTime = new Date().toISOString();
            logger.info(`Job ${jobId} finished with code ${code}`);

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
                name: jobName || "Unknown Backup",
                startTime: startTime,
                status: status,
                exitCode: code ?? undefined,
                endTime: endTime,
                stdout: stdoutBuffer,
                stderr: stderrBuffer,
                type: jobType,
            };
            Connection.send(WS_EVENTS.STATUS_UPDATE, finalPayload);

            this.runningJobs.delete(jobId);

            // Post-Execution Script
            if (config.postScript) {
                this.runScript(
                    config.postScript,
                    jobType,
                    jobName || "Unknown",
                    runId,
                ).then((success) => {
                    if (!success && status === "success") {
                        // If backup succeeded but post-script failed, we still mark it as failed (as per requirement: "bei einem Fehler wird der gesamte Vorgang abgebrochen")
                        // Well, it's already "finished", but we can update the status.
                        logger.error("Post-execution script failed.");
                        const finalPayload: ProtocolMap["STATUS_UPDATE"]["req"] =
                            {
                                id: runId,
                                jobId: jobId,
                                name: jobName || "Unknown Backup",
                                startTime: startTime,
                                status: "failed",
                                exitCode: code ?? undefined,
                                endTime: endTime,
                                stdout: stdoutBuffer,
                                stderr:
                                    (stderrBuffer || "") +
                                    "\nPost-execution script failed.",
                                type: jobType,
                            };
                        Connection.send(WS_EVENTS.STATUS_UPDATE, finalPayload);

                        try {
                            JobHistoryRepository.failJob(
                                runId,
                                (stderrBuffer || "") +
                                    "\nPost-execution script failed.",
                            );
                        } catch (e) {
                            logger.error(
                                { err: e },
                                "DB Update Error (Post-Script Failure)",
                            );
                        }
                    }
                });
            }

            if (this.pendingJobs.has(jobId)) {
                const queuedRunId = this.pendingJobs.get(jobId)!;
                this.pendingJobs.delete(jobId);
                const delayMs = (config.queueDelaySeconds || 5) * 1000;
                logger.info(
                    `Restarting queued job ${jobId} in ${delayMs / 1000}s...`,
                );
                setTimeout(() => {
                    Executor.executeBackup(queuedRunId, jobId);
                }, delayMs);
            }
        });

        child.on("error", (err: Error) => {
            this.runningJobs.delete(jobId);
            logger.error({ err: err }, "Spawn Error");

            const errorMsg = err.message;
            stderrBuffer += "\nSpawn Error: " + errorMsg;
            const errorPayload: ProtocolMap["STATUS_UPDATE"]["req"] = {
                id: runId,
                jobId: jobId,
                name: jobName || "Unknown Backup",
                startTime: startTime,
                status: "failed",
                error: errorMsg,
                stderr: stderrBuffer,
                type: jobType,
            };
            Connection.send(WS_EVENTS.STATUS_UPDATE, errorPayload);

            try {
                JobHistoryRepository.failJob(runId, stderrBuffer || "");
            } catch (e) {}
        });
    }

    /**
     * Executes a restore operation by spawning the proxmox-backup-client CLI tool.
     * Automatically handles downloading and decrypting a snapshot archive into a
     * specified local directory, while streaming logs back to the server.
     *
     * @param runId - A unique identifier for this specific restore run.
     * @param payload - Payload containing restore configuration (snapshot, targetPath, etc.).
     */
    static async executeRestore(runId: string, payload: any) {
        const { snapshot, targetPath, repository, archives, encryption } =
            payload;
        let pbsPassword: string | undefined;
        let tempKeyfilePath: string | undefined;
        let command = config.executable || "proxmox-backup-client";
        let args: string[] = [];
        let env = { ...process.env };
        let jobName = `Restore: ${snapshot}`;

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
                    const cred = repository;
                    let hostStr = "";
                    try {
                        const u = new URL(repository.baseUrl);
                        hostStr = u.hostname;
                        if (u.port) hostStr += ":" + u.port;
                    } catch (e) {
                        hostStr = repository.baseUrl;
                    }

                    env.PBS_REPOSITORY = `${cred.username}!${cred.tokenname}@${hostStr}:${repository.datastore}`;
                    env.PBS_PASSWORD_FD = "3";
                    pbsPassword = cred.secret;

                    if (repository.fingerprint) {
                        env.PBS_FINGERPRINT = repository.fingerprint;
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
                status: "failed",
                error:
                    "Config resolution failed: " +
                    (e instanceof Error ? e.message : String(e)),
                stderr: e instanceof Error ? e.message : String(e),
                type: "restore",
            };
            Connection.send(WS_EVENTS.STATUS_UPDATE, statusPayload);
            return;
        }

        logger.info(`Starting restore ${runId}: ${command} ${args.join(" ")}`);

        const jobType = "restore";

        try {
            JobHistoryRepository.startRunningJob(
                runId,
                null,
                jobType,
                startTime,
                jobName,
            );
        } catch (e) {
            logger.error({ err: e }, "DB Log Error");
        }

        const runningPayload: ProtocolMap["STATUS_UPDATE"]["req"] = {
            id: runId,
            name: jobName,
            startTime: startTime,
            status: "running",
            type: jobType,
        };
        Connection.send(WS_EVENTS.STATUS_UPDATE, runningPayload);

        let stdoutBuffer = "";
        let stderrBuffer = "";

        const child = spawn(command, args, {
            shell: false,
            env: env,
            stdio: ["pipe", "pipe", "pipe", "pipe"],
        });

        if (pbsPassword) {
            const passwordPipe = child.stdio[3] as any;
            passwordPipe.on("error", () => {});
            passwordPipe.write(pbsPassword);
            passwordPipe.end();
        }

        child.stdout.on("data", (data: Buffer) => {
            const chunk = data.toString();
            process.stdout.write(chunk);
            stdoutBuffer += chunk;
            Connection.send(WS_EVENTS.LOG_UPDATE, {
                jobId: runId,
                output: chunk,
                stream: "stdout",
            });
        });

        child.stderr.on("data", (data: Buffer) => {
            const chunk = data.toString();
            process.stderr.write(chunk);
            stderrBuffer += chunk;
            Connection.send(WS_EVENTS.LOG_UPDATE, {
                jobId: runId,
                output: chunk,
                stream: "stderr",
            });
        });
        const cleanup = () => {
            if (tempKeyfilePath && fs.existsSync(tempKeyfilePath)) {
                try {
                    fs.unlinkSync(tempKeyfilePath);
                } catch (e) {
                    logger.error(
                        { err: e },
                        "Failed to delete temp restore keyfile",
                    );
                }
            }
        };

        child.on("close", (code: number | null) => {
            const status = code === 0 ? "success" : "failed";
            const endTime = new Date().toISOString();
            logger.info(`Restore ${runId} finished with code ${code}`);

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

            // Post-Execution Script
            if (config.postScript) {
                this.runScript(
                    config.postScript,
                    jobType,
                    jobName || "Unknown",
                    runId,
                ).then((success) => {
                    if (!success && status === "success") {
                        logger.error("Post-execution script failed.");
                        const finalPayload: ProtocolMap["STATUS_UPDATE"]["req"] =
                            {
                                id: runId,
                                name: jobName,
                                startTime: startTime,
                                status: "failed",
                                exitCode: code ?? undefined,
                                endTime: endTime,
                                stdout: stdoutBuffer,
                                stderr:
                                    (stderrBuffer || "") +
                                    "\nPost-execution script failed.",
                                type: jobType,
                            };
                        Connection.send(WS_EVENTS.STATUS_UPDATE, finalPayload);

                        try {
                            JobHistoryRepository.failJob(
                                runId,
                                (stderrBuffer || "") +
                                    "\nPost-execution script failed.",
                            );
                        } catch (e) {
                            logger.error(
                                { err: e },
                                "DB Update Error (Post-Script Failure)",
                            );
                        }
                    }
                });
            }

            cleanup();
        });

        child.on("error", (err: Error) => {
            const errorMsg = err.message;
            stderrBuffer += "\nSpawn Error: " + errorMsg;
            const errorPayload: ProtocolMap["STATUS_UPDATE"]["req"] = {
                id: runId,
                name: jobName,
                startTime: startTime,
                status: "failed",
                error: errorMsg,
                stderr: stderrBuffer,
                type: jobType,
            };
            Connection.send(WS_EVENTS.STATUS_UPDATE, errorPayload);

            try {
                JobHistoryRepository.finishJob(
                    runId,
                    "failed",
                    new Date().toISOString(),
                    null,
                    null,
                    stderrBuffer || null,
                );
            } catch (e) {}

            cleanup();
        });
    }
}
