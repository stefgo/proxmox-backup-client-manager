import db from "../core/Database.js";

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

/** A row as the history sync reads it: the stored columns plus the revision to confirm. */
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

export class JobHistoryRepository {
    private static changeListener: (() => void) | null = null;

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

    /**
     * Rows whose current revision the server has not acknowledged, oldest first. A row
     * written before start_time had a default falls back to created_at: the wire format
     * requires a start time, and a row that could never be sent would stay due forever.
     */
    static findUnsynced(limit: number): UnsyncedHistoryRow[] {
        return db
            .prepare(
                `SELECT id, job_id, name, type, status, COALESCE(start_time, created_at) AS start_time,
                        end_time, exit_code, stdout, stderr, revision
                 FROM job_history
                 WHERE synced_revision IS NULL OR synced_revision < revision
                 ORDER BY created_at, id
                 LIMIT ?`,
            )
            .all(limit) as UnsyncedHistoryRow[];
    }

    /**
     * Records what the server acknowledged. The revision is the one it stored, not the
     * row's current one: a row that changed after it was sent stays due. Returns how many
     * rows moved forward.
     */
    static markSynced(entries: { id: string; revision: number }[]): number {
        const stmt = db.prepare(
            `UPDATE job_history SET synced_revision = ?
             WHERE id = ? AND (synced_revision IS NULL OR synced_revision < ?)`,
        );
        const run = db.transaction((list: { id: string; revision: number }[]) => {
            let changes = 0;
            for (const entry of list) {
                changes += stmt.run(entry.revision, entry.id, entry.revision).changes;
            }
            return changes;
        });
        return run(entries);
    }

    static insertNewJob(
        id: string,
        jobId: string,
        type: string,
        status: string,
        startTime: string,
        name: string,
    ): void {
        db.prepare(
            "INSERT INTO job_history (id, job_id, type, status, start_time, name) VALUES (?, ?, ?, ?, ?, ?)",
        ).run(id, jobId, type, status, startTime, name);
        this.changed();
    }

    static getRecentHistory(limit: number): HistoryRow[] {
        return db
            .prepare(
                "SELECT * FROM job_history ORDER BY start_time DESC LIMIT ?",
            )
            .all(limit) as HistoryRow[];
    }

    static findQueuedJobs(): HistoryRow[] {
        return db
            .prepare(
                "SELECT id, job_id, name FROM job_history WHERE status = 'queued'",
            )
            .all() as HistoryRow[];
    }

    static cleanUpRunningJobs(): number {
        const info = db
            .prepare(
                "UPDATE job_history SET status = 'abort', end_time = ?, updated_at = CURRENT_TIMESTAMP WHERE status = 'running'",
            )
            .run(new Date().toISOString());
        if (info.changes > 0) this.changed();
        return info.changes;
    }

    static insertSkippedJob(
        id: string,
        jobId: string,
        jobName: string | undefined,
        reason: string,
    ): void {
        const now = new Date().toISOString();
        db.prepare(
            `INSERT INTO job_history (id, job_id, type, status, start_time, end_time, name, stderr)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
            id,
            jobId,
            "backup",
            "skipped",
            now,
            now,
            jobName || null,
            reason,
        );
        this.changed();
    }

    static startRunningJob(
        id: string,
        jobId: string | null,
        type: string,
        startTime: string,
        name: string | null,
    ): void {
        const existing = db
            .prepare("SELECT id FROM job_history WHERE id = ?")
            .get(id);
        if (existing) {
            db.prepare(
                "UPDATE job_history SET status = 'running', start_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            ).run(startTime, id);
        } else {
            db.prepare(
                `INSERT INTO job_history (id, job_id, type, status, start_time, name)
                 VALUES (?, ?, ?, ?, ?, ?)`,
            ).run(id, jobId, type, "running", startTime, name);
        }
        this.changed();
    }

    static findQueuedAndRunningJobs(): HistoryRow[] {
        return db
            .prepare(
                "SELECT * FROM job_history WHERE status IN ('running', 'queued')",
            )
            .all() as HistoryRow[];
    }

    static markRunning(id: string): void {
        db.prepare(
            "UPDATE job_history SET status = 'running' WHERE id = ?",
        ).run(id);
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
        db.prepare(
            "UPDATE job_history SET status = ?, end_time = ?, exit_code = ?, stdout = ?, stderr = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(status, endTime, exitCode, stdout, stderr, id);
        this.changed();
    }

    static failJob(id: string, stderr: string): void {
        db.prepare(
            "UPDATE job_history SET status = 'failed', stderr = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(stderr, id);
        this.changed();
    }

    static abortStaleJobsBefore(
        isoDateString: string,
        endTime: string,
    ): number {
        const info = db
            .prepare(
                "UPDATE job_history SET status = 'abort', end_time = ?, stderr = ? WHERE status IN ('running', 'queued') AND start_time < ?",
            )
            .run(
                endTime,
                "Aborted on daemon startup (leftover state)",
                isoDateString,
            );
        if (info.changes > 0) this.changed();
        return info.changes;
    }
}
