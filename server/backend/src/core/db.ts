import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Assuming process.cwd() is project root or server root. 
// If run from workspace root: server/data
// If run from server dir: data
// Let's make it robust: relative to this file
import { fileURLToPath } from 'url';
import { logger } from './Logger.js';

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

// Initialize Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    hostname TEXT,
    display_name TEXT,
    auth_token TEXT UNIQUE,
    allowed_ip TEXT,
    ip_address TEXT,
    last_seen DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT,
    auth_methods TEXT DEFAULT 'local',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS registration_tokens (
    token TEXT PRIMARY KEY,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    used_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS repositories (
    id TEXT PRIMARY KEY,
    base_url TEXT,
    datastore TEXT,
    fingerprint TEXT,
    username TEXT,
    tokenname TEXT,
    secret TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  `);

export default db;
