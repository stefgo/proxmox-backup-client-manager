import type { MigrationContext } from "./context.js";

/**
 * The webhooks the server reports runs and client connections to. The server sends them
 * itself: the agents keep every run until it is acknowledged, so a run that ends while the
 * server is away is reported late, never not at all.
 *
 * `headers`, `kinds` and `client_ids` are JSON; `body_template` is the operator's text as
 * written, checked on save. An empty `client_ids` means every client, new ones included.
 *
 * The `last_*` columns are the only record of how deliveries go: a failed delivery is not
 * part of any run's history, it is a property of the webhook.
 */
export const migration15 = {
    up: async ({ context: db }: MigrationContext) => {
        db.exec(`
          CREATE TABLE webhooks (
            id              TEXT    PRIMARY KEY,
            name            TEXT    NOT NULL,
            enabled         INTEGER NOT NULL DEFAULT 1,
            url             TEXT    NOT NULL,
            method          TEXT    NOT NULL DEFAULT 'POST',
            headers         TEXT    NOT NULL DEFAULT '{}',
            body_template   TEXT    NOT NULL,
            min_level       TEXT    NOT NULL DEFAULT 'warning',
            kinds           TEXT    NOT NULL DEFAULT '[]',
            client_ids      TEXT    NOT NULL DEFAULT '[]',
            timeout_ms      INTEGER NOT NULL DEFAULT 10000,
            last_status     INTEGER,
            last_error      TEXT,
            last_attempt_at TEXT,
            created_at      TEXT    NOT NULL,
            updated_at      TEXT
          );
        `);
    },
    down: async ({ context: db }: MigrationContext) => {
        db.exec(`
          DROP TABLE IF EXISTS webhooks;
        `);
    },
};
