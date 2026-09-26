import { z } from "zod";
import { logger } from "@pbcm/shared/node";
import { readJsonFile, writeJsonFile } from "../core/DataStore.js";

export const SCHEDULE_FILE = "schedule.json";

/** One job's entry in `schedule.json`, keyed there by the job id. */
export const ScheduleStateSchema = z.object({
    lastRun: z.string().nullable().default(null),
    nextRun: z.string().nullable().default(null),
    /**
     * The start the operator entered, kept apart from `nextRun` because that one moves. A
     * daily or weekly schedule takes its time of day from here, so a run that had to move --
     * 02:30 on the night the clocks go forward does not exist -- does not carry the shift
     * into every run after it. `null` for state written before the field, and for a job
     * the scheduler initialised itself; its runs keep the time of day of the previous one.
     */
    anchor: z.string().nullable().default(null),
});
export type ScheduleState = z.infer<typeof ScheduleStateSchema>;

export interface StateRow {
    id: string;
    last_run: string | null;
    next_run: string | null;
    anchor: string | null;
}

/**
 * Reads the stored map, keeping each entry that parses. Nothing here is worth setting aside:
 * a job without state is re-initialised by the scheduler on its next tick.
 */
export function parseScheduleStates(stored: unknown): Map<string, ScheduleState> {
    const states = new Map<string, ScheduleState>();
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return states;
    for (const [id, value] of Object.entries(stored as Record<string, unknown>)) {
        const parsed = ScheduleStateSchema.safeParse(value);
        if (parsed.success) states.set(id, parsed.data);
    }
    return states;
}

/**
 * When each job last ran and is next due. Written on every scheduled run, so it lives apart
 * from `jobs.json`: a write here must never be the one that puts the job configuration at
 * risk.
 *
 * A failed write is logged by the data store and otherwise shrugged off. The state is still
 * held in memory, and what a restart loses is recomputed from the schedule.
 */
export class JobScheduleStateRepository {
    private static states: Map<string, ScheduleState> | null = null;

    private static load(): Map<string, ScheduleState> {
        if (!this.states) this.states = parseScheduleStates(readJsonFile(SCHEDULE_FILE));
        return this.states;
    }

    private static persist(): void {
        writeJsonFile(SCHEDULE_FILE, Object.fromEntries(this.load()));
    }

    private static set(id: string, state: ScheduleState): void {
        this.load().set(id, state);
        this.persist();
    }

    static findById(id: string): StateRow | undefined {
        const state = this.load().get(id);
        return state
            ? { id, last_run: state.lastRun, next_run: state.nextRun, anchor: state.anchor }
            : undefined;
    }

    /** `anchor` left out keeps the stored one; the scheduler moves `nextRun` alone. */
    static updateNextRun(id: string, nextRun: string | null, anchor?: string | null): void {
        const state = this.load().get(id);
        if (!state) return;
        this.set(id, { ...state, nextRun, ...(anchor === undefined ? {} : { anchor }) });
    }

    static insert(
        id: string,
        nextRun: string | null,
        lastRun: string | null,
        anchor: string | null = null,
    ): void {
        this.set(id, { lastRun, nextRun, anchor });
    }

    static updateBoth(id: string, lastRun: string, nextRun: string | null): void {
        const anchor = this.load().get(id)?.anchor ?? null;
        this.set(id, { lastRun, nextRun, anchor });
    }

    static delete(id: string): void {
        if (this.load().delete(id)) this.persist();
    }

    /** Drops the state of jobs that no longer exist. Called once the jobs are loaded. */
    static pruneOrphans(jobIds: Set<string>): void {
        const states = this.load();
        let removed = 0;
        for (const id of states.keys()) {
            if (!jobIds.has(id)) {
                states.delete(id);
                removed++;
            }
        }
        if (removed > 0) {
            this.persist();
            logger.info({ removed }, "Removed the schedule state of deleted jobs");
        }
    }
}
