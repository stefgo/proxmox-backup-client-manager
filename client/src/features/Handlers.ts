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
        } catch (err: any) {
            Logger.error("FS List Error", err);
            Connection.send(WS_EVENTS.FS_LIST, {
                requestId,
                error: err.message,
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
            Logger.error("Version Check Error", err);
            Connection.send(WS_EVENTS.GET_VERSION, {
                requestId,
                version: "",
                error: err.message,
            } as any);
        });
    }

    static async handleJobList(payload: ProtocolMap["JOB_LIST_CONFIG"]["req"]) {
        try {
            const rawJobs = db
                .prepare(
                    `
                SELECT j.*, s.last_run, s.next_run 
                FROM job j 
                LEFT JOIN job_schedule_state s ON j.id = s.id 
                ORDER BY j.created_at DESC
            `,
                )
                .all() as any[];

            const jobs: BackupJob[] = rawJobs.map((row) => {
                let config: any = {};
                try {
                    config = row.config ? JSON.parse(row.config) : {};
                } catch (e) { }

                const archives: any[] = config.archives || [];

                let schedule: ScheduleConfig | null = null;
                try {
                    if (row.schedule) schedule = JSON.parse(row.schedule);
                } catch (e) { }

                return {
                    id: row.id,
                    name: row.name,
                    archives,
                    schedule,
                    scheduleEnabled: Boolean(row.schedule_enabled),
                    createdAt: row.created_at,
                    nextRunAt: row.next_run,
                    lastRunAt: row.last_run,
                    repository: config.repository,
                    encryption: config.encryption,
                };
            });

            Connection.send(WS_EVENTS.JOB_LIST_CONFIG, {
                requestId: payload.requestId,
                jobs,
            } as any);
        } catch (err: any) {
            Logger.error("Job List Error", err);
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

            if (id) {
                db.prepare(`
                    UPDATE job 
                    SET name = ?, config = ?, schedule = ?, schedule_enabled = ?, updated_at = datetime('now') 
                    WHERE id = ?
                `).run(name, configStr, scheduleStr, enabledInt, id);
            } else {
                db.prepare(`
                    INSERT INTO job (id, name, config, schedule, schedule_enabled) 
                    VALUES (?, ?, ?, ?, ?)
                `).run(jobId, name, configStr, scheduleStr, enabledInt);
            }

            if (scheduleEnabled && nextRunAt) {
                const existingState = db
                    .prepare(`
                        SELECT id 
                        FROM job_schedule_state 
                        WHERE id = ?`)
                    .get(jobId);
                if (existingState) {
                    db.prepare(`
                        UPDATE job_schedule_state 
                        SET next_run = ? 
                        WHERE id = ?
                    `).run(nextRunAt, jobId);
                } else {
                    db.prepare(`
                        INSERT INTO job_schedule_state 
                        (id, next_run, last_run) 
                        VALUES (?, ?, ?)
                    `).run(jobId, nextRunAt, null);
                }
            }

            Connection.send(WS_EVENTS.JOB_SAVE_CONFIG, {
                requestId: payload.requestId,
                success: true,
            } as any);
        } catch (err: any) {
            Logger.error("Job Save Error", err);
            Connection.send(WS_EVENTS.JOB_SAVE_CONFIG, {
                requestId: payload.requestId,
                success: false,
                error: err.message,
            } as any);
        }
    }

    static handleJobDelete(payload: ProtocolMap["JOB_DELETE_CONFIG"]["req"]) {
        try {
            db.prepare(`DELETE FROM job WHERE id = ?`).run(payload.jobId);
            db.prepare(`DELETE FROM job_schedule_state WHERE id = ?`).run(payload.jobId);
            Connection.send(WS_EVENTS.JOB_DELETE_CONFIG, {
                requestId: payload.requestId,
                success: true,
            } as any);
        } catch (err: any) {
            Logger.error("Job Delete Error", err);
        }
    }

    /**
     * Generates a new encryption key via `proxmox-backup-client key create`.
     * The key is written to a temp file, read back, and returned over WS.
     * The job database is NOT modified here — the caller is responsible for
     * including keyContent in the job config when saving.
     */
    static handleGenerateKey(payload: ProtocolMap["GENERATE_KEY_CONFIG"]["req"]) {
        const { requestId } = payload;
        const command = config.executable || "proxmox-backup-client";
        const tempFilePath = path.join(os.tmpdir(), `pbcm_keygen_${randomUUID()}.json`);
        const args = ["key", "create", tempFilePath, "--kdf", "none"];

        const child = spawn(command, args, {
            shell: false,
            env: { ...process.env },
            stdio: ["pipe", "pipe", "pipe"],
        });

        let stderr = "";
        child.stderr?.on('data', (d: Buffer) => stderr += d.toString());

        let hasErrored = false;
        child.on('error', (err: Error) => {
            hasErrored = true;
            Logger.error("Generate Key Error", err);
            Connection.send(WS_EVENTS.GENERATE_KEY_CONFIG, {
                requestId,
                success: false,
                error: "Failed to start proxmox-backup-client: " + err.message,
            } as any);
        });

        child.on('close', (code: number | null) => {
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
                const keyContent = fs.readFileSync(tempFilePath, 'utf-8');
                fs.unlinkSync(tempFilePath);
                Connection.send(WS_EVENTS.GENERATE_KEY_CONFIG, {
                    requestId,
                    success: true,
                    keyContent,
                } as any);
            } catch (e: any) {
                Connection.send(WS_EVENTS.GENERATE_KEY_CONFIG, {
                    requestId,
                    success: false,
                    error: "Failed to read generated key: " + e.message,
                } as any);
            }
        });
    }

    static handleHistory(payload: ProtocolMap["HISTORY"]["req"]) {
        try {
            const rawHistory = db
                .prepare(`
                    SELECT * 
                    FROM history 
                    ORDER BY start_time DESC LIMIT 50`)
                .all() as any[];
            const history = rawHistory.map((h) => ({
                ...h,
                jobConfigId: h.job_config_id,
                startTime: h.start_time,
                endTime: h.end_time,
                exitCode: h.exit_code,
            }));
            Connection.send(WS_EVENTS.HISTORY, {
                requestId: payload.requestId,
                history,
            } as any);
        } catch (err: any) {
            Logger.error("History Error", err);
        }
    }
}
