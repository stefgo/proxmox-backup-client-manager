import { createHash } from "crypto";
import { z } from "zod";
import { logger } from "@pbcm/shared/node";
import {
    listJsonFiles,
    readJsonFile,
    removeJsonFile,
    writeJsonFile,
} from "../core/DataStore.js";

const HISTORY_DIR = "history";

/**
 * How many runs the agent keeps once the server has them. The server holds the history;
 * what stays here is what the agent's own HISTORY answer shows (`getRecentHistory(50)`), plus
 * everything the server has not acknowledged yet -- that is kept however old it is.
 */
const HISTORY_KEEP = 50;

/** One run as `history/<id>.json` holds it. */
const HistoryRecordSchema = z.object({
    id: z.string().min(1),
    jobId: z.string().nullable(),
    name: z.string().nullable(),
    type: z.string(),
    status: z.string(),
    startTime: z.string(),
    endTime: z.string().nullable(),
    exitCode: z.number().nullable(),
    stdout: z.string().nullable(),
    stderr: z.string().nullable(),
    createdAt: z.string(),
    revision: z.number().int(),
    syncedRevision: z.number().int().nullable(),
});
type HistoryRecord = z.infer<typeof HistoryRecordSchema>;

/** What the index holds of a run: everything but its output, which is read when needed. */
type HistoryMeta = Omit<HistoryRecord, "stdout" | "stderr">;

/**
 * The fields the server stores. A change to any of them raises the revision, so the run is
 * due for sync again; a change to anything else -- the acknowledged revision above all --
 * does not.
 */
const SYNCED_FIELDS = [
    "status",
    "startTime",
    "endTime",
    "exitCode",
    "stdout",
    "stderr",
] as const;

export interface HistoryRow {
    id: string;
    job_id: string;
    type: string;
    status: string;
    start_time: string;
    end_time: string | null;
    name: string | null;
    exit_code: number | null;
    stdout: string | null;
    stderr: string | null;
}

/** A run as the history sync reads it: the stored fields plus the revision to confirm. */
export interface UnsyncedHistoryRow {
    id: string;
    job_id: string | null;
    name: string | null;
    type: string;
    status: string;
    start_time: string;
    end_time: string | null;
    exit_code: number | null;
    stdout: string | null;
    stderr: string | null;
    revision: number;
}

/**
 * The file a run is stored in. The id comes from the server for a run it started, so it is
 * used as a file name only when it cannot name anything but a file in this directory;
 * anything else is hashed. The id itself is always read from the content, never the name.
 */
function fileOf(id: string): string {
    const name = /^[A-Za-z0-9_-]{1,128}$/.test(id)
        ? id
        : createHash("sha256").update(id).digest("hex");
    return `${HISTORY_DIR}/${name}.json`;
}

function metaOf(run: HistoryRecord): HistoryMeta {
    const meta: Partial<HistoryRecord> = { ...run };
    delete meta.stdout;
    delete meta.stderr;
    return meta as HistoryMeta;
}

function isUnsynced(run: HistoryMeta): boolean {
    return run.syncedRevision === null || run.syncedRevision < run.revision;
}

function toRow(run: HistoryRecord): HistoryRow & UnsyncedHistoryRow {
    return {
        id: run.id,
        job_id: run.jobId as string,
        name: run.name,
        type: run.type,
        status: run.status,
        start_time: run.startTime,
        end_time: run.endTime,
        exit_code: run.exitCode,
        stdout: run.stdout,
        stderr: run.stderr,
        revision: run.revision,
    };
}

/**
 * The runs of this agent's jobs, one file per run.
 *
 * One file rather than one list: a run carries up to twice `logCapBytes` of output, and a
 * single file would be rewritten whole on every status change of every run. The index holds
 * everything but that output and is built once from the files; stdout and stderr are read
 * back only for the runs that are sent or shown.
 *
 * Every run carries a revision that goes up on each change to a field the server stores, and
 * the revision the server last acknowledged. A run is due for sync while the two differ -- a
 * counter rather than a timestamp, because a timestamp compared across two clocks at
 * one-second resolution let runs fall below the watermark and never be sent. The revision is
 * raised here, in `update`, and nowhere else, so no write can forget to.
 */
