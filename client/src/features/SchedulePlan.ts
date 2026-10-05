import {
    ScheduleConfig,
    ScheduleConfigSchema,
    isMissedRun,
    missedRunReason,
    nextRunPast,
} from "@pbcm/shared";

/**
 * What the scheduler decides about one job on one tick, as pure functions of the stored
 * schedule, the stored state and the time. `Scheduler` reads the files, starts the run and
 * reports; nothing in here does.
 */

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
export function parseStoredSchedule(raw: string) {
    let json: unknown;
    try {
        json = JSON.parse(raw);
    } catch {
        json = undefined;
    }
    return ScheduleConfigSchema.safeParse(json);
}

/** The part of a job's stored state a due run is planned from. */
export interface DueRunState {
    next_run: string;
    anchor: string | null;
    entered_at: string | null;
}

/** A run that is due now: when the job runs next, and what to say if this one came late. */
export interface DueRun {
    next: Date;
    /** The schedule was too far behind to catch up and is anchored on `now` (see nextRunPast). */
    resynced: boolean;
    /** The text of the history entry when the scheduled time was missed, otherwise null. */
    missedReason: string | null;
}

const validDate = (value: string | null): Date | null => {
    if (!value) return null;
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
};

/**
 * Whether the job's scheduled time has come, and if so what follows from it. `null` while
 * `next_run` is still ahead. A stored `anchor` or `entered_at` that is no date counts as
 * absent rather than poisoning the next run.
 */
export function planDueRun(schedule: ScheduleConfig, state: DueRunState, now: Date): DueRun | null {
    const scheduled = new Date(state.next_run);
    if (!(now >= scheduled)) return null;

    // The missed runs are triggered exactly once; this puts the schedule back in sync in
    // one go (see nextRunPast).
    const { next, resynced, due } = nextRunPast(schedule, scheduled, now, validDate(state.anchor));
    const missed = isMissedRun(scheduled, now, validDate(state.entered_at));
    return {
        next,
        resynced,
        missedReason: missed ? missedRunReason(scheduled, now, due, resynced) : null,
    };
}
