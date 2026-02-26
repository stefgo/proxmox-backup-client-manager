
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Logger } from './Logger.js';

// Robust path resolution relative to this file
// client/src/core -> client/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = path.join(DATA_DIR, 'client.db');
const db = new Database(dbPath);
Logger.info(`Database opened: ${dbPath}`);

// Initialize Tables
db.exec(`
    CREATE TABLE IF NOT EXISTS job (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        config TEXT NOT NULL,
        schedule TEXT,
        schedule_enabled INTEGER DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        name TEXT,
        config TEXT,
        type TEXT NOT NULL,
        start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        end_time DATETIME,
        stdout TEXT,
        stderr TEXT,
        status TEXT NOT NULL,
        exit_code INTEGER
    );

    CREATE TABLE IF NOT EXISTS job_schedule_state (
        id TEXT PRIMARY KEY, -- Job ID
        last_run DATETIME,
        next_run DATETIME
    );
`);

export default db;
