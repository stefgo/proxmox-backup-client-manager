import { randomUUID } from "crypto";
import { JobRepository } from "../repositories/JobRepository.js";
import { JobScheduleStateRepository } from "../repositories/JobScheduleStateRepository.js";
import { Executor } from "./Executor.js";
import { ScheduleConfig, ScheduleConfigSchema, WS_EVENTS } from "@pbcm/shared";
import { logger } from "@pbcm/shared/node";
import { Connection } from "../core/Connection.js";

/** Upper bound for the catch-up loop, so a pathological schedule cannot stall the tick. */
const MAX_CATCHUP_STEPS = 1000;

/** Units that are a fixed length of time. */
const UNIT_MULTIPLIERS: { [key: string]: number } = {
    seconds: 1000,
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
};

/**
 * Units that are calendar days, stepped by date rather than by milliseconds: a day is 23
 * or 25 hours long when the clocks change, and a job at 02:00 has to stay at 02:00 on the
 * agent's clock rather than move to 01:00 or 03:00 for the rest of the season.
 */
const UNIT_DAYS: { [key: string]: number } = {
    days: 1,
    weeks: 7,
};

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
     * This also keeps calculateNextRun honest: the schema guarantees a known unit
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

    /**
     * The same time of day `days` calendar days later, on the agent's clock (its `TZ`).
     * The time of day comes from `clock` when there is one, else from `date` itself.
     */
    private static addCalendarDays(date: Date, days: number, clock: Date | null): Date {
        const source = clock ?? date;
        const next = new Date(date.getTime());
        next.setDate(next.getDate() + days);
        next.setHours(
            source.getHours(),
            source.getMinutes(),
            source.getSeconds(),
            source.getMilliseconds(),
        );
        return next;
    }

    /**
     * The run after `fromDate`. Days and weeks are stepped by date, the shorter units by a
     * fixed length (see UNIT_DAYS). Everything here is on the agent's clock: the time of day
     * a daily job keeps and the weekday it is checked against are those of the agent's time
     * zone, which the dashboard shows next to the schedule.
     */
    private static calculateNextRun(
        schedule: ScheduleConfig,
        fromDate: Date,
        anchor: Date | null,
    ): Date {
        const days = UNIT_DAYS[schedule.unit];
        // Only a calendar schedule takes its time of day from the anchor; an hourly one
        // with weekdays has no time of day of its own.
        const clock = days === undefined ? null : anchor;
        let nextDate =
            days === undefined
                ? new Date(fromDate.getTime() + schedule.interval * UNIT_MULTIPLIERS[schedule.unit])
                : this.addCalendarDays(fromDate, schedule.interval * days, clock);

        if (schedule.weekdays && schedule.weekdays.length > 0) {
            let checks = 0;
            while (checks < 14) {
                const dayName = nextDate
                    .toLocaleDateString("en-US", { weekday: "short" })
                    .toLowerCase();
                if (schedule.weekdays.includes(dayName)) {
                    break;
                }
                nextDate = this.addCalendarDays(nextDate, 1, clock);
                checks++;
            }
        }

        return nextDate;
    }

    /**
     * Moves next_run forward until it lies in the future.
     *
     * Advancing by a single interval is wrong after downtime: with an hourly job and
     * a week offline, next_run is 168 intervals behind, and a one-interval step would
     * leave it in the past — so the job would trigger again on the very next tick, and
     * the one after that, for 168 minutes. The missed run is triggered exactly once by
     * the caller; this puts the schedule back in sync in one go.
     */
    private static advancePastNow(
        schedule: ScheduleConfig,
        from: Date,
        now: Date,
        jobName: string,
        anchor: Date | null,
    ): Date {
        let next = this.calculateNextRun(schedule, from, anchor);

        for (let i = 0; next <= now && i < MAX_CATCHUP_STEPS; i++) {
            next = this.calculateNextRun(schedule, next, anchor);
        }

        if (next <= now) {
            // Only reachable for a very short interval combined with a very long
            // outage (a 1s job offline for a day). Anchoring on now costs the exact
            // phase of the schedule but always terminates.
            logger.warn(
                `Job ${jobName} is more than ${MAX_CATCHUP_STEPS} intervals behind; ` +
                    `anchoring the next run on the current time.`,
            );
            next = this.calculateNextRun(schedule, now, anchor);
        }

        return next;
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
                    const newNextRun = this.advancePastNow(
                        schedule,
                        nextRun,
                        now,
                        job.name,
                        anchor && !isNaN(anchor.getTime()) ? anchor : null,
                    );
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
