import type { MigrationContext } from "./context.js";

/**
 * When each user last opened the job history. The sidebar marks the History entry while
 * failed runs ended after that point, so a failure reaches whoever is looking at any page.
 *
 * Keyed by username rather than by `users.id`: a user signed in through OIDC has no row in
 * `users` to point at. One timestamp per user instead of a flag per run -- "seen" only has
 * to answer "anything new since I last looked", and it costs one row per user.
 */
export const migration14 = {
    up: async ({ context: db }: MigrationContext) => {
        db.exec(`
          CREATE TABLE history_seen (
            username TEXT PRIMARY KEY,
            seen_at  TEXT NOT NULL
          );
        `);
    },
    down: async ({ context: db }: MigrationContext) => {
        db.exec(`DROP TABLE IF EXISTS history_seen`);
    },
};
