import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import db from "../core/Database.js";
import { randomUUID } from "crypto";
import {
    WS_EVENTS,
    BackupJob,
    ScheduleConfig,
    RunJobPayload,
    ProtocolMap,
    RestoreSnapshotPayload,
} from "@pbcm/shared";
import { config } from "../core/Config.js";
import { Executor } from "./Executor.js";
import { Logger } from "../core/Logger.js";
import { Connection } from "../core/Connection.js";
import { JobRepository } from "../repositories/JobRepository.js";
import { JobScheduleStateRepository } from "../repositories/JobScheduleStateRepository.js";
import { JobHistoryRepository } from "../repositories/JobHistoryRepository.js";

export class Handlers {
    static handleRunJob(payload: RunJobPayload) {
        Executor.executeBackup(payload.runId, payload.jobId);
    }

    static handleRestoreSnapshot(payload: RestoreSnapshotPayload) {
        Executor.executeRestore(payload.runId, payload);
    }

    static handleFsList(payload: ProtocolMap["FS_LIST"]["req"]) {
        const { path: reqPath, requestId } = payload;
        Logger.info(`Listing directory: ${reqPath}`);

        try {
            const safePath = path.resolve(reqPath);
            const entries = fs.readdirSync(safePath, { withFileTypes: true });

            const files = entries.map((entry) => ({
                name: entry.name,
                isDirectory: entry.isDirectory(),
                path: path.join(reqPath, entry.name),
                size: entry.isDirectory() ? 0 : 0,
            }));

            Connection.send(WS_EVENTS.FS_LIST, { requestId, files } as any);
        } catch (err: unknown) {
            Logger.error({ err: err }, "FS List Error");
            Connection.send(WS_EVENTS.FS_LIST, {
                requestId,
                error: err instanceof Error ? err.message : String(err),
            } as any);
        }
    }

    static handleGetVersion(payload: ProtocolMap["GET_VERSION"]["req"]) {
        const { requestId } = payload;
        const command = config.executable || "proxmox-backup-client";
        const args: string[] = ["version", "--output-format", "json"];
        const env = { ...process.env };

        Logger.info(`Checking version: ${command} ${args.join(" ")}`);

        const child = spawn(command, args, { env });
        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (data) => (stdout += data.toString()));
        child.stderr.on("data", (data) => (stderr += data.toString()));

        child.on("close", (code) => {
            if (code === 0) {
                try {
                    const data = JSON.parse(stdout);
                    const v = data?.client?.version;
                    const r = data?.client?.release;
                    const version =
                        v && r
                            ? `${v}.${r}`
                            : v ||
                              (typeof data === "string"
                                  ? data
                                  : JSON.stringify(data));

                    Connection.send(WS_EVENTS.GET_VERSION, {
                        requestId,
                        version: String(version),
                    } as any);
                } catch (e) {
                    Connection.send(WS_EVENTS.GET_VERSION, {
                        requestId,
                        version: "",
                        error: "Failed to parse version JSON",
                    } as any);
                }
            } else {
                Connection.send(WS_EVENTS.GET_VERSION, {
                    requestId,
                    version: "",
                    error: "Failed to retrieve version: " + stderr,
                } as any);
            }
        });

