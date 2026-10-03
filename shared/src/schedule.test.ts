import { describe, expect, it } from "vitest";
import { nextRunAfter, nextRunPast, upcomingRuns } from "./schedule.js";
import type { ScheduleConfig } from "./types.js";

// The schedule runs on the local clock, so the tests pin one -- with a clock change in it.
process.env.TZ = "Europe/Berlin";

const schedule = (changes: Partial<ScheduleConfig> = {}): ScheduleConfig => ({
    interval: 1,
    unit: "days",
    weekdays: [],
    ...changes,
});

/** Local wall-clock time, as an operator reads it. */
const local = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ` +
    `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

describe("nextRunAfter", () => {
    it("steps a short unit by its fixed length", () => {
        const from = new Date(2026, 9, 3, 14, 30);
        expect(local(nextRunAfter(schedule({ interval: 2, unit: "hours" }), from, null))).toBe("2026-10-03 16:30");
        expect(local(nextRunAfter(schedule({ interval: 15, unit: "minutes" }), from, null))).toBe("2026-10-03 14:45");
    });

    it("steps days and weeks by date", () => {
        const from = new Date(2026, 9, 3, 2, 0);
        expect(local(nextRunAfter(schedule({ interval: 3 }), from, null))).toBe("2026-10-06 02:00");
        expect(local(nextRunAfter(schedule({ unit: "weeks" }), from, null))).toBe("2026-10-10 02:00");
    });

    it("keeps a daily job at its time of day across a clock change", () => {
        // The night to 2026-10-25 is 25 hours long in Berlin.
        const from = new Date(2026, 9, 24, 2, 30);
        const next = nextRunAfter(schedule(), from, from);
        expect(local(next)).toBe("2026-10-25 02:30");
        expect(local(nextRunAfter(schedule(), next, from))).toBe("2026-10-26 02:30");
    });

    it("takes the time of day from the anchor, not from a run that came late", () => {
        const anchor = new Date(2026, 9, 1, 2, 0);
        const late = new Date(2026, 9, 3, 2, 7);
        expect(local(nextRunAfter(schedule(), late, anchor))).toBe("2026-10-04 02:00");
    });

    it("moves on to the next day that is allowed", () => {
        // 2026-10-03 is a Saturday.
        const from = new Date(2026, 9, 3, 2, 0);
        const weekdaysOnly = schedule({ weekdays: ["mon", "tue", "wed", "thu", "fri"] });
        expect(local(nextRunAfter(weekdaysOnly, from, from))).toBe("2026-10-05 02:00");
    });

    it("gives an hourly job no time of day when it skips to an allowed day", () => {
        const from = new Date(2026, 9, 2, 23, 30); // Friday
        const next = nextRunAfter(schedule({ unit: "hours", weekdays: ["mon"] }), from, new Date(2026, 9, 1, 2, 0));
        expect(local(next)).toBe("2026-10-05 00:30");
    });

    it("ignores an empty list of weekdays", () => {
        const from = new Date(2026, 9, 3, 2, 0);
        expect(local(nextRunAfter(schedule({ weekdays: [] }), from, from))).toBe("2026-10-04 02:00");
    });
});

describe("nextRunPast", () => {
    it("catches up in one go after downtime", () => {
        const from = new Date(2026, 9, 1, 12, 0);
        const now = new Date(2026, 9, 3, 14, 30);
        const { next, resynced } = nextRunPast(schedule({ unit: "hours" }), from, now, null);
        expect(local(next)).toBe("2026-10-03 15:00");
        expect(resynced).toBe(false);
    });

    it("is one step when the run was on time", () => {
        const from = new Date(2026, 9, 3, 2, 0);
        const { next } = nextRunPast(schedule(), from, new Date(2026, 9, 3, 2, 0, 30), from);
        expect(local(next)).toBe("2026-10-04 02:00");
    });

    it("anchors on now when the schedule is too far behind to catch up", () => {
        const from = new Date(2026, 9, 1, 0, 0);
        const now = new Date(2026, 9, 3, 14, 30);
        const { next, resynced } = nextRunPast(schedule({ unit: "seconds" }), from, now, null);
        expect(resynced).toBe(true);
        expect(next.getTime()).toBe(now.getTime() + 1000);
    });
});

describe("upcomingRuns", () => {
    const now = new Date(2026, 9, 3, 14, 30);

    it("starts with the start that was set", () => {
        const start = new Date(2026, 9, 4, 2, 0);
        expect(upcomingRuns(schedule(), start, now, 3).map(local)).toEqual([
            "2026-10-04 02:00",
            "2026-10-05 02:00",
            "2026-10-06 02:00",
        ]);
    });

    it("runs the start on a day the weekdays leave out, and only then follows them", () => {
        // Saturday; the repetitions are on Mondays.
        const start = new Date(2026, 9, 3, 20, 0);
        expect(upcomingRuns(schedule({ weekdays: ["mon"] }), start, now, 3).map(local)).toEqual([
            "2026-10-03 20:00",
            "2026-10-05 20:00",
            "2026-10-12 20:00",
        ]);
    });

    it("runs at once when the start has passed, and picks the schedule up from there", () => {
        const start = new Date(2026, 9, 1, 2, 0);
        expect(upcomingRuns(schedule(), start, now, 3).map(local)).toEqual([
            "2026-10-03 14:30",
            "2026-10-04 02:00",
            "2026-10-05 02:00",
        ]);
    });

    it("has no runs to show for a count of none", () => {
        expect(upcomingRuns(schedule(), now, now, 0)).toEqual([]);
    });
});
