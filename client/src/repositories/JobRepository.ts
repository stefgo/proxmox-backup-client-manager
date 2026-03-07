import db from "../core/Database.js";
import { BackupJob, ScheduleConfig } from "@pbcm/shared";

export interface JobRow {
    id: string;
    name: string;
    config: string;
    schedule_enabled: number;
    schedule: string | null;
}

export class JobRepository {
    static findAll(): JobRow[] {
        return db.prepare("SELECT * FROM job").all() as JobRow[];
    }

    static getAllWithScheduleState(): BackupJob[] {
        const rawJobs = db
            .prepare(
                `
            SELECT j.*, s.last_run, s.next_run 
            FROM job j 
            LEFT JOIN job_schedule_state s ON j.id = s.id 
            ORDER BY j.created_at DESC
        `,
            )
            .all() as any[];

        return rawJobs.map((row) => {
            let config: any = {};
            try {
                config = row.config ? JSON.parse(row.config) : {};
            } catch (e) {}
            const archives: any[] = config.archives || [];
            let schedule: ScheduleConfig | null = null;
            try {
                if (row.schedule) schedule = JSON.parse(row.schedule);
            } catch (e) {}

            return {
                id: row.id,
                name: row.name,
                archives,
                schedule,
                scheduleEnabled: Boolean(row.schedule_enabled),
                createdAt: row.created_at,
                nextRunAt: row.next_run,
                lastRunAt: row.last_run,
                repository: config.repository,
                encryption: config.encryption,
            };
        });
    }

    static findById(id: string): JobRow | undefined {
        return db.prepare("SELECT * FROM job WHERE id = ?").get(id) as
            | JobRow
            | undefined;
    }

    static upsert(
        id: string,
        name: string,
        config: string,
        scheduleEnabled: number,
        schedule: string | null,
    ): void {
        db.prepare(
            `INSERT INTO job (id, name, config, schedule_enabled, schedule)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET 
             name=excluded.name, 
             config=excluded.config, 
             schedule_enabled=excluded.schedule_enabled, 
             schedule=excluded.schedule`,
        ).run(id, name, config, scheduleEnabled, schedule);
    }

    static delete(id: string): void {
        db.prepare("DELETE FROM job WHERE id = ?").run(id);
    }
}
