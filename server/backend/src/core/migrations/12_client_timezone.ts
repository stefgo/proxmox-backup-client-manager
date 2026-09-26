import type { MigrationContext } from "./context.js";

/**
 * The IANA time zone the agent reports on connect. The agent repeats a job's schedule in
 * that zone, so the dashboard shows it next to the schedule.
 *
 * No backfill: an existing client has `NULL` until its agent next connects, and stays there
 * if the agent predates the field.
 */
export const migration12 = {
    up: async ({ context: db }: MigrationContext) => {
        db.exec(`ALTER TABLE clients ADD COLUMN timezone TEXT;`);
    },
    down: async ({ context: db }: MigrationContext) => {
        db.exec(`ALTER TABLE clients DROP COLUMN timezone;`);
    },
};
