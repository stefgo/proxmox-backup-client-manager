import { describe, expect, it } from "vitest";
import type { ScheduleConfig } from "@pbcm/shared";
import { parseStoredSchedule, planDueRun, type DueRunState } from "./SchedulePlan.js";

const hourly: ScheduleConfig = { interval: 1, unit: "hours", weekdays: [] };

const at = (iso: string) => new Date(iso);
const state = (over: Partial<DueRunState> = {}): DueRunState => ({
    next_run: "2026-03-10T12:00:00.000Z",
    anchor: null,
    entered_at: null,
    ...over,
});

describe("parseStoredSchedule", () => {
    it("reads a schedule as the API stores it", () => {
        const parsed = parseStoredSchedule('{"interval":2,"unit":"days","weekdays":["mon"]}');

        expect(parsed.success && parsed.data).toEqual({ interval: 2, unit: "days", weekdays: ["mon"] });
    });

    it("reads a schedule written before weekdays existed", () => {
        const parsed = parseStoredSchedule('{"interval":1,"unit":"hours"}');

        expect(parsed.success && parsed.data).toEqual(hourly);
    });

    it("refuses what would make the job fire on every tick", () => {
        // An unknown unit is a step of 0 ms, an interval below 1 or beyond a number likewise.
        expect(parseStoredSchedule('{"interval":1,"unit":"fortnights"}').success).toBe(false);
        expect(parseStoredSchedule('{"interval":0,"unit":"hours"}').success).toBe(false);
        expect(parseStoredSchedule('{"interval":1e999,"unit":"hours"}').success).toBe(false);
    });

    it("refuses what is not JSON instead of throwing", () => {
        expect(parseStoredSchedule("every hour").success).toBe(false);
        expect(parseStoredSchedule("").success).toBe(false);
    });
});

describe("planDueRun", () => {
    it("plans nothing while the scheduled time is still ahead", () => {
        expect(planDueRun(hourly, state(), at("2026-03-10T11:59:59.000Z"))).toBeNull();
    });

    it("plans nothing for a next run that is no date", () => {
        expect(planDueRun(hourly, state({ next_run: "soon" }), at("2026-03-10T12:00:00.000Z"))).toBeNull();
    });

    it("runs at the scheduled time and steps one interval on", () => {
        expect(planDueRun(hourly, state(), at("2026-03-10T12:00:00.000Z"))).toEqual({
            next: at("2026-03-10T13:00:00.000Z"),
            resynced: false,
            missedReason: null,
        });
    });

    it("does not call a run missed that the minute tick started a little late", () => {
        expect(planDueRun(hourly, state(), at("2026-03-10T12:04:00.000Z"))?.missedReason).toBeNull();
    });

    it("reports a run that started late as missed, with one catch-up for all that were due", () => {
        const due = planDueRun(hourly, state(), at("2026-03-10T15:30:00.000Z"));

        // 12:00, 13:00, 14:00 and 15:00 have come; the next one is the first still ahead.
        expect(due?.next).toEqual(at("2026-03-10T16:00:00.000Z"));
        expect(due?.resynced).toBe(false);
        expect(due?.missedReason).toContain("Scheduled for 2026-03-10T12:00:00.000Z");
        expect(due?.missedReason).toContain("4 scheduled runs were due");
    });

    it("does not report a start that was already in the past when it was entered", () => {
        const entered = state({ entered_at: "2026-03-10T15:00:00.000Z" });

        expect(planDueRun(hourly, entered, at("2026-03-10T15:30:00.000Z"))?.missedReason).toBeNull();
    });

    it("treats a stored anchor or entry time that is no date as absent", () => {
        const damaged = state({ anchor: "not a date", entered_at: "not a date" });
        const due = planDueRun(hourly, damaged, at("2026-03-10T15:30:00.000Z"));

        expect(due?.next).toEqual(at("2026-03-10T16:00:00.000Z"));
        expect(due?.missedReason).not.toBeNull();
    });

    it("anchors a schedule on now that is too far behind to catch up", () => {
        const everySecond: ScheduleConfig = { interval: 1, unit: "seconds", weekdays: [] };
        const now = at("2026-03-17T12:00:00.000Z");
        const due = planDueRun(everySecond, state(), now);

        expect(due?.resynced).toBe(true);
        expect(due!.next.getTime()).toBeGreaterThan(now.getTime());
        expect(due?.missedReason).toContain("More than");
    });
});
