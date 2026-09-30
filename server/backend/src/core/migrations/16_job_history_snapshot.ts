import type { MigrationContext } from "./context.js";

/**
 * The snapshot a backup run created, as the agent reported it: its path, the details the
 * PBS listed for it right after the run (JSON), and why there are none although the backup
 * itself succeeded. Columns of the run rather than a table of their own, so the history
 * cleanup takes them with the run.
 */
export const migration16 = {
    up: async ({ context: db }: MigrationContext) => {
        db.exec(`
            ALTER TABLE job_history ADD COLUMN snapshot TEXT;
            ALTER TABLE job_history ADD COLUMN snapshot_details TEXT;
            ALTER TABLE job_history ADD COLUMN snapshot_error TEXT;
        `);
    },
    down: async ({ context: db }: MigrationContext) => {
        db.exec(`
            ALTER TABLE job_history DROP COLUMN snapshot_error;
            ALTER TABLE job_history DROP COLUMN snapshot_details;
            ALTER TABLE job_history DROP COLUMN snapshot;
        `);
    },
};
