import { randomUUID } from "crypto";
import { JobRepository } from "../repositories/JobRepository.js";
import { JobScheduleStateRepository } from "../repositories/JobScheduleStateRepository.js";
import { Executor } from "./Executor.js";
import { ScheduleConfig, ScheduleConfigSchema, WS_EVENTS, nextRunPast } from "@pbcm/shared";
import { logger } from "@pbcm/shared/node";
import { Connection } from "../core/Connection.js";

export class Scheduler {
    private static interval: NodeJS.Timeout | null = null;

    /** Job ids already reported as unschedulable, so the loop warns once, not per tick. */
    private static invalidScheduleWarned = new Set<string>();

    /**
     * Parses the schedule stored in jobs.json against the same schema the API
     * validates against. An entry that fails here could not have been written by a
     * current client — it is legacy or corrupt data, and running it would mean
     * guessing at the interval.
     *
     * This also keeps nextRunAfter honest: the schema guarantees a known unit
     * and a finite interval >= 1, so the step is always positive and next_run always
     * moves forward. Without it, an unknown unit yields a 0ms step and the job fires
     * on every single tick, forever.
     */
    private static parseSchedule(
        jobId: string,
        jobName: string,
        raw: string,
    ): ScheduleConfig | null {
        let json: unknown;
        try {
            json = JSON.parse(raw);
        } catch {
            json = undefined;
        }

        const parsed = ScheduleConfigSchema.safeParse(json);
        if (parsed.success) {
            this.invalidScheduleWarned.delete(jobId);
            return parsed.data;
        }

        if (!this.invalidScheduleWarned.has(jobId)) {
            this.invalidScheduleWarned.add(jobId);
            logger.warn(
                { issues: parsed.error.issues },
                `Job ${jobName} (${jobId}) has an unusable schedule and is skipped by the scheduler.`,
            );
        }
        return null;
    }

    /**
     * Starts the client-side scheduling loop. Checks the jobs every minute
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

    private static run() {
        try {
            const jobs = JobRepository.findAll();
            const now = new Date();

            jobs.forEach((job) => {
                if (!job.schedule_enabled) return;
                if (!job.schedule) return;

                const schedule = this.parseSchedule(
                    job.id,
                    job.name,
                    job.schedule,
                );
                if (!schedule) return;

                const state = JobScheduleStateRepository.findById(job.id);

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

                    const anchor = state.anchor ? new Date(state.anchor) : null;
                    // The missed runs are triggered exactly once, above; this puts the
                    // schedule back in sync in one go (see nextRunPast).
                    const { next: newNextRun, resynced } = nextRunPast(
                        schedule,
                        nextRun,
                        now,
                        anchor && !isNaN(anchor.getTime()) ? anchor : null,
                    );
                    if (resynced) {
                        logger.warn(
                            `Job ${job.name} is too many intervals behind to catch up; ` +
                                `anchoring the next run on the current time.`,
                        );
                    }
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
