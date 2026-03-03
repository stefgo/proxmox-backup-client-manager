export const migration01 = {
    up: async ({ context: db }: { context: any }) => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS job_history (
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

          CREATE INDEX IF NOT EXISTS idx_history_client_id ON job_history(client_id);
          CREATE INDEX IF NOT EXISTS idx_history_start_time ON job_history(start_time);
        `);
    },
    down: async ({ context: db }: { context: any }) => {
        db.exec(`
          DROP INDEX IF EXISTS idx_history_start_time;
          DROP INDEX IF EXISTS idx_history_client_id;
          DROP TABLE IF EXISTS job_history;
        `);
    },
};
