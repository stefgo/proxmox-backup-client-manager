import type { MigrationContext } from "./context.js";

export const migration01 = {
    up: async ({ context: db }: MigrationContext) => {
        db.exec(`
            ALTER TABLE history RENAME TO job_history;
        `);
    },
    down: async ({ context: db }: MigrationContext) => {
        db.exec(`
            ALTER TABLE job_history RENAME TO history;
        `);
    },
};
