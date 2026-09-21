import fs from "fs";
import type { DatabaseSync } from "node:sqlite";
import { logger } from "@pbcm/shared/node";
import { pathOf, writeJsonFile } from "./DataStore.js";
import {
    JOBS_FILE,
    StoredJob,
    StoredJobSchema,
} from "../repositories/JobRepository.js";
import {
    SCHEDULE_FILE,
    ScheduleState,
} from "../repositories/JobScheduleStateRepository.js";

const LEGACY_DB = "client.db";

/**
 * SQLite wrote `CURRENT_TIMESTAMP` as `YYYY-MM-DD HH:MM:SS` in UTC; everything the agent
 * writes itself is ISO 8601. Brought into one form so the two sort together.
 */
function isoTimestamp(value: unknown): string | null {
    if (typeof value !== "string" || value === "") return null;
    const sqlite = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(value);
    return sqlite ? `${sqlite[1]}T${sqlite[2]}.000Z` : value;
}

function parseJson(value: unknown): unknown {
    if (typeof value !== "string") return undefined;
    try {
        return JSON.parse(value);
    } catch {
        return undefined;
    }
}

function hasTable(db: DatabaseSync, name: string): boolean {
    return (
        db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !==
        undefined
    );
}

function columnsOf(db: DatabaseSync, table: string): Set<string> {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    return new Set(rows.map((row) => row.name));
}

function readJobs(db: DatabaseSync): StoredJob[] {
    if (!hasTable(db, "job")) return [];
    const rows = db
        .prepare("SELECT id, name, config, schedule, schedule_enabled, created_at FROM job")
        .all() as Record<string, unknown>[];

    const jobs: StoredJob[] = [];
    for (const row of rows) {
        const config = parseJson(row.config);
        const schedule = row.schedule === null ? null : parseJson(row.schedule);
        if (config === undefined || schedule === undefined) {
            logger.warn(
                { jobId: row.id },
                "A job's config or schedule column did not parse; importing it without that part",
            );
        }
        const parsed = StoredJobSchema.safeParse({
            id: row.id,
            name: row.name,
            config: config && typeof config === "object" ? config : {},
            schedule: schedule ?? null,
            scheduleEnabled: Boolean(row.schedule_enabled),
            createdAt: isoTimestamp(row.created_at) ?? new Date().toISOString(),
        });
        if (parsed.success) jobs.push(parsed.data);
        else logger.warn({ jobId: row.id }, "Skipping a job row that cannot be imported");
    }
    return jobs;
}

function readScheduleStates(db: DatabaseSync, jobIds: Set<string>): Record<string, ScheduleState> {
    if (!hasTable(db, "job_schedule_state")) return {};
    const rows = db
        .prepare("SELECT id, last_run, next_run FROM job_schedule_state")
        .all() as Record<string, unknown>[];

    const states: Record<string, ScheduleState> = {};
    for (const row of rows) {
        if (typeof row.id !== "string" || !jobIds.has(row.id)) continue;
        states[row.id] = {
            lastRun: isoTimestamp(row.last_run),
            nextRun: isoTimestamp(row.next_run),
        };
    }
    return states;
}

/**
 * The history is not imported. What is counted here is what that leaves behind -- above all
 * the runs the server never acknowledged, which it will now not receive.
 */
function countHistory(db: DatabaseSync): { total: number; unsynced: number | null } {
    const table = hasTable(db, "job_history") ? "job_history" : hasTable(db, "history") ? "history" : null;
    if (!table) return { total: 0, unsynced: 0 };

    const total = (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
    const columns = columnsOf(db, table);
    if (!columns.has("revision") || !columns.has("synced_revision")) {
        return { total, unsynced: null };
    }
    const unsynced = (
        db
            .prepare(
                `SELECT COUNT(*) AS n FROM ${table}
                 WHERE synced_revision IS NULL OR synced_revision < revision`,
            )
            .get() as { n: number }
    ).n;
    return { total, unsynced };
}

/**
 * Moves an agent from its SQLite database to the data files, once.
 *
 * Runs when `client.db` is there and `jobs.json` is not. Only the jobs and their schedule
 * state come across; the history stays in the database, which is renamed to
 * `client.db.migrated` rather than deleted.
 *
 * `jobs.json` is written last: it is what marks the import as done, so a start that is cut
 * short before it simply imports again. For the same reason a failure here stops the agent.
 * Starting without the jobs would let the next save create a `jobs.json`, and with it the
 * import would never run again.
 *
 * `node:sqlite` is loaded only when there is something to import. It is still experimental
 * in Node 22 and says so on stderr when loaded; an agent that has been migrated never loads it.
 */
export async function importLegacyDatabase(): Promise<void> {
    const dbFile = pathOf(LEGACY_DB);
    if (!fs.existsSync(dbFile)) return;
    if (fs.existsSync(pathOf(JOBS_FILE))) {
        logger.warn(
            { file: dbFile },
            "Found client.db next to jobs.json. It is not read any more; remove it once it is no longer needed.",
        );
        return;
    }

    logger.info({ file: dbFile }, "Importing jobs and schedule state from the SQLite database");

    try {
        const { DatabaseSync } = await import("node:sqlite");
        const db = new DatabaseSync(dbFile, { readOnly: true });
        let jobs: StoredJob[];
        let states: Record<string, ScheduleState>;
        let history: { total: number; unsynced: number | null };
        try {
            jobs = readJobs(db);
            states = readScheduleStates(db, new Set(jobs.map((job) => job.id)));
            history = countHistory(db);
        } finally {
            db.close();
        }

        if (!writeJsonFile(SCHEDULE_FILE, states) || !writeJsonFile(JOBS_FILE, jobs)) {
            throw new Error("Could not write the imported data to the data directory");
        }

        for (const suffix of ["", "-wal", "-shm", "-journal"]) {
            const file = `${dbFile}${suffix}`;
            if (fs.existsSync(file)) fs.renameSync(file, `${pathOf(LEGACY_DB)}.migrated${suffix}`);
        }

        logger.info(
            {
                jobs: jobs.length,
                scheduleStates: Object.keys(states).length,
                historyLeftBehind: history.total,
            },
            "Imported the SQLite database; it was renamed to client.db.migrated",
        );
        if (history.unsynced !== null && history.unsynced > 0) {
            logger.warn(
                { unsynced: history.unsynced },
                "History entries the server had not acknowledged were not imported and will not reach it",
            );
        }
    } catch (err) {
        logger.fatal(
            { err, file: dbFile },
            "Could not import the SQLite database. The agent does not start without its jobs; " +
                "fix the cause (Node 22.13 or later is needed for node:sqlite) and start it again.",
        );
        throw err;
    }
}
