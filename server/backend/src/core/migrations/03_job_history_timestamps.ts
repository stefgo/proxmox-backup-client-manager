export const migration03 = {
    up: async ({ context: db }: { context: any }) => {
        // SQLite does not support adding columns with non-constant defaults via ALTER TABLE.
        // We recreate the table to support DEFAULT CURRENT_TIMESTAMP.
        db.exec(`
            PRAGMA foreign_keys = OFF;
            
            CREATE TABLE job_history_new (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                job_id TEXT,
                name TEXT,
                type TEXT NOT NULL,
                status TEXT NOT NULL,
                start_time DATETIME NOT NULL,
                end_time DATETIME,
                exit_code INTEGER,
                stdout TEXT,
                stderr TEXT,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE
            );

            INSERT INTO job_history_new (
                id, client_id, job_id, name, type, status, start_time, end_time, exit_code, stdout, stderr, created_at, updated_at
            )
            SELECT 
                id, client_id, job_id, name, type, status, start_time, end_time, exit_code, stdout, stderr, start_time, COALESCE(end_time, start_time)
            FROM job_history;

            DROP TABLE job_history;
            ALTER TABLE job_history_new RENAME TO job_history;

            CREATE INDEX idx_history_client_id ON job_history(client_id);
            CREATE INDEX idx_history_start_time ON job_history(start_time);

            PRAGMA foreign_keys = ON;
        `);
    },
    down: async ({ context: db }: { context: any }) => {
        db.exec(`
            PRAGMA foreign_keys = OFF;

            CREATE TABLE job_history_old (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                job_id TEXT,
                name TEXT,
                type TEXT NOT NULL,
                status TEXT NOT NULL,
                start_time DATETIME NOT NULL,
                end_time DATETIME,
                exit_code INTEGER,
                stdout TEXT,
                stderr TEXT,
                FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE
            );

            INSERT INTO job_history_old (
                id, client_id, job_id, name, type, status, start_time, end_time, exit_code, stdout, stderr
            )
            SELECT 
                id, client_id, job_id, name, type, status, start_time, end_time, exit_code, stdout, stderr
            FROM job_history;

            DROP TABLE job_history;
            ALTER TABLE job_history_old RENAME TO job_history;

            CREATE INDEX idx_history_client_id ON job_history(client_id);
            CREATE INDEX idx_history_start_time ON job_history(start_time);

            PRAGMA foreign_keys = ON;
        `);
    },
};