export class JobHistoryRepository {
    private static changeListener: (() => void) | null = null;
    private static index: Map<string, HistoryMeta> | null = null;

    /**
     * Registers the one party told about every write -- the history sync. A callback
     * rather than an import, so the repository does not depend on the feature built on it.
     */
    static onChange(listener: () => void): void {
        this.changeListener = listener;
    }

    private static changed(): void {
        this.changeListener?.();
    }

    private static load(): Map<string, HistoryMeta> {
        if (this.index) return this.index;
        this.index = new Map();

        let skipped = 0;
        for (const file of listJsonFiles(HISTORY_DIR)) {
            const parsed = HistoryRecordSchema.safeParse(readJsonFile(file));
            if (!parsed.success) {
                skipped++;
                continue;
            }
            this.index.set(parsed.data.id, metaOf(parsed.data));
        }
        if (skipped > 0) {
            logger.warn({ skipped }, "Skipped history files that do not parse");
        }

        this.prune();
        return this.index;
    }

    private static read(id: string): HistoryRecord | null {
        const parsed = HistoryRecordSchema.safeParse(readJsonFile(fileOf(id)));
        return parsed.success ? parsed.data : null;
    }

    private static write(run: HistoryRecord): void {
        if (!writeJsonFile(fileOf(run.id), run)) {
            throw new Error(`Could not store history entry ${run.id}`);
        }
        this.load().set(run.id, metaOf(run));
    }

    private static insert(
        run: Omit<HistoryRecord, "createdAt" | "revision" | "syncedRevision">,
    ): void {
        this.write({
            ...run,
            createdAt: new Date().toISOString(),
            revision: 1,
            syncedRevision: null,
        });
        this.changed();
    }

    /**
     * Applies a change to one run and raises its revision if a field the server stores
     * actually changed. Answers whether it did. A run that does not exist is left alone.
     */
    private static update(id: string, patch: Partial<HistoryRecord>): boolean {
        if (!this.load().has(id)) return false;
        const current = this.read(id);
        if (!current) return false;

        const next: HistoryRecord = { ...current, ...patch };
        const changed = SYNCED_FIELDS.some((field) => next[field] !== current[field]);
        if (changed) next.revision = current.revision + 1;
        if (!changed && next.syncedRevision === current.syncedRevision) return false;

        this.write(next);
        return changed;
    }

    /** Runs matching the filter, with their output read back. */
    private static readAll(filter: (run: HistoryMeta) => boolean): HistoryRecord[] {
        const runs: HistoryRecord[] = [];
        for (const meta of this.load().values()) {
            if (!filter(meta)) continue;
            const run = this.read(meta.id);
            if (run) runs.push(run);
        }
        return runs;
    }

    /**
     * Deletes the runs nobody needs any more. Kept are every run the server has not
     * acknowledged, every run still queued or running -- the restart logic acts on those --
     * and the newest HISTORY_KEEP.
     */
    private static prune(): void {
        const index = this.index;
        if (!index) return;

        const newest = [...index.values()]
            .sort((a, b) => b.startTime.localeCompare(a.startTime))
            .slice(0, HISTORY_KEEP)
            .map((run) => run.id);
        const keep = new Set(newest);

        let removed = 0;
        for (const run of [...index.values()]) {
            if (keep.has(run.id) || isUnsynced(run)) continue;
            if (run.status === "queued" || run.status === "running") continue;
            if (removeJsonFile(fileOf(run.id))) {
                index.delete(run.id);
                removed++;
            }
        }
        if (removed > 0) logger.debug({ removed }, "Pruned acknowledged history entries");
    }

    /**
     * Runs whose current revision the server has not acknowledged, oldest first.
     */
    static findUnsynced(limit: number): UnsyncedHistoryRow[] {
        const due = [...this.load().values()]
            .filter(isUnsynced)
            .sort(
                (a, b) =>
                    a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
            )
            .slice(0, limit);
        const ids = new Set(due.map((run) => run.id));
        return this.readAll((run) => ids.has(run.id))
            .sort(
                (a, b) =>
                    a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
            )
            .map(toRow);
    }

