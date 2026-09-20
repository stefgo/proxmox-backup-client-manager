import type { MigrationContext } from "./context.js";

export const migration03 = {
    up: async ({ context: db }: MigrationContext) => {
        // `revision` counts the changes to a row, `synced_revision` is the one the server
        // acknowledged. A row is due for sync while the two differ -- a counter rather than
        // updated_at, because a timestamp compared across two clocks at one-second
        // resolution let rows fall below the watermark and never be sent.
        //
        // The trigger raises the revision, not the repository: an UPDATE that forgot to
        // touch updated_at (markRunning, abortStaleJobsBefore) went unsynced for that
        // reason. It fires only on the columns the server stores, and only when one of
        // them actually changed, so setting synced_revision does not count as a change.
        //
        // Existing rows start unacknowledged: which of them the server holds is exactly
        // what the old watermark could not tell. The first connection sends them once, and
        // the server's upsert makes a copy it already has a no-op.
        db.exec(`
            ALTER TABLE job_history ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
            ALTER TABLE job_history ADD COLUMN synced_revision INTEGER;

            CREATE TRIGGER job_history_revision
            AFTER UPDATE OF status, start_time, end_time, exit_code, stdout, stderr ON job_history
            FOR EACH ROW
            WHEN NEW.status IS NOT OLD.status
                OR NEW.start_time IS NOT OLD.start_time
                OR NEW.end_time IS NOT OLD.end_time
                OR NEW.exit_code IS NOT OLD.exit_code
                OR NEW.stdout IS NOT OLD.stdout
                OR NEW.stderr IS NOT OLD.stderr
            BEGIN
                UPDATE job_history SET revision = OLD.revision + 1 WHERE id = NEW.id;
            END;
        `);
    },
    down: async ({ context: db }: MigrationContext) => {
        db.exec(`
            DROP TRIGGER IF EXISTS job_history_revision;
            ALTER TABLE job_history DROP COLUMN synced_revision;
            ALTER TABLE job_history DROP COLUMN revision;
        `);
    },
};
