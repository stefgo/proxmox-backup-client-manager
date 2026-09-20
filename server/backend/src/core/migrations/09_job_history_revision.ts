import type { MigrationContext } from "./context.js";

export const migration09 = {
    up: async ({ context: db }: MigrationContext) => {
        // The agent's revision of each row, as last stored. A SYNC_HISTORY batch that is
        // retried after a newer one has arrived must not put the older state back; the
        // upsert compares against this. NULL for rows from agents that send no revision.
        db.exec(`ALTER TABLE job_history ADD COLUMN revision INTEGER;`);
    },
    down: async ({ context: db }: MigrationContext) => {
        db.exec(`ALTER TABLE job_history DROP COLUMN revision;`);
    },
};
