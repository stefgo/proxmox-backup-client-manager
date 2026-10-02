import type { MigrationContext } from "./context.js";

/**
 * A webhook applies to every client; the client selection of migration 15 is gone. A
 * webhook that was limited to some clients reports the events of all of them from here on.
 *
 * `down` brings the column back empty, which means every client -- the old selection is
 * not restored.
 */
export const migration19 = {
    up: async ({ context: db }: MigrationContext) => {
        db.exec(`ALTER TABLE webhooks DROP COLUMN client_ids`);
    },
    down: async ({ context: db }: MigrationContext) => {
        db.exec(`ALTER TABLE webhooks ADD COLUMN client_ids TEXT NOT NULL DEFAULT '[]'`);
    },
};
