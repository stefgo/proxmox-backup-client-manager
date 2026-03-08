import db from "../core/Database.js";

export interface StateRow {
    id: string;
    last_run: string | null;
    next_run: string | null;
}

export class JobScheduleStateRepository {
    static findById(id: string): StateRow | undefined {
        return db
            .prepare("SELECT * FROM job_schedule_state WHERE id = ?")
            .get(id) as StateRow | undefined;
    }

    static updateNextRun(id: string, nextRun: string | null): void {
        db.prepare(
            "UPDATE job_schedule_state SET next_run = ? WHERE id = ?",
        ).run(nextRun, id);
    }

    static insert(
        id: string,
        nextRun: string | null,
        lastRun: string | null,
    ): void {
        db.prepare(
            "INSERT INTO job_schedule_state (id, next_run, last_run) VALUES (?, ?, ?)",
        ).run(id, nextRun, lastRun);
    }

    static updateBoth(
        id: string,
        lastRun: string,
        nextRun: string | null,
    ): void {
        db.prepare(
            "INSERT OR REPLACE INTO job_schedule_state (id, last_run, next_run) VALUES (?, ?, ?)",
        ).run(id, lastRun, nextRun);
    }

    static delete(id: string): void {
        db.prepare("DELETE FROM job_schedule_state WHERE id = ?").run(id);
    }
}