        child.on("error", (err) => {
            Logger.error({ err: err }, "Version Check Error");
            Connection.send(WS_EVENTS.GET_VERSION, {
                requestId,
                version: "",
                error: err instanceof Error ? err.message : String(err),
            } as any);
        });
    }

    static async handleJobList(payload: ProtocolMap["JOB_LIST_CONFIG"]["req"]) {
        try {
            const jobs: BackupJob[] =
                await JobRepository.getAllWithScheduleState();

            Connection.send(WS_EVENTS.JOB_LIST_CONFIG, {
                requestId: payload.requestId,
                jobs,
            } as any);
        } catch (err: unknown) {
            Logger.error({ err: err }, "Job List Error");
        }
    }

    static handleJobSave(payload: ProtocolMap["JOB_SAVE_CONFIG"]["req"]) {
        try {
            const {
                id,
                name,
                archives,
                schedule,
                scheduleEnabled,
                nextRunAt,
                repository,
                encryption,
            } = payload.job;
            const jobId = id || randomUUID();

            const configObj = {
                archives: archives || [],
                repository: repository || undefined,
                encryption: encryption || undefined,
            };
            const configStr = JSON.stringify(configObj);

            const scheduleStr = schedule ? JSON.stringify(schedule) : null;
            const enabledInt = scheduleEnabled ? 1 : 0;

            JobRepository.upsert(
                jobId,
                name || "Unknown Job",
                configStr,
                enabledInt,
                scheduleStr,
            );

            if (scheduleEnabled && nextRunAt) {
                const existingState =
                    JobScheduleStateRepository.findById(jobId);
                if (existingState) {
                    JobScheduleStateRepository.updateNextRun(jobId, nextRunAt);
                } else {
                    JobScheduleStateRepository.insert(jobId, nextRunAt, null);
                }
            }

            Connection.send(WS_EVENTS.JOB_SAVE_CONFIG, {
                requestId: payload.requestId,
                success: true,
            } as any);
        } catch (err: unknown) {
            Logger.error({ err: err }, "Job Save Error");
            Connection.send(WS_EVENTS.JOB_SAVE_CONFIG, {
                requestId: payload.requestId,
                success: false,
                error: err instanceof Error ? err.message : String(err),
            } as any);
        }
    }

    static handleJobDelete(payload: ProtocolMap["JOB_DELETE_CONFIG"]["req"]) {
        try {
            JobRepository.delete(payload.jobId);
            JobScheduleStateRepository.delete(payload.jobId);
            Connection.send(WS_EVENTS.JOB_DELETE_CONFIG, {
                requestId: payload.requestId,
                success: true,
            } as any);
        } catch (err: unknown) {
            Logger.error({ err: err }, "Job Delete Error");
        }
    }

    /**
     * Generates a new encryption key via `proxmox-backup-client key create`.
     * The key is written to a temp file, read back, and returned over WS.
     * The job database is NOT modified here — the caller is responsible for
     * including keyContent in the job config when saving.
     */
    static handleGenerateKey(
        payload: ProtocolMap["GENERATE_KEY_CONFIG"]["req"],
    ) {
        const { requestId } = payload;
        const command = config.executable || "proxmox-backup-client";
        const tempFilePath = path.join(
            os.tmpdir(),
            `pbcm_keygen_${randomUUID()}.json`,
        );
        const args = ["key", "create", tempFilePath, "--kdf", "none"];

        const child = spawn(command, args, {
            shell: false,
            env: { ...process.env },
            stdio: ["pipe", "pipe", "pipe"],
        });

        let stderr = "";
        child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));

        let hasErrored = false;
        child.on("error", (err: Error) => {
            hasErrored = true;
            Logger.error({ err: err }, "Generate Key Error");
            Connection.send(WS_EVENTS.GENERATE_KEY_CONFIG, {
                requestId,
                success: false,
                error: "Failed to start proxmox-backup-client: " + err.message,
            } as any);
        });

        child.on("close", (code: number | null) => {
            if (hasErrored) return;

            if (code !== 0) {
                Connection.send(WS_EVENTS.GENERATE_KEY_CONFIG, {
                    requestId,
                    success: false,
                    error: "proxmox-backup-client key create failed: " + stderr,
                } as any);
                return;
            }

            try {
                const keyContent = fs.readFileSync(tempFilePath, "utf-8");
                fs.unlinkSync(tempFilePath);
                Connection.send(WS_EVENTS.GENERATE_KEY_CONFIG, {
                    requestId,
                    success: true,
                    keyContent,
                } as any);
            } catch (e: unknown) {
                Connection.send(WS_EVENTS.GENERATE_KEY_CONFIG, {
                    requestId,
                    success: false,
                    error:
                        "Failed to read generated key: " +
                        (e instanceof Error ? e.message : String(e)),
                } as any);
            }
        });
    }

    static handleHistory(payload: ProtocolMap["HISTORY"]["req"]) {
        try {
            const rawHistory = JobHistoryRepository.getRecentHistory(50);
            const history = rawHistory.map((h) => ({
                ...h,
                jobConfigId: h.job_id,
                startTime: h.start_time,
                endTime: h.end_time,
                exitCode: h.exit_code,
            }));
            Connection.send(WS_EVENTS.HISTORY, {
                requestId: payload.requestId,
                history,
            } as any);
        } catch (err: unknown) {
            Logger.error({ err: err }, "History Error");
        }
    }
}
