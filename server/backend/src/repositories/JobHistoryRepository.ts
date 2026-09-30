import db from "../core/Database.js";
import {
    JOB_STATUS,
    StatusUpdatePayload,
    HistoryEntry,
    GlobalHistoryEntry,
    isFinalJobStatus,
    type WebhookRun,
} from "@pbcm/shared";

// The two writers below take payloads the WebSocketController has already run through
// their Zod schemas, so they can be typed instead of taking `any`.

const selectStatus = () => db.prepare("SELECT status FROM job_history WHERE id = ?");

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
    static findGlobal(limit: number, offset: number): GlobalHistoryEntry[] {
        return db
            .prepare(
                `
            SELECT
                h.id, h.client_id as clientId, h.job_id as jobId, h.name,
                h.type, h.status, h.start_time as startTime, h.end_time as endTime,
                h.exit_code as exitCode, h.stdout, h.stderr,
                c.hostname, c.display_name as displayName
            FROM job_history h
            LEFT JOIN clients c ON h.client_id = c.id
            ORDER BY h.start_time DESC
            LIMIT ? OFFSET ?
        `,
            )
            .all(limit, offset) as GlobalHistoryEntry[];
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
            .all() as GlobalHistoryEntry[];
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
            INSERT INTO job_history (id, client_id, job_id, name, type, status, start_time, end_time, exit_code, stdout, stderr)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
                status=excluded.status, 
                end_time=excluded.end_time, 
                exit_code=excluded.exit_code, 
                stdout=excluded.stdout, 
                stderr=excluded.stderr,
                updated_at=CURRENT_TIMESTAMP
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
            );
            return finishedRun(before?.status, changes > 0, run);
        })();
    }

    /** Answers the runs this batch ended -- see `finishedRun`. */
    static upsertHistoryBatch(
        clientId: string,
        historyEntries: HistoryEntry[],
    ): WebhookRun[] {
        // A retried batch can arrive after a newer one; the WHERE keeps it from putting the
        // older state back. Without a revision on either side -- an agent of an older
        // build -- the row is overwritten as it always was.
        const insertStmt = db.prepare(`
            INSERT INTO job_history (id, client_id, job_id, name, type, status, start_time, end_time, exit_code, stdout, stderr, revision)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
                status=excluded.status, 
                end_time=excluded.end_time, 
                exit_code=excluded.exit_code, 
                stdout=excluded.stdout, 
                stderr=excluded.stderr,
                revision=excluded.revision,
                updated_at=CURRENT_TIMESTAMP
            WHERE excluded.revision IS NULL
                OR job_history.revision IS NULL
                OR excluded.revision >= job_history.revision
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
                });
                if (run) finished.push(run);
            }
            return finished;
        });

        return transaction(historyEntries);
    }
}
