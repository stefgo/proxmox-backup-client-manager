import db from "../core/Database.js";
import {
    StatusUpdatePayload,
    HistoryEntry,
    GlobalHistoryEntry,
} from "@pbcm/shared";

// The two writers below take payloads the WebSocketController has already run through
// their Zod schemas, so they can be typed instead of taking `any`.

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

    static upsertStatus(
        clientId: string,
        payload: StatusUpdatePayload,
    ): void {
        db.prepare(
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
        ).run(
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
    }

    static upsertHistoryBatch(
        clientId: string,
        historyEntries: HistoryEntry[],
    ): void {
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

        const transaction = db.transaction((entries: HistoryEntry[]) => {
            for (const entry of entries) {
                insertStmt.run(
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
            }
        });

        transaction(historyEntries);
    }
}
