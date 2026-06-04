import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'db', 'lovablelock.sqlite');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    cash_balance  REAL NOT NULL DEFAULT 0,
    couple_id     INTEGER REFERENCES couples(id) ON DELETE SET NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS couples (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname   TEXT,
    started_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS invites (
    code       TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    couple_id   INTEGER NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    payer_id    INTEGER NOT NULL REFERENCES users(id),
    amount      REAL NOT NULL,
    description TEXT NOT NULL,
    category    TEXT NOT NULL,
    split_mode  TEXT NOT NULL DEFAULT 'equal', -- equal | payer | custom
    payer_share REAL NOT NULL DEFAULT 0.5,     -- fração que o pagador absorve (0..1)
    occurred_on TEXT NOT NULL,                  -- YYYY-MM-DD
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tx_couple_date ON transactions(couple_id, occurred_on DESC);

  CREATE TABLE IF NOT EXISTS goals (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    couple_id       INTEGER NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    target_amount   REAL NOT NULL,
    current_amount  REAL NOT NULL DEFAULT 0,
    emoji           TEXT,
    deadline        TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settlements (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    couple_id   INTEGER NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    from_user   INTEGER NOT NULL REFERENCES users(id),
    to_user     INTEGER NOT NULL REFERENCES users(id),
    amount      REAL NOT NULL,
    note        TEXT,
    occurred_on TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export default db;