    /**
     * Records what the server acknowledged. The revision is the one it stored, not the
     * run's current one: a run that changed after it was sent stays due. Returns how many
     * runs moved forward.
     */
    static markSynced(entries: { id: string; revision: number }[]): number {
        const index = this.load();
        let changes = 0;
        for (const entry of entries) {
            const run = index.get(entry.id);
            if (!run) continue;
            if (run.syncedRevision !== null && run.syncedRevision >= entry.revision) continue;
            try {
                this.update(entry.id, { syncedRevision: entry.revision });
                changes++;
            } catch (err) {
                logger.error({ err, id: entry.id }, "Could not record a history acknowledgement");
            }
        }
        if (changes > 0) this.prune();
        return changes;
    }

    static insertNewJob(
        id: string,
        jobId: string,
        type: string,
        status: string,
        startTime: string,
        name: string,
    ): void {
        this.insert({
            id,
            jobId,
            name,
            type,
            status,
            startTime,
            endTime: null,
            exitCode: null,
            stdout: null,
            stderr: null,
        });
    }

    static getRecentHistory(limit: number): HistoryRow[] {
        const recent = [...this.load().values()]
            .sort((a, b) => b.startTime.localeCompare(a.startTime))
            .slice(0, limit);
        const ids = new Set(recent.map((run) => run.id));
        return this.readAll((run) => ids.has(run.id))
            .sort((a, b) => b.startTime.localeCompare(a.startTime))
            .map(toRow);
    }

    static findQueuedJobs(): HistoryRow[] {
        return this.readAll((run) => run.status === "queued").map(toRow);
    }

    static cleanUpRunningJobs(): number {
        const endTime = new Date().toISOString();
        let changes = 0;
        for (const run of [...this.load().values()]) {
            if (run.status !== "running") continue;
            if (this.update(run.id, { status: "abort", endTime })) changes++;
        }
        if (changes > 0) this.changed();
        return changes;
    }

    static insertSkippedJob(
        id: string,
        jobId: string,
        jobName: string | undefined,
        reason: string,
    ): void {
        const now = new Date().toISOString();
        this.insert({
            id,
            jobId,
            name: jobName || null,
            type: "backup",
            status: "skipped",
            startTime: now,
            endTime: now,
            exitCode: null,
            stdout: null,
            stderr: reason,
        });
    }

    static startRunningJob(
        id: string,
        jobId: string | null,
        type: string,
        startTime: string,
        name: string | null,
    ): void {
        if (this.load().has(id)) {
            this.update(id, { status: "running", startTime });
            this.changed();
            return;
        }
        this.insert({
            id,
            jobId,
            name,
            type,
            status: "running",
            startTime,
            endTime: null,
            exitCode: null,
            stdout: null,
            stderr: null,
        });
    }

    static findQueuedAndRunningJobs(): HistoryRow[] {
        return this.readAll(
            (run) => run.status === "running" || run.status === "queued",
        ).map(toRow);
    }

    static markRunning(id: string): void {
        this.update(id, { status: "running" });
        this.changed();
    }

    static finishJob(
        id: string,
        status: string,
        endTime: string,
        exitCode: number | null,
        stdout: string | null,
        stderr: string | null,
    ): void {
        this.update(id, { status, endTime, exitCode, stdout, stderr });
        this.changed();
    }

    static failJob(id: string, stderr: string): void {
        this.update(id, { status: "failed", stderr });
        this.changed();
    }

    static abortStaleJobsBefore(isoDateString: string, endTime: string): number {
        let changes = 0;
        for (const run of [...this.load().values()]) {
            if (run.status !== "running" && run.status !== "queued") continue;
            if (!(run.startTime < isoDateString)) continue;
            if (
                this.update(run.id, {
                    status: "abort",
                    endTime,
                    stderr: "Aborted on daemon startup (leftover state)",
                })
            ) {
                changes++;
            }
        }
        if (changes > 0) this.changed();
        return changes;
    }
}
