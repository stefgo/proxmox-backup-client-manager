import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";
import { Umzug } from "umzug";
import { migration00 } from "./migrations/00_initial.js";
import { migration01 } from "./migrations/01_rename_history.js";
import { migration02 } from "./migrations/02_job_history_timestamps.js";
import { migration03 } from "./migrations/03_agent_state.js";
import { migration04 } from "./migrations/04_drop_agent_state.js";

// Robust path resolution relative to this file
// client/src/core -> client/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../../");
const DATA_DIR = path.join(ROOT_DIR, "data");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = path.join(DATA_DIR, "client.db");
const db = new Database(dbPath);
logger.info(`Database opened: ${dbPath}`);

// Run umzug migrations
const migrator = new Umzug<Database.Database>({
    migrations: [
        { name: "00_initial", up: migration00.up, down: migration00.down },
        {
            name: "01_rename_history",
            up: migration01.up,
            down: migration01.down,
        },
        {
            name: "02_job_history_timestamps",
            up: migration02.up,
            down: migration02.down,
        },
        {
            name: "03_agent_state",
            up: migration03.up,
            down: migration03.down,
        },
        {
            name: "04_drop_agent_state",
            up: migration04.up,
            down: migration04.down,
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
                .map((r: any) => r.name);
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
        throw e;
    }
}

export default db;
