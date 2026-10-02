import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Assuming process.cwd() is project root or server root.
// If run from workspace root: server/data
// If run from server dir: data
// Let's make it robust: relative to this file
import { fileURLToPath } from "url";
import { logger } from "@pbcm/shared/node";
import { Umzug } from "umzug";
import { migration00 } from "./migrations/00_initial.js";
import { migration01 } from "./migrations/01_history.js";
import { migration02 } from "./migrations/02_client_version.js";
import { migration03 } from "./migrations/03_job_history_timestamps.js";
import { migration04 } from "./migrations/04_connection_mode.js";
import { migration05 } from "./migrations/05_client_tunnels.js";
import { migration06 } from "./migrations/06_drop_tunnel_last_error.js";
import { migration07 } from "./migrations/07_token_registration_defaults.js";
import { migration08 } from "./migrations/08_rename_inbound_allowed_ip.js";
import { migration09 } from "./migrations/09_job_history_revision.js";
import { migration10 } from "./migrations/10_scheduler_state.js";
import { migration11 } from "./migrations/11_registration_token_hash.js";
import { migration12 } from "./migrations/12_client_timezone.js";
import { migration13 } from "./migrations/13_scheduler_next_run.js";
import { migration14 } from "./migrations/14_history_seen.js";
import { migration15 } from "./migrations/15_webhooks.js";
import { migration16 } from "./migrations/16_job_history_snapshot.js";
import { migration17 } from "./migrations/17_user_token_version.js";
import { migration18 } from "./migrations/18_protect_secrets.js";
import { migration19 } from "./migrations/19_drop_webhook_client_ids.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/src/core -> server/data
const DATA_DIR = path.resolve(__dirname, "../../data");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// The image runs the server as UID 1000. A data directory that UID cannot write -- one
// started with its own `user:` over a volume that belongs to root -- would otherwise
// surface as SQLite's "attempt to write a readonly database" at the first migration.
try {
    fs.accessSync(DATA_DIR, fs.constants.W_OK);
} catch {
    throw new Error(
        `${DATA_DIR} is not writable by UID ${process.getuid?.() ?? "?"} — give that user the directory (chown -R) and restart.`,
    );
}

const dbPath = path.join(DATA_DIR, "server.db");
const db = new Database(dbPath);
logger.info(`Database opened: ${dbPath}`);

// Enable WAL mode for better concurrency
db.pragma("journal_mode = WAL");

// Run umzug migrations
const migrator = new Umzug<Database.Database>({
    migrations: [
        { name: "00_initial", up: migration00.up, down: migration00.down },
        { name: "01_history", up: migration01.up, down: migration01.down },
        {
            name: "02_client_version",
            up: migration02.up,
            down: migration02.down,
        },
        {
            name: "03_job_history_timestamps",
            up: migration03.up,
            down: migration03.down,
        },
        {
            name: "04_connection_mode",
            up: migration04.up,
            down: migration04.down,
        },
        {
            name: "05_client_tunnels",
            up: migration05.up,
            down: migration05.down,
        },
        {
            name: "06_drop_tunnel_last_error",
            up: migration06.up,
            down: migration06.down,
        },
        {
            name: "07_token_registration_defaults",
            up: migration07.up,
            down: migration07.down,
        },
        {
            name: "08_rename_inbound_allowed_ip",
            up: migration08.up,
            down: migration08.down,
        },
        {
            name: "09_job_history_revision",
            up: migration09.up,
            down: migration09.down,
        },
        {
            name: "10_scheduler_state",
            up: migration10.up,
            down: migration10.down,
        },
        {
            name: "11_registration_token_hash",
            up: migration11.up,
            down: migration11.down,
        },
        {
            name: "12_client_timezone",
            up: migration12.up,
            down: migration12.down,
        },
        {
            name: "13_scheduler_next_run",
            up: migration13.up,
            down: migration13.down,
        },
        {
            name: "14_history_seen",
            up: migration14.up,
            down: migration14.down,
        },
        {
            name: "15_webhooks",
            up: migration15.up,
            down: migration15.down,
        },
        {
            name: "16_job_history_snapshot",
            up: migration16.up,
            down: migration16.down,
        },
        {
            name: "17_user_token_version",
            up: migration17.up,
            down: migration17.down,
        },
        {
            name: "18_protect_secrets",
            up: migration18.up,
            down: migration18.down,
        },
        {
            name: "19_drop_webhook_client_ids",
            up: migration19.up,
            down: migration19.down,
        },
    ],
    context: db,
    storage: {
        async executed({ context }) {
            context.exec(
                `CREATE TABLE IF NOT EXISTS umzug_migrations (name TEXT PRIMARY KEY)`,
            );
            return context
                .prepare("SELECT name FROM umzug_migrations")
                .all()
                .map((r) => (r as { name: string }).name);
        },
        async logMigration({ name, context }) {
            context
                .prepare("INSERT INTO umzug_migrations (name) VALUES (?)")
                .run(name);
        },
        async unlogMigration({ name, context }) {
            context
                .prepare("DELETE FROM umzug_migrations WHERE name = ?")
                .run(name);
        },
    },
    logger: console,
});

export async function initDatabase() {
    try {
        await migrator.up();
        logger.info("Database migrations executed successfully.");
    } catch (e) {
        logger.error({ err: e }, "Failed to run database migrations");
        throw e; // Rethrow to allow app to fail fast
    }
}

export default db;
