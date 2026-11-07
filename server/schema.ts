// SQLite schema, shared by the server (db.ts) and the Postgres restore (pgsync.ts). No side effects.
import type Database from 'better-sqlite3'
import path from 'node:path'

export const DATA_DIR = path.resolve(process.env.PHD_DATA_DIR || 'data')

export const COLLECTION_TABLES = [
  'topics', 'universities', 'groups', 'researchers', 'papers', 'deadlines', 'tasks', 'gaps', 'venues', 'docs', 'positions', 'insights', 'directions',
] as const

/** Tables kept in Postgres with their key column (api_cache stays local: it is only a cache). */
export const DURABLE_TABLES: Record<string, string> = {
  ...Object.fromEntries(COLLECTION_TABLES.map((t) => [t, 'id'])),
  kv: 'k',
  users: 'id',
  activity: 'id',
  chat_threads: 'id',
  chat_messages: 'id',
  seen_urls: 'url',
}

export function createSchema(db: Database.Database) {
  for (const c of COLLECTION_TABLES)
    db.exec(`CREATE TABLE IF NOT EXISTS ${c} (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`)
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, source TEXT NOT NULL, module TEXT NOT NULL, text TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chat_threads (id TEXT PRIMARY KEY, title TEXT NOT NULL, sdk_session TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chat_messages (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, tools TEXT, at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS api_cache (k TEXT PRIMARY KEY, body TEXT NOT NULL, at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS seen_urls (url TEXT PRIMARY KEY, at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, admin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
  `)
  // Sessions live in each account's Claude folder, so remember which account a session belongs to.
  if (!(db.prepare('PRAGMA table_info(chat_threads)').all() as { name: string }[]).some((c) => c.name === 'sdk_account'))
    db.exec('ALTER TABLE chat_threads ADD COLUMN sdk_account TEXT')
  // Every board row belongs to one user (rows from before accounts existed get the first account: see adoptOrphans).
  for (const t of USER_TABLES) {
    if (!(db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).some((c) => c.name === 'uid')) db.exec(`ALTER TABLE ${t} ADD COLUMN uid INTEGER`)
    db.exec(`CREATE INDEX IF NOT EXISTS ${t}_uid ON ${t} (uid)`)
  }
}

/** Tables whose rows belong to one user. kv keys of a user start with u<id>: (see db.ts ukey). */
export const USER_TABLES = [...COLLECTION_TABLES, 'activity', 'chat_threads'] as const
