import db from "../core/Database.js";

export class JobHistoryRepository {
    static findLatestSyncTime(clientId: string): string | null {
        const lastSyncRecord = db
            .prepare(
                "SELECT updated_at FROM job_history WHERE client_id = ? ORDER BY updated_at DESC LIMIT 1",
            )
            .get(clientId) as { updated_at: string | null } | undefined;
        return lastSyncRecord?.updated_at || null;
    }

    static upsertStatus(clientId: string, payload: any): void {
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

    static upsertHistoryBatch(clientId: string, historyEntries: any[]): void {
        const insertStmt = db.prepare(`
            INSERT INTO job_history (id, client_id, job_id, name, type, status, start_time, end_time, exit_code, stdout, stderr)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
                status=excluded.status, 
                end_time=excluded.end_time, 
                exit_code=excluded.exit_code, 
                stdout=excluded.stdout, 
                stderr=excluded.stderr,
                updated_at=CURRENT_TIMESTAMP
        `);

        const transaction = db.transaction((entries: any[]) => {
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
                );
            }
        });

        transaction(historyEntries);
    }
}
