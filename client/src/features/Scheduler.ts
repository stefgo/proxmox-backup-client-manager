import WebSocket from "ws";
import db from "../core/db.js";
import { randomUUID } from "crypto";
import { Executor } from "./Executor.js";
import { ScheduleConfig } from "@pbcm/shared";
import { Logger } from "../core/Logger.js";

export class Scheduler {
    private static interval: NodeJS.Timeout | null = null;

    static start() {
        if (this.interval) clearInterval(this.interval);
        Logger.info("Starting Scheduler Loop...");

        this.interval = setInterval(() => {
            this.run();
        }, 60000); // Check every minute

        this.run();
    }

    private static calculateNextRun(
        schedule: ScheduleConfig,
        fromDate: Date,
    ): Date {
        const unitMultipliers: { [key: string]: number } = {
            seconds: 1000,
            minutes: 60 * 1000,
            hours: 60 * 60 * 1000,
            days: 24 * 60 * 60 * 1000,
            weeks: 7 * 24 * 60 * 60 * 1000,
        };
        const intervalMs =
            schedule.interval * (unitMultipliers[schedule.unit] || 0);
        let nextDate = new Date(fromDate.getTime() + intervalMs);

        if (schedule.weekdays && schedule.weekdays.length > 0) {
            let checks = 0;
            while (checks < 14) {
                const dayName = nextDate
                    .toLocaleDateString("en-US", { weekday: "short" })
                    .toLowerCase();
                if (schedule.weekdays.includes(dayName)) {
                    break;
                }
                nextDate = new Date(nextDate.getTime() + 24 * 60 * 60 * 1000);
                checks++;
            }
        }

        return nextDate;
    }

    private static run() {
        try {
            const jobs = db.prepare("SELECT * FROM job").all() as any[];
            const now = new Date();

            jobs.forEach((job) => {
                if (!job.schedule_enabled) return;
                if (!job.schedule) return;

                let schedule: ScheduleConfig;
                try {
                    schedule = JSON.parse(job.schedule);
                } catch (e) {
                    return;
                }

                let state = db
                    .prepare("SELECT * FROM job_schedule_state WHERE id = ?")
                    .get(job.id) as any;

                if (!state || !state.next_run) {
                    const initNext = new Date();
                    try {
                        if (state) {
                            db.prepare(
                                "UPDATE job_schedule_state SET next_run = ? WHERE id = ?",
                            ).run(initNext.toISOString(), job.id);
                        } else {
                            db.prepare(
                                "INSERT INTO job_schedule_state (id, next_run, last_run) VALUES (?, ?, ?)",
                            ).run(job.id, initNext.toISOString(), null);
                        }
                        Logger.info(
                            `Initialized next_run for job ${job.name} to ${initNext.toISOString()}`,
                        );
                    } catch (e) {
                        Logger.error("Init State Error", e);
                    }
                    return;
                }

                const nextRun = new Date(state.next_run);
                if (now >= nextRun) {
                    Logger.info(
                        `Scheduler triggering Job ${job.name} (${job.id})`,
                    );

                    const runId = randomUUID();
                    Executor.executeBackup(runId, job.id);

                    const newNextRun = this.calculateNextRun(schedule, nextRun); // Base on intent time or actual time? Usually actual or intent.
                    // Legacy code used nextRun (intent).

                    try {
                        db.prepare(
                            "UPDATE job_schedule_state SET last_run = ?, next_run = ? WHERE id = ?",
                        ).run(
                            now.toISOString(),
                            newNextRun.toISOString(),
                            job.id,
                        );
                        Logger.info(
                            `Scheduled next run for ${job.name} at ${newNextRun.toISOString()}`,
                        );
                    } catch (e) {
                        Logger.error("Update State Error", e);
                    }
                }
            });
        } catch (e) {
            Logger.error("Scheduler Error", e);
        }
    }
}
