import db from "../core/Database.js";
import {
    JOB_STATUS,
    StatusUpdatePayload,
    HistoryEntry,
    GlobalHistoryEntry,
    isFinalJobStatus,
    RunSnapshotDetailsSchema,
    type HistoryQuery,
    type RunSnapshotDetails,
    type WebhookRun,
} from "@pbcm/shared";

// The two writers below take payloads the WebSocketController has already run through
// their Zod schemas, so they can be typed instead of taking `any`.

const selectStatus = () => db.prepare("SELECT status FROM job_history WHERE id = ?");
const selectSnapshot = () =>
    db.prepare(
        "SELECT snapshot, snapshot_details, snapshot_error FROM job_history WHERE id = ?",
    );

/** The snapshot columns as a query returns them, before `withSnapshot` reads them. */
interface SnapshotColumns {
    snapshot: string | null;
    snapshotDetails: string | null;
    snapshotError: string | null;
}

/**
 * `snapshot_details` is JSON the agent sent; read back through its schema, so a row that
 * does not parse shows no details instead of breaking the list it is in.
 */
function parseSnapshotDetails(json: string | null): RunSnapshotDetails | null {
    if (!json) return null;
    try {
        const parsed = RunSnapshotDetailsSchema.safeParse(JSON.parse(json));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

function withSnapshot<T extends SnapshotColumns>(
    row: T,
): Omit<T, "snapshotDetails"> & { snapshotDetails: RunSnapshotDetails | null } {
    return { ...row, snapshotDetails: parseSnapshotDetails(row.snapshotDetails) };
}

/** The snapshot fields of a run as it is stored now, for the webhook built from it. */
function storedSnapshot(id: string): Pick<WebhookRun, "snapshot" | "snapshotDetails" | "snapshotError"> {
    const row = selectSnapshot().get(id) as
        | { snapshot: string | null; snapshot_details: string | null; snapshot_error: string | null }
        | undefined;
    return {
        snapshot: row?.snapshot ?? null,
        snapshotDetails: parseSnapshotDetails(row?.snapshot_details ?? null),
        snapshotError: row?.snapshot_error ?? null,
    };
}

/** Details as a column value: JSON, or null when there are none. */
function detailsColumn(details: RunSnapshotDetails | null | undefined): string | null {
    return details ? JSON.stringify(details) : null;
}

/**
 * The snapshot columns of the two upserts. Kept when a write does not carry them: a
 * post-script that turns a success into a failure sends its update without them, and an
 * agent of an older build never sends any. Details that arrive clear an earlier error.
 */
/** What narrows the global history; each is optional and they combine with AND. */
export type HistoryFilter = Pick<HistoryQuery, "status" | "clientId" | "search">;

/** The columns a search reads: what a row of the history shows, and the id it is named by. */
const SEARCH_COLUMNS = ["h.name", "h.job_id", "h.id", "c.hostname", "c.display_name"];

/**
 * A search text as a LIKE pattern that matches it anywhere. `%` and `_` are escaped, so
 * a job named `db_backup` is found by its name and not by `dbXbackup` as well.
 */
function likePattern(text: string): string {
    return `%${text.replace(/[\\%_]/g, "\\$&")}%`;
}

/**
 * The WHERE clause for a filter, over `job_history h` joined to `clients c`. One function
 * for the page and for its count, so the total cannot describe a different set than the
 * rows.
 */
function historyWhere(filter: HistoryFilter): { where: string; params: string[] } {
    const conditions: string[] = [];
    const params: string[] = [];
    if (filter.status) {
        conditions.push("h.status = ?");
        params.push(filter.status);
    }
    if (filter.clientId) {
        conditions.push("h.client_id = ?");
        params.push(filter.clientId);
    }
    if (filter.search) {
        const pattern = likePattern(filter.search);
        conditions.push(`(${SEARCH_COLUMNS.map((column) => `${column} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
        params.push(...SEARCH_COLUMNS.map(() => pattern));
    }
    return { where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "", params };
}

const SNAPSHOT_UPDATE = `
                snapshot=COALESCE(excluded.snapshot, job_history.snapshot),
                snapshot_details=COALESCE(excluded.snapshot_details, job_history.snapshot_details),
                snapshot_error=CASE WHEN excluded.snapshot_details IS NOT NULL THEN NULL
                    ELSE COALESCE(excluded.snapshot_error, job_history.snapshot_error) END,`;

/**
 * The condition both upserts update under: the row belongs to the client writing. The run
 * id is chosen by the agent, so without it one agent could overwrite another's run by
 * sending its id -- and the webhook that follows would report it. A refused write changes
 * no row, which `finishedRun` reads as nothing to report.
 */
const OWN_RUN = "job_history.client_id = excluded.client_id";

/**
 * The run as it has to be reported, when a write just gave it a final state it did not have
 * before; else null. This is the one moment a run ends as far as the server can tell, and it
 * comes once whichever of the two writers brings it -- the live STATUS_UPDATE, the history
 * sync after it, or the sync alone after an outage. A post-script that turns a success into
 * a failure is a second, different final state, and is reported too.
 */
function finishedRun(before: string | undefined, applied: boolean, run: WebhookRun): WebhookRun | null {
    if (!applied || run.status === before || !isFinalJobStatus(run.status)) return null;
    return run;
}

export class JobHistoryRepository {
    /**
     * History across all clients, newest first. The join fills in the client's names,
     * which the job rows themselves do not carry -- hence GlobalHistoryEntry rather
     * than HistoryEntry. The caller bounds limit and offset.
     */
    static findGlobal(limit: number, offset: number, filter: HistoryFilter = {}): GlobalHistoryEntry[] {
        const { where, params } = historyWhere(filter);
        return db
            .prepare(
                `
            SELECT
                h.id, h.client_id as clientId, h.job_id as jobId, h.name,
                h.type, h.status, h.start_time as startTime, h.end_time as endTime,
                h.exit_code as exitCode, h.stdout, h.stderr,
                h.snapshot, h.snapshot_details as snapshotDetails,
                h.snapshot_error as snapshotError,
                c.hostname, c.display_name as displayName
            FROM job_history h
            LEFT JOIN clients c ON h.client_id = c.id
            ${where}
            ORDER BY h.start_time DESC
            LIMIT ? OFFSET ?
        `,
            )
            .all(...params, limit, offset)
            .map((row) => withSnapshot(row as SnapshotColumns)) as GlobalHistoryEntry[];
    }

    /** How many runs `findGlobal` would return for this filter without a limit. */
    static countGlobal(filter: HistoryFilter = {}): number {
        const { where, params } = historyWhere(filter);
        const row = db
            // The join the page has: a search reads the client's names.
            .prepare(`SELECT COUNT(*) as n FROM job_history h LEFT JOIN clients c ON h.client_id = c.id ${where}`)
            .get(...params) as { n: number };
        return row.n;
    }

    /**
     * The newest row of every job, newest first -- one per (client, job). A window over
     * the whole table rather than a filter over `findGlobal`: a page of the latest runs
     * drops a job that has not run for a while as soon as the others fill the page.
     * Rows without a job (job_id NULL) belong to no job and are left out.
     */
    static findLatestPerJob(): GlobalHistoryEntry[] {
        return db
            .prepare(
                `
            SELECT
                h.id, h.client_id as clientId, h.job_id as jobId, h.name,
                h.type, h.status, h.start_time as startTime, h.end_time as endTime,
                h.exit_code as exitCode, h.stdout, h.stderr,
                h.snapshot, h.snapshot_details as snapshotDetails,
                h.snapshot_error as snapshotError,
                c.hostname, c.display_name as displayName
            FROM (
                SELECT *, ROW_NUMBER() OVER (
                    PARTITION BY client_id, job_id ORDER BY start_time DESC
                ) AS rn
                FROM job_history
                WHERE job_id IS NOT NULL
            ) h
            LEFT JOIN clients c ON h.client_id = c.id
            WHERE h.rn = 1
            ORDER BY h.start_time DESC
        `,
            )
            .all()
            .map((row) => withSnapshot(row as SnapshotColumns)) as GlobalHistoryEntry[];
    }

    /**
     * Failed runs that ended after `since`, or all of them for null. Compared as text:
     * `end_time` is the agent's ISO timestamp, and `since` comes from `toISOString()`, so
     * the two sort the same way.
     */
    static countFailedSince(since: string | null): number {
        const row = db
            .prepare(
                `
            SELECT COUNT(*) as n FROM job_history
            WHERE status = ? AND end_time IS NOT NULL AND (? IS NULL OR end_time > ?)
        `,
            )
            .get(JOB_STATUS.FAILED, since, since) as { n: number };
        return row.n;
    }

    /**
     * Drops history older than `cutoff`, but always keeps the `minCount` newest rows
     * **per client**, so a rarely running client does not lose its last job. With
     * `enforceCutoff` false the age is ignored and only the per-client count applies.
     * Returns how many rows went.
     */
    static deleteOld(
        minCount: number,
        cutoff: string,
        enforceCutoff: boolean,
    ): number {
        const result = db
            .prepare(
                `
            DELETE FROM job_history
            WHERE id IN (
                SELECT id FROM (
                    SELECT id,
                           ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY start_time DESC) as rn,
                           start_time
                    FROM job_history
                )
                WHERE rn > ? AND (start_time < ? OR ? = 0)
            )
        `,
            )
            .run(minCount, cutoff, enforceCutoff ? 1 : 0);
        return result.changes;
    }

    static findLatestSyncTime(clientId: string): string | null {
        const lastSyncRecord = db
            .prepare(
                "SELECT updated_at FROM job_history WHERE client_id = ? ORDER BY updated_at DESC LIMIT 1",
            )
            .get(clientId) as { updated_at: string | null } | undefined;
        return lastSyncRecord?.updated_at || null;
    }

    /** Answers the run when this write ended it -- see `finishedRun`. */
    static upsertStatus(
        clientId: string,
        payload: StatusUpdatePayload,
    ): WebhookRun | null {
        const upsert = db.prepare(
            `
            INSERT INTO job_history (id, client_id, job_id, name, type, status, start_time, end_time, exit_code, stdout, stderr, snapshot, snapshot_details, snapshot_error)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
                status=excluded.status, 
                end_time=excluded.end_time, 
                exit_code=excluded.exit_code, 
                stdout=excluded.stdout, 
                stderr=excluded.stderr,${SNAPSHOT_UPDATE}
                updated_at=CURRENT_TIMESTAMP
            WHERE ${OWN_RUN}
        `,
        );
        const run: WebhookRun = {
            id: payload.id,
            jobId: payload.jobId ?? null,
            name: payload.name ?? null,
            type: payload.type,
            status: payload.status,
            startTime: payload.startTime || "",
            endTime: payload.endTime || null,
            exitCode: payload.exitCode ?? null,
            stderr: payload.stderr || null,
            snapshot: null,
            snapshotDetails: null,
            snapshotError: null,
        };
        return db.transaction(() => {
            const before = selectStatus().get(payload.id) as { status: string } | undefined;
            const { changes } = upsert.run(
                payload.id,
                clientId,
                payload.jobId,
                payload.name,
                payload.type,
                payload.status,
                payload.startTime || null,
                payload.endTime || null,
                payload.exitCode ?? null,
                payload.stdout || null,
                payload.stderr || null,
                payload.snapshot ?? null,
                detailsColumn(payload.snapshotDetails),
                payload.snapshotError ?? null,
            );
            const finished = finishedRun(before?.status, changes > 0, run);
            return finished && { ...finished, ...storedSnapshot(payload.id) };
        })();
    }

    /** Answers the runs this batch ended -- see `finishedRun`. */
    static upsertHistoryBatch(
        clientId: string,
        historyEntries: HistoryEntry[],
    ): WebhookRun[] {
        // A retried batch can arrive after a newer one; the WHERE keeps it from putting the
        // older state back. Without a revision on either side -- an agent of an older
        // build -- the row is overwritten as it always was, but only by its own client.
        const insertStmt = db.prepare(`
            INSERT INTO job_history (id, client_id, job_id, name, type, status, start_time, end_time, exit_code, stdout, stderr, revision, snapshot, snapshot_details, snapshot_error)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
                status=excluded.status, 
                end_time=excluded.end_time, 
                exit_code=excluded.exit_code, 
                stdout=excluded.stdout, 
                stderr=excluded.stderr,
                revision=excluded.revision,${SNAPSHOT_UPDATE}
                updated_at=CURRENT_TIMESTAMP
            WHERE ${OWN_RUN} AND (
                excluded.revision IS NULL
                OR job_history.revision IS NULL
                OR excluded.revision >= job_history.revision
            )
        `);

        const status = selectStatus();
        const transaction = db.transaction((entries: HistoryEntry[]) => {
            const finished: WebhookRun[] = [];
            for (const entry of entries) {
                const before = status.get(entry.id) as { status: string } | undefined;
                const { changes } = insertStmt.run(
                    entry.id,
                    clientId,
                    entry.jobConfigId || null,
                    entry.name || null,
                    entry.type,
                    entry.status,
                    entry.startTime,
                    entry.endTime,
                    entry.exitCode,
                    entry.stdout || null,
                    entry.stderr || null,
                    entry.revision ?? null,
                    entry.snapshot ?? null,
                    detailsColumn(entry.snapshotDetails),
                    entry.snapshotError ?? null,
                );
                const run = finishedRun(before?.status, changes > 0, {
                    id: entry.id,
                    jobId: entry.jobConfigId || null,
                    name: entry.name || null,
                    type: entry.type,
                    status: entry.status,
                    startTime: entry.startTime,
                    endTime: entry.endTime,
                    exitCode: entry.exitCode,
                    stderr: entry.stderr || null,
                    snapshot: null,
                    snapshotDetails: null,
                    snapshotError: null,
                });
                if (run) finished.push({ ...run, ...storedSnapshot(entry.id) });
            }
            return finished;
        });

        return transaction(historyEntries);
    }
}
