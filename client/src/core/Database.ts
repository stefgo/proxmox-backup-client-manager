import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { Logger } from "./Logger.js";
import { Umzug } from "umzug";
import { migration00 } from "./migrations/00_initial.js";
import { migration01 } from "./migrations/01_rename_history.js";

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
Logger.info(`Database opened: ${dbPath}`);

// Run umzug migrations
const migrator = new Umzug({
    migrations: [
        { name: "00_initial", up: migration00.up, down: migration00.down },
        {
            name: "01_rename_history",
            up: migration01.up,
            down: migration01.down,
        },
    ],
    context: db,
    storage: {
        async executed({ context }) {
            (context as any).exec(
                `CREATE TABLE IF NOT EXISTS umzug_migrations (name TEXT PRIMARY KEY)`,
            );
            return (context as any)
                .prepare("SELECT name FROM umzug_migrations")
                .all()
                .map((r: any) => r.name);
        },
        async logMigration({ name, context }) {
            (context as any)
                .prepare("INSERT INTO umzug_migrations (name) VALUES (?)")
                .run(name);
        },
        async unlogMigration({ name, context }) {
            (context as any)
                .prepare("DELETE FROM umzug_migrations WHERE name = ?")
                .run(name);
        },
    },
    logger: console,
});

migrator
    .up()
    .then(() => {
        Logger.info("Database migrations executed successfully.");
    })
    .catch((e) => {
        Logger.error("Failed to run database migrations", e);
    });

export default db;
