import type { ScheduleConfig } from "./types.js";

/** Upper bound for the catch-up loop, so a pathological schedule cannot stall the caller. */
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

/**
 * The same time of day `days` calendar days later, on the clock of whoever runs this (its
 * `TZ`). The time of day comes from `clock` when there is one, else from `date` itself.
 */
function addCalendarDays(date: Date, days: number, clock: Date | null): Date {
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
 * The run after `from`. Days and weeks are stepped by date, the shorter units by a fixed
 * length (see UNIT_DAYS). Everything here is on the local clock of the process: for the
 * agent that is the time zone its jobs keep, for the dashboard's preview the browser's.
 *
 * `anchor` is the run the schedule was started with; a calendar schedule takes its time of
 * day from it. An hourly one with weekdays has no time of day of its own.
 *
 * The schedule has to have passed `ScheduleConfigSchema`: a known unit and a finite
 * interval of at least 1 are what make the step positive.
 */
export function nextRunAfter(schedule: ScheduleConfig, from: Date, anchor: Date | null): Date {
    const days = UNIT_DAYS[schedule.unit];
    const clock = days === undefined ? null : anchor;
    let next =
        days === undefined
            ? new Date(from.getTime() + schedule.interval * UNIT_MULTIPLIERS[schedule.unit])
            : addCalendarDays(from, schedule.interval * days, clock);

    if (schedule.weekdays && schedule.weekdays.length > 0) {
        let checks = 0;
        while (checks < 14) {
            const dayName = next.toLocaleDateString("en-US", { weekday: "short" }).toLowerCase();
            if (schedule.weekdays.includes(dayName)) {
                break;
            }
            next = addCalendarDays(next, 1, clock);
            checks++;
        }
    }

    return next;
}

/**
 * The first run after `from` that lies after `now`.
 *
 * Advancing by a single interval is wrong after downtime: with an hourly job and a week
 * offline, the next run is 168 intervals behind, and a one-interval step would leave it in
 * the past -- so the job would trigger again on the very next tick, and the one after
 * that, for 168 minutes.
 *
 * `resynced` says the schedule was more than MAX_CATCHUP_STEPS intervals behind and was
 * anchored on `now` instead: that costs its exact phase but always terminates. Only
 * reachable for a very short interval combined with a very long outage.
 */
export function nextRunPast(
    schedule: ScheduleConfig,
    from: Date,
    now: Date,
    anchor: Date | null,
): { next: Date; resynced: boolean } {
    let next = nextRunAfter(schedule, from, anchor);

    for (let i = 0; next <= now && i < MAX_CATCHUP_STEPS; i++) {
        next = nextRunAfter(schedule, next, anchor);
    }

    if (next <= now) {
        return { next: nextRunAfter(schedule, now, anchor), resynced: true };
    }
    return { next, resynced: false };
}

/**
 * The next `count` runs of a schedule whose first run is set to `start`, as the agent will
 * make them. The first run is `start` itself whatever its weekday -- the weekdays apply to
 * the repetitions -- and a start that has already passed runs at once, with the schedule
 * picked up from there.
 */
export function upcomingRuns(
    schedule: ScheduleConfig,
    start: Date,
    now: Date,
    count: number,
): Date[] {
    const runs: Date[] = [];
    if (count <= 0) return runs;

    let last: Date;
    if (start <= now) {
        runs.push(now);
        last = nextRunPast(schedule, start, now, start).next;
    } else {
        last = start;
    }
    while (runs.length < count) {
        runs.push(last);
        last = nextRunAfter(schedule, last, start);
    }
    return runs;
}
