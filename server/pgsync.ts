// Postgres as the durable store (set DATABASE_URL). The server keeps working on a local SQLite copy:
// on start the copy is filled from Postgres, and every write is mirrored back within a moment.
// Claude login files (data/accounts/*/.credentials.json, .claude.json) are kept in Postgres too,
// so a fresh container (Cloud Run) does not lose its sign-ins. Without DATABASE_URL nothing here runs.
// Run a single instance per database: two servers on one database would overwrite each other.
import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { createSchema, DATA_DIR, DURABLE_TABLES } from './schema'

const PREFIX = 'talvis_'
let pool: pg.Pool | null = null
let local: Database.Database | null = null

const log = (m: string) => console.log(`[postgres] ${m}`)

function connect(): pg.Pool {
  pool ??= new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    // Hosted Postgres (Neon, Supabase, Cloud SQL public IP) needs TLS; a local server usually does not.
    ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '') || /sslmode=disable/.test(process.env.DATABASE_URL ?? '') ? undefined : { rejectUnauthorized: false },
  })
  return pool
}

async function ensurePgSchema(p: pg.Pool) {
  const cols = (t: string) => (local!.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name)
  for (const [t, key] of Object.entries(DURABLE_TABLES)) {
    const defs = cols(t).map((c) => `"${c}" ${c === key ? 'TEXT PRIMARY KEY' : 'TEXT'}`)
    await p.query(`CREATE TABLE IF NOT EXISTS ${PREFIX}${t} (${defs.join(', ')})`)
    // Columns added later in SQLite are added in Postgres too.
    for (const c of cols(t)) await p.query(`ALTER TABLE ${PREFIX}${t} ADD COLUMN IF NOT EXISTS "${c}" TEXT`)
  }
  await p.query(`CREATE TABLE IF NOT EXISTS ${PREFIX}files (path TEXT PRIMARY KEY, body TEXT NOT NULL, hash TEXT NOT NULL, updated_at TEXT NOT NULL)`)
}

const INTEGER_KEYS = new Set(Object.entries(DURABLE_TABLES).filter(([, k]) => k === 'id').map(([t]) => t).filter((t) => !t.startsWith('chat_')))

async function pgRowCount(p: pg.Pool): Promise<number> {
  let n = 0
  for (const t of Object.keys(DURABLE_TABLES)) n += Number((await p.query(`SELECT count(*)::int AS n FROM ${PREFIX}${t}`)).rows[0].n)
  return n
}

/** Copy every durable SQLite row into Postgres (first run, or `npm run db:push`). */
export async function pushAll(opts: { force?: boolean } = {}) {
  const p = connect()
  openLocal()
  await ensurePgSchema(p)
  if (!opts.force && (await pgRowCount(p)) > 0) throw new Error('The Postgres database already contains Talvis data. Pass --force to overwrite it.')
  for (const [t, key] of Object.entries(DURABLE_TABLES)) {
    const rows = local!.prepare(`SELECT * FROM ${t}`).all() as Record<string, unknown>[]
    if (opts.force) await p.query(`DELETE FROM ${PREFIX}${t}`)
    await upsertRows(p, t, key, rows)
    log(`${t}: ${rows.length}`)
  }
  // Claude login files are not copied: the same refresh token used in two places breaks one of them.
  // The deployed server signs in on its own and backs up its own files (snapshotFiles).
}

