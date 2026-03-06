export const migration03 = {
    up: async ({ context: db }: { context: any }) => {
        db.exec(`
            ALTER TABLE job_history ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
            ALTER TABLE job_history ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;
            
            UPDATE job_history SET created_at = start_time, updated_at = end_time;
        `);
    },
    down: async ({ context: db }: { context: any }) => {
        db.exec(`
            ALTER TABLE job_history DROP COLUMN updated_at;
            ALTER TABLE job_history DROP COLUMN created_at;
        `);
    },
};
