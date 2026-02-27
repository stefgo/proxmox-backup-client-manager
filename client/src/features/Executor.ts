import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import db from "../core/Database.js";
import { config } from "../core/Config.js";
import { WS_EVENTS, ProtocolMap } from "@pbcm/shared";
import { Logger } from "../core/Logger.js";
import { Connection } from "../core/Connection.js";

export class Executor {
    /**
     * Cleans up stale jobs from the history table that are still marked as 'running'
     * by setting their status to 'abort'. This usually runs on client agent startup
     * to ensure no ghost jobs remain.
     */
    static async cleanupRunningJobs() {
        Logger.info("Checking for stale 'running' jobs in history...");
        try {
            const result = db.prepare(
                "UPDATE history SET status = 'abort', end_time = ? WHERE status = 'running'"
            ).run(new Date().toISOString());

            if (result.changes > 0) {
                Logger.info(`Updated ${result.changes} stale jobs to 'abort' status.`);
            }
        } catch (e) {
            Logger.error("Failed to cleanup stale running jobs", e);
        }
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

        try {
            const jobConfig = db
                .prepare("SELECT * FROM job WHERE id = ?")
                .get(jobId) as any;
            if (jobConfig) {
                jobName = jobConfig.name;

                const jobConfigData = jobConfig.config
                    ? JSON.parse(jobConfig.config as string)
                    : {};

                // Encryption: write keyContent to a temp file and configure --keyfile
                if (jobConfigData.encryption?.keyContent) {
                    try {
                        tempKeyfilePath = path.join(os.tmpdir(), `pbcm_key_${runId}.json`);
                        fs.writeFileSync(tempKeyfilePath, jobConfigData.encryption.keyContent, { mode: 0o600 });
                        args.push("--crypt-mode", "encrypt", "--keyfile", tempKeyfilePath);
                    } catch (e: any) {
                        Logger.error("Failed to write encryption key file", e);
                        throw new Error("Failed to write encryption key file: " + e.message);
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
                        Logger.error(
                            `Error parsing PBS config for job ${jobConfig.name}`,
                            e,
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

                if (Array.isArray(config.backupParams) && config.backupParams.length > 0) {
                    config.backupParams.forEach((param) => args.push(param));
                }
            } else {
                throw new Error("Config not found locally for job " + jobId);
            }
        } catch (e: any) {
            Logger.error("Job Config Resolution Error:", e);
            const statusPayload: ProtocolMap["STATUS_UPDATE"]["req"] = {
                id: runId,
                status: "failed",
                error: "Config resolution failed: " + e.message,
                stderr: e.message,
                type: "backup",
            };
            Connection.send(WS_EVENTS.STATUS_UPDATE, statusPayload);
            return;
        }

        Logger.info(`Starting job ${runId}: ${command} ${args.join(" ")}`);

        const jobType = "backup";
        const startTime = new Date().toISOString();

        try {
            db.prepare(
                `
                INSERT INTO history (id, job_id, type, status, start_time, name)
                VALUES (?, ?, ?, 'running', ?, ?)
            `,
            ).run(runId, jobId, jobType, startTime, jobName || null);
        } catch (e) {
            Logger.error("DB Log Error", e);
        }

        const runningPayload: ProtocolMap["STATUS_UPDATE"]["req"] = {
            id: runId,
            status: "running",
            type: jobType,
            startTime: startTime,
            name: jobName,
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
            passwordPipe.on("error", () => { });
            passwordPipe.write(pbsPassword);
            passwordPipe.end();
        }

        child.stdout.on("data", (data: Buffer) => {
            const chunk = data.toString();
            process.stdout.write(chunk);
            stdoutBuffer += chunk;
            Logger.debug("stdout", chunk);
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
            Logger.debug("stderr", chunk);
            Connection.send(WS_EVENTS.LOG_UPDATE, {
                jobId: runId,
                output: chunk,
                stream: "stderr",
            });
        });

        child.on("close", (code: number | null) => {
            const status = code === 0 ? "success" : "failed";
            const endTime = new Date().toISOString();
            Logger.info(`Job ${jobId} finished with code ${code}`);

            try {
                db.prepare(
                    "UPDATE history SET status = ?, end_time = ?, exit_code = ?, stdout = ?, stderr = ? WHERE id = ?",
                ).run(
                    status,
                    endTime,
                    code,
                    stdoutBuffer || null,
                    stderrBuffer || null,
                    runId,
                );
            } catch (e) {
                Logger.error("DB Update Error", e);
            }

            const finalPayload: ProtocolMap["STATUS_UPDATE"]["req"] = {
                id: runId,
                status: status,
                exitCode: code ?? undefined,
                startTime: startTime,
                endTime: endTime,
                stdout: stdoutBuffer,
                stderr: stderrBuffer,
                type: jobType,
                name: jobName,
            };
            Connection.send(WS_EVENTS.STATUS_UPDATE, finalPayload);
        });

        child.on("error", (err: Error) => {
            Logger.error("Spawn Error", err);

            const errorMsg = err.message;
            stderrBuffer += "\nSpawn Error: " + errorMsg;
            const errorPayload: ProtocolMap["STATUS_UPDATE"]["req"] = {
                id: jobId,
                status: "failed",
                error: errorMsg,
                stderr: stderrBuffer,
                type: jobType,
            };
            Connection.send(WS_EVENTS.STATUS_UPDATE, errorPayload);

            try {
                db.prepare(
                    "UPDATE history SET status = ?, end_time = ?, stderr = ? WHERE id = ?",
                ).run(
                    "failed",
                    new Date().toISOString(),
                    stderrBuffer || null,
                    jobId,
                );
            } catch (e) { }
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
        const { snapshot, targetPath, repository, archives, encryption } = payload;
        let pbsPassword: string | undefined;
        let tempKeyfilePath: string | undefined;
        let command = config.executable || "proxmox-backup-client";
        let args: string[] = [];
        let env = { ...process.env };
        let jobName = `Restore: ${snapshot}`;

        try {
            if (encryption?.keyContent) {
                try {
                    tempKeyfilePath = path.join(os.tmpdir(), `pbcm_restore_key_${runId}.json`);
                    fs.writeFileSync(tempKeyfilePath, encryption.keyContent, { mode: 0o600 });
                    args.push("--keyfile", tempKeyfilePath);
                } catch (e: any) {
                    Logger.error("Failed to write restore encryption key file", e);
                    throw new Error("Failed to write restore encryption key file: " + e.message);
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
                    Logger.error(`Error parsing PBS config for restore`, e);
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

            if (Array.isArray(config.restoreParams) && config.restoreParams.length > 0) {
                config.restoreParams.forEach((param) => args.push(param));
            }
        } catch (e: any) {
            Logger.error("Restore Config Error:", e);
            const statusPayload: ProtocolMap["STATUS_UPDATE"]["req"] = {
                id: runId,
                status: "failed",
                error: "Config resolution failed: " + e.message,
                stderr: e.message,
                type: "restore",
            };
            Connection.send(WS_EVENTS.STATUS_UPDATE, statusPayload);
            return;
        }

        Logger.info(`Starting restore ${runId}: ${command} ${args.join(" ")}`);

        const jobType = "restore";
        const startTime = new Date().toISOString();

        try {
            // We use runId as the ID for history. restore jobs might not have a persistent 'job_id' configuration, so we set job_id to null or a placeholder.
            db.prepare(
                `
                INSERT INTO history (id, job_id, type, status, start_time, name)
                VALUES (?, ?, ?, 'running', ?, ?)
            `,
            ).run(runId, "restore-manual", jobType, startTime, jobName);
        } catch (e) {
            Logger.error("DB Log Error", e);
        }

        const runningPayload: ProtocolMap["STATUS_UPDATE"]["req"] = {
            id: runId,
            status: "running",
            type: jobType,
            startTime: startTime,
            name: jobName,
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
            passwordPipe.on("error", () => { });
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
                    Logger.error("Failed to delete temp restore keyfile", e);
                }
            }
        };

        child.on("close", (code: number | null) => {
            const status = code === 0 ? "success" : "failed";
            const endTime = new Date().toISOString();
            Logger.info(`Restore ${runId} finished with code ${code}`);

            try {
                db.prepare(
                    "UPDATE history SET status = ?, end_time = ?, exit_code = ?, stdout = ?, stderr = ? WHERE id = ?",
                ).run(
                    status,
                    endTime,
                    code,
                    stdoutBuffer || null,
                    stderrBuffer || null,
                    runId,
                );
            } catch (e) {
                Logger.error("DB Update Error", e);
            }

            const finalPayload: ProtocolMap["STATUS_UPDATE"]["req"] = {
                id: runId,
                status: status,
                exitCode: code ?? undefined,
                startTime: startTime,
                endTime: endTime,
                stdout: stdoutBuffer,
                stderr: stderrBuffer,
                type: jobType,
                name: jobName,
            };
            Connection.send(WS_EVENTS.STATUS_UPDATE, finalPayload);
            cleanup();
        });

        child.on("error", (err: Error) => {
            const errorMsg = err.message;
            stderrBuffer += "\nSpawn Error: " + errorMsg;
            const errorPayload: ProtocolMap["STATUS_UPDATE"]["req"] = {
                id: runId,
                status: "failed",
                error: errorMsg,
                stderr: stderrBuffer,
                type: jobType,
            };
            Connection.send(WS_EVENTS.STATUS_UPDATE, errorPayload);

            try {
                db.prepare(
                    "UPDATE history SET status = ?, end_time = ?, stderr = ? WHERE id = ?",
                ).run(
                    "failed",
                    new Date().toISOString(),
                    stderrBuffer || null,
                    runId,
                );
            } catch (e) { }

            cleanup();
        });
    }
}
