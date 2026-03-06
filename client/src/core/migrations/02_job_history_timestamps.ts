export const migration02 = {
    up: async ({ context: db }: { context: any }) => {
        // SQLite does not support adding columns with non-constant defaults via ALTER TABLE.
        // We recreate the table to support DEFAULT CURRENT_TIMESTAMP.
        db.exec(`
            PRAGMA foreign_keys = OFF;
            
            CREATE TABLE job_history_new (
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
                exit_code INTEGER,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            INSERT INTO job_history_new (
                id, job_id, name, config, type, start_time, end_time, stdout, stderr, status, exit_code, created_at, updated_at
            )
            SELECT 
                id, job_id, name, config, type, start_time, end_time, stdout, stderr, status, exit_code, start_time, COALESCE(end_time, start_time)
            FROM job_history;

            DROP TABLE job_history;
            ALTER TABLE job_history_new RENAME TO job_history;

            CREATE INDEX idx_history_start_time ON job_history(start_time);

            PRAGMA foreign_keys = ON;
        `);
    },
    down: async ({ context: db }: { context: any }) => {
        db.exec(`
            PRAGMA foreign_keys = OFF;

            CREATE TABLE job_history_old (
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

            INSERT INTO job_history_old (
                id, job_id, name, config, type, start_time, end_time, stdout, stderr, status, exit_code
            )
            SELECT 
                id, job_id, name, config, type, start_time, end_time, stdout, stderr, status, exit_code
            FROM job_history;

            DROP TABLE job_history;
            ALTER TABLE job_history_old RENAME TO job_history;

            CREATE INDEX idx_history_start_time ON job_history(start_time);

            PRAGMA foreign_keys = ON;
        `);
    },
};
