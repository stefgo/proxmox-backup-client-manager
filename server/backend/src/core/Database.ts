import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Assuming process.cwd() is project root or server root. 
// If run from workspace root: server/data
// If run from server dir: data
// Let's make it robust: relative to this file
import { fileURLToPath } from 'url';
import { logger } from './Logger.js';
import { Umzug } from 'umzug';
import { migration00 } from './migrations/00_initial.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/src/core -> server/data
const DATA_DIR = path.resolve(__dirname, '../../data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = path.join(DATA_DIR, 'server.db');
const db = new Database(dbPath);
logger.info(`Database opened: ${dbPath}`);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Run umzug migrations
const migrator = new Umzug({
  migrations: [
    { name: '00_initial', up: migration00.up, down: migration00.down }
  ],
  context: db,
  storage: {
    async executed({ context }) {
      (context as any).exec(`CREATE TABLE IF NOT EXISTS umzug_migrations (name TEXT PRIMARY KEY)`);
      return (context as any).prepare('SELECT name FROM umzug_migrations').all().map((r: any) => r.name);
    },
    async logMigration({ name, context }) {
      (context as any).prepare('INSERT INTO umzug_migrations (name) VALUES (?)').run(name);
    },
    async unlogMigration({ name, context }) {
      (context as any).prepare('DELETE FROM umzug_migrations WHERE name = ?').run(name);
    }
  },
  logger: console,
});

migrator.up().then(() => {
  logger.info("Database migrations executed successfully.");
}).catch((e) => {
  logger.error("Failed to run database migrations", e);
});

export default db;