/** Fill the local SQLite copy from Postgres. */
async function pullAll(p: pg.Pool) {
  const db = local!
  const tx = db.transaction((tables: { t: string; rows: Record<string, unknown>[] }[]) => {
    for (const { t, rows } of tables) {
      db.prepare(`DELETE FROM ${t}`).run()
      for (const r of rows) {
        const cols = Object.keys(r)
        const vals = cols.map((c) => (r[c] === null ? null : INTEGER_KEYS.has(t) && c === 'id' ? Number(r[c]) : t === 'seen_urls' && c === 'at' ? Number(r[c]) : r[c]))
        db.prepare(`INSERT INTO ${t} (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals)
      }
    }
    // Claude conversation sessions are files that did not survive; the chat carries the history over instead.
    db.prepare('UPDATE chat_threads SET sdk_session = NULL').run()
  })
  const tables: { t: string; rows: Record<string, unknown>[] }[] = []
  for (const t of Object.keys(DURABLE_TABLES)) tables.push({ t, rows: (await p.query(`SELECT * FROM ${PREFIX}${t}`)).rows })
  tx(tables)
  log(`loaded: ${tables.map((x) => `${x.t} ${x.rows.length}`).join(', ')}`)
}

function openLocal() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  local ??= new Database(path.join(DATA_DIR, 'phd.db'))
  local.pragma('journal_mode = WAL')
  createSchema(local)
}

/** Upsert many rows of one table, 200 per statement (one round trip each: the database may be far away). */
async function upsertRows(p: pg.Pool | pg.PoolClient, t: string, key: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const set = cols.filter((c) => c !== key).map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ') || `"${key}" = EXCLUDED."${key}"`
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200)
    const vals: (string | null)[] = []
    const tuples = chunk.map((r) => `(${cols.map((c) => {
      vals.push(r[c] === null || r[c] === undefined ? null : String(r[c]))
      return `$${vals.length}`
    }).join(',')})`)
    await p.query(`INSERT INTO ${PREFIX}${t} (${cols.map((c) => `"${c}"`).join(',')}) VALUES ${tuples.join(',')} ON CONFLICT ("${key}") DO UPDATE SET ${set}`, vals)
  }
}

// ---------- start-up ----------

let enabled = false

/** Called before the server loads: fills SQLite from Postgres (or seeds Postgres from SQLite the first time). */
export async function restore() {
  if (!process.env.DATABASE_URL) return
  const p = connect()
  openLocal()
  await ensurePgSchema(p)
  if ((await pgRowCount(p)) > 0) {
    await pullAll(p)
    await restoreFiles(p)
  } else {
    log('Postgres is empty: copying local data')
    await pushAll({ force: true })
  }
  enabled = true
  setInterval(() => void snapshotFiles().catch((e) => log(`file backup failed: ${(e as Error).message}`)), 60_000).unref()
  const stop = async () => {
    await flush().catch(() => undefined)
    await snapshotFiles().catch(() => undefined)
    process.exit(0)
  }
  process.once('SIGTERM', () => void stop())
  process.once('SIGINT', () => void stop())
}

// ---------- mirroring writes ----------

const pending = new Map<string, { t: string; key: string; val: unknown }>()
let timer: NodeJS.Timeout | null = null
let flushing: Promise<void> = Promise.resolve()

/** db.ts calls this after every write; the row is copied to Postgres shortly after. */
export const mirror = {
  touch(t: string, val: unknown) {
    if (!enabled) return
    const key = DURABLE_TABLES[t]
    if (!key) return
    pending.set(`${t}:${String(val)}`, { t, key, val })
    timer ??= setTimeout(() => {
      timer = null
      void flush()
    }, 300)
  },
}

export function flush(): Promise<void> {
  flushing = flushing.then(async () => {
    if (!pending.size || !pool || !local) return
    const batch = [...pending.values()]
    pending.clear()
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const byTable = new Map<string, { key: string; rows: Record<string, unknown>[]; gone: string[] }>()
      for (const { t, key, val } of batch) {
        const g = byTable.get(t) ?? { key, rows: [], gone: [] }
        byTable.set(t, g)
        const row = local.prepare(`SELECT * FROM ${t} WHERE "${key}" = ?`).get(val) as Record<string, unknown> | undefined
        if (row) g.rows.push(row)
        else g.gone.push(String(val))
      }
      for (const [t, g] of byTable) {
        await upsertRows(client, t, g.key, g.rows)
        if (g.gone.length) await client.query(`DELETE FROM ${PREFIX}${t} WHERE "${g.key}" = ANY($1)`, [g.gone])
      }
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined)
      // Keep the rows and try again with the next write.
      for (const b of batch) pending.set(`${b.t}:${String(b.val)}`, b)
      log(`write failed, will retry: ${(e as Error).message}`)
    } finally {
      client.release()
    }
  })
  return flushing
}

// ---------- Claude login files ----------

const ACCOUNTS = path.join(DATA_DIR, 'accounts')
const FILES = ['.credentials.json', '.claude.json']
const lastHash = new Map<string, string>()

function loginFiles(): string[] {
  if (!fs.existsSync(ACCOUNTS)) return []
  const out: string[] = []
  for (const dir of fs.readdirSync(ACCOUNTS)) for (const f of FILES) if (fs.existsSync(path.join(ACCOUNTS, dir, f))) out.push(path.posix.join('accounts', dir, f))
  return out
}

/** Upload this machine's Talvis Claude logins (data/accounts/*) on request: `npm run db:push -- --logins`. */
export async function pushLoginFiles(): Promise<string[]> {
  connect()
  openLocal()
  await ensurePgSchema(pool!)
  enabled = true
  try {
    await snapshotFiles()
  } finally {
    enabled = false
  }
  return loginFiles()
}

async function snapshotFiles() {
  if (!pool || !enabled) return
  for (const rel of loginFiles()) {
    const body = fs.readFileSync(path.join(DATA_DIR, rel))
    const hash = createHash('sha256').update(body).digest('hex')
    if (lastHash.get(rel) === hash) continue
    await pool.query(
      `INSERT INTO ${PREFIX}files (path, body, hash, updated_at) VALUES ($1, $2, $3, $4) ON CONFLICT (path) DO UPDATE SET body = EXCLUDED.body, hash = EXCLUDED.hash, updated_at = EXCLUDED.updated_at`,
      [rel, body.toString('base64'), hash, new Date().toISOString()],
    )
    lastHash.set(rel, hash)
  }
}

async function restoreFiles(p: pg.Pool) {
  const rows = (await p.query(`SELECT path, body, hash FROM ${PREFIX}files`)).rows as { path: string; body: string; hash: string }[]
  for (const r of rows) {
    // Only files under data/accounts, never a path that escapes it.
    const target = path.resolve(DATA_DIR, r.path)
    if (!target.startsWith(ACCOUNTS + path.sep)) continue
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, Buffer.from(r.body, 'base64'), { mode: 0o600 })
    lastHash.set(r.path, r.hash)
  }
  if (rows.length) log(`${rows.length} Claude login files restored`)
}

export async function closePg() {
  await flush().catch(() => undefined)
  await pool?.end()
  pool = null
}
