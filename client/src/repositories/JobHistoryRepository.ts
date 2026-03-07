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

export class JobHistoryRepository {
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
    }

    static failJob(id: string, stderr: string): void {
        db.prepare(
            "UPDATE job_history SET status = 'failed', stderr = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(stderr, id);
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
        return info.changes;
    }
}
