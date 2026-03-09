import { randomUUID } from "crypto";
import { JobRepository, JobRow } from "../repositories/JobRepository.js";
import {
    JobScheduleStateRepository,
    StateRow,
} from "../repositories/JobScheduleStateRepository.js";
import { Executor } from "./Executor.js";
import { ScheduleConfig, WS_EVENTS } from "@pbcm/shared";
import { logger } from "../core/logger.js";
import { Connection } from "../core/Connection.js";

export class Scheduler {
    private static interval: NodeJS.Timeout | null = null;

    /**
     * Starts the client-side scheduling loop. Checks the database every minute
     * for any jobs that have reached their scheduled 'next_run' time. If a job
     * should run, it spawns the Executor.
     */
    static start() {
        if (this.interval) clearInterval(this.interval);
        logger.info("Starting Scheduler Loop...");

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
            const jobs = JobRepository.findAll();
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

                let state = JobScheduleStateRepository.findById(job.id);

                if (!state || !state.next_run) {
                    const initNext = new Date();
                    const nextDateStr = initNext.toISOString();
                    try {
                        if (state) {
                            JobScheduleStateRepository.updateNextRun(
                                job.id,
                                nextDateStr,
                            );
                        } else {
                            JobScheduleStateRepository.insert(
                                job.id,
                                nextDateStr,
                                null,
                            );
                        }
                        logger.info(
                            `Initialized next_run for job ${job.name} to ${initNext.toISOString()}`,
                        );
                        Connection.send(WS_EVENTS.JOB_NEXT_RUN_UPDATE, {
                            jobId: job.id,
                            nextRunAt: initNext.toISOString(),
                        });
                    } catch (e) {
                        logger.error({ err: e }, "Init State Error");
                    }
                    return;
                }

                const nextRun = new Date(state.next_run);
                if (now >= nextRun) {
                    logger.info(
                        `Scheduler triggering Job ${job.name} (${job.id})`,
                    );

                    const runId = randomUUID();
                    Executor.executeBackup(runId, job.id);

                    const newNextRun = this.calculateNextRun(schedule, nextRun); // Base on intent time or actual time? Usually actual or intent.
                    // Legacy code used nextRun (intent).
                    const nextDateStr = newNextRun.toISOString();

                    try {
                        JobScheduleStateRepository.updateBoth(
                            job.id,
                            now.toISOString(),
                            nextDateStr,
                        );
                        logger.info(
                            `Scheduled next run for ${job.name} at ${newNextRun.toISOString()}`,
                        );
                        Connection.send(WS_EVENTS.JOB_NEXT_RUN_UPDATE, {
                            jobId: job.id,
                            nextRunAt: newNextRun.toISOString(),
                        });
                    } catch (e) {
                        logger.error({ err: e }, "Update State Error");
                    }
                }
            });
        } catch (e) {
            logger.error({ err: e }, "Scheduler Error");
        }
    }
}
