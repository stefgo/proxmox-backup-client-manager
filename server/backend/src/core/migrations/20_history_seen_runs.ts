import type { MigrationContext } from "./context.js";

/**
 * The runs a user has marked as seen one by one. Together with `history_seen` (migration
 * 14) this is what "seen" means from here on: everything that ended up to the user's
 * `seen_at`, and above it the runs listed here. Opening the history no longer raises
 * `seen_at`; "mark all as seen" does, and clears the user's rows here, which then all lie
 * below it -- so the table holds what was picked out since, not a row per run ever seen.
 *
 * A run the cleanup removes takes its rows along.
 *
 * Every user gets a `seen_at`: one who never opened the history had none, which counted
 * every failure there is as new. Theirs becomes the moment they were created, the same
 * rule `UserRepository.create` applies to a new user. Migration 14 keyed the table by
 * username for OIDC users without a row in `users`; there are none -- a sign-in without a
 * row is refused -- so `users` is where every user is found.
 *
 * `down` drops the table and leaves the marks that were filled in.
 */
export const migration20 = {
    up: async ({ context: db }: MigrationContext) => {
        db.exec(`
          CREATE TABLE history_seen_runs (
            username   TEXT NOT NULL,
            history_id TEXT NOT NULL REFERENCES job_history(id) ON DELETE CASCADE,
            PRIMARY KEY (username, history_id)
          ) WITHOUT ROWID;

          CREATE INDEX idx_history_seen_runs_history ON history_seen_runs(history_id);

          INSERT INTO history_seen (username, seen_at)
          SELECT username, strftime('%Y-%m-%dT%H:%M:%fZ', created_at)
          FROM users
          WHERE username IS NOT NULL
            AND username NOT IN (SELECT username FROM history_seen);
        `);
    },
    down: async ({ context: db }: MigrationContext) => {
        db.exec(`
          DROP INDEX IF EXISTS idx_history_seen_runs_history;
          DROP TABLE IF EXISTS history_seen_runs;
        `);
    },
};
