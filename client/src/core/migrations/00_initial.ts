export const migration00 = {
    up: async ({ context: db }: { context: any }) => {
        db.exec(`
            CREATE TABLE IF NOT EXISTS job (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                config TEXT NOT NULL,
                schedule TEXT,
                schedule_enabled INTEGER DEFAULT 0,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS history (
                id TEXT PRIMARY KEY,
                job_id TEXT,
                name TEXT,
                config TEXT,
                type TEXT NOT NULL,
                start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                end_time DATETIME,
                stdout TEXT,
                stderr TEXT,
                status TEXT NOT NULL,
                exit_code INTEGER
            );

            CREATE TABLE IF NOT EXISTS job_schedule_state (
                id TEXT PRIMARY KEY, -- Job ID
                last_run DATETIME,
                next_run DATETIME
            );
        `);
    },
    down: async ({ context: db }: { context: any }) => {
        db.exec(`
            DROP TABLE IF EXISTS job;
            DROP TABLE IF EXISTS history;
            DROP TABLE IF EXISTS job_schedule_state;
        `);
    },
};
