import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import type {
  Activity, AppState, ChatMessage, Deadline, Direction, Doc, Gap, Group, Insight, ModuleKey, Paper, Position, Profile, Researcher, Task,
  Topic, University, Venue,
} from '../shared/types'
import { uid } from './ctx'
import { broadcast } from './events'
import { mirror } from './pgsync'
import { createSchema, DATA_DIR, USER_TABLES } from './schema'

export { DATA_DIR }
fs.mkdirSync(DATA_DIR, { recursive: true })

const db = new Database(path.join(DATA_DIR, 'phd.db'))
db.pragma('journal_mode = WAL')

export interface Collections {
  topics: Topic
  universities: University
  groups: Group
  researchers: Researcher
  papers: Paper
  deadlines: Deadline
  tasks: Task
  gaps: Gap
  venues: Venue
  docs: Doc
  positions: Position
  insights: Insight
  directions: Direction
}
export type Coll = keyof Collections

export const COLLS: Coll[] = ['topics', 'universities', 'groups', 'researchers', 'papers', 'deadlines', 'tasks', 'gaps', 'venues', 'docs', 'positions', 'insights', 'directions']

export const COLL_MODULE: Record<Coll, ModuleKey> = {
  topics: 'topics',
  universities: 'universities',
  groups: 'groups',
  researchers: 'researchers',
  papers: 'papers',
  deadlines: 'deadlines',
  tasks: 'today',
  gaps: 'gaps',
  venues: 'publish',
  docs: 'documents',
  positions: 'positions',
  insights: 'insights',
  directions: 'directions',
}

createSchema(db)

const now = () => new Date().toISOString()

// Defaults keep older rows valid when fields are added later.
const DEFAULTS: { [K in Coll]: Partial<Collections[K]> } = {
  topics: { keywords: [], priority: 2, status: 'active', description: '' },
  universities: { status: 'interested', country: '', countryCode: '' },
  groups: { topicIds: [] },
  researchers: { concepts: [], topicIds: [], status: 'new' },
  papers: { authors: [], topicIds: [], researcherIds: [], status: 'to_read' },
  deadlines: { kind: 'application', verified: false, status: 'open' },
  tasks: { priority: 2, status: 'todo', createdBy: 'user' },
  gaps: { evidence: [], novelty: 3, feasibility: 3, status: 'candidate', description: '' },
  venues: { type: 'journal', status: 'suggested' },
  docs: { kind: 'note', content: '', status: 'draft' },
  positions: { portal: 'web', status: 'found' },
  insights: { source: 'reddit', sentiment: 0, themes: [], evidence: [], postsAnalyzed: 0, summary: '' },
  directions: { description: '', keywords: [], color: '#2563eb', status: 'exploring' },
}

type Row = { id: number; data: string; created_at: string; updated_at: string }

function hydrate<C extends Coll>(c: C, r: Row): Collections[C] {
  const data = JSON.parse(r.data)
  const base = { ...DEFAULTS[c], ...data, id: r.id } as Record<string, unknown>
  if (c === 'topics' || c === 'universities' || c === 'gaps' || c === 'insights' || c === 'directions') base.createdAt ??= r.created_at
  if (c === 'positions') base.foundAt ??= r.created_at
  if (c === 'papers') base.addedAt ??= r.created_at
  if (c === 'docs') base.updatedAt = r.updated_at
  return base as unknown as Collections[C]
}

// Every board read and write below is scoped to the signed-in user (ctx.uid).

export function list<C extends Coll>(c: C): Collections[C][] {
  const rows = db.prepare(`SELECT * FROM ${c} WHERE uid = ? ORDER BY id`).all(uid()) as Row[]
  return rows.map((r) => hydrate(c, r))
}

export function get<C extends Coll>(c: C, id: number): Collections[C] | undefined {
  const r = db.prepare(`SELECT * FROM ${c} WHERE id = ? AND uid = ?`).get(id, uid()) as Row | undefined
  return r ? hydrate(c, r) : undefined
}

export function find<C extends Coll>(c: C, pred: (x: Collections[C]) => boolean): Collections[C] | undefined {
  return list(c).find(pred)
}

function strip(data: Record<string, unknown>) {
  const out = { ...data }
  delete out.id
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k]
  return out
}

export function insert<C extends Coll>(c: C, data: Partial<Collections[C]>): Collections[C] {
  const t = now()
  const payload = { ...DEFAULTS[c], ...strip(data as Record<string, unknown>) }
  const info = db.prepare(`INSERT INTO ${c} (data, created_at, updated_at, uid) VALUES (?, ?, ?, ?)`).run(JSON.stringify(payload), t, t, uid())
  mirror.touch(c, Number(info.lastInsertRowid))
  changed(c)
  return get(c, Number(info.lastInsertRowid))!
}

export function update<C extends Coll>(c: C, id: number, patch: Partial<Collections[C]>): Collections[C] | undefined {
  const cur = get(c, id)
  if (!cur) return undefined
  const next = { ...strip(cur as unknown as Record<string, unknown>), ...strip(patch as Record<string, unknown>) }
  db.prepare(`UPDATE ${c} SET data = ?, updated_at = ? WHERE id = ? AND uid = ?`).run(JSON.stringify(next), now(), id, uid())
  mirror.touch(c, id)
  changed(c)
  return get(c, id)
}

export function remove(c: Coll, id: number): boolean {
  const res = db.prepare(`DELETE FROM ${c} WHERE id = ? AND uid = ?`).run(id, uid())
  mirror.touch(c, id)
  if (res.changes) changed(c)
  return res.changes > 0
}

// Change notices are batched per user and go only to that user's open boards.
const pending = new Map<number, Set<Coll | 'profile' | 'activity'>>()
let flushTimer: NodeJS.Timeout | null = null
function changed(c: Coll | 'profile' | 'activity') {
  const u = uid()
  const set = pending.get(u) ?? new Set()
  set.add(c)
  pending.set(u, set)
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    for (const [to, cs] of pending) broadcast('changed', { collections: [...cs] }, to)
    pending.clear()
    flushTimer = null
  }, 120)
}

// ---------- key/value (profile, settings) ----------
// Plain keys are server-wide (settings, Claude accounts); a user's own keys go through ukey().

const ukey = (k: string) => `u${uid()}:${k}`

export function kvGet<T>(k: string, fallback: T): T {
  const r = db.prepare('SELECT v FROM kv WHERE k = ?').get(k) as { v: string } | undefined
  return r ? { ...fallback, ...JSON.parse(r.v) } : fallback
}

export function kvSet(k: string, v: unknown) {
  db.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, JSON.stringify(v))
  mirror.touch('kv', k)
}

const EMPTY_PROFILE: Profile = {
  name: '', field: '', stage: '', targetTerm: '', countries: [], interests: '', background: '', languages: '',
  directions: [], rankingSystem: 'QS', rankingMax: 0, conditions: [], conditionsNote: '', citizenship: '', education: '',
}

export function getProfile(): Profile {
  return kvGet(ukey('profile'), EMPTY_PROFILE)
}

export function setProfile(p: Partial<Profile>): Profile {
  const next = { ...getProfile(), ...p, updatedAt: now() }
  kvSet(ukey('profile'), next)
  changed('profile')
  return next
}

export interface Settings {
  model: string
  chatEffort: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  jobEffort: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  openalexKey: string
  s2Key: string
  mailto: string
  /** Switch to the next Claude account when the active one hits its plan limit. */
  autoSwitch: boolean
  /** Browser for JavaScript pages: auto (Edge, then Chrome, then Playwright's Chromium), msedge, chrome or chromium. */
  browser: string
  /** Show the browser window instead of running it in the background. */
  browserVisible: boolean
  /** Optional Reddit "script" app credentials (reddit.com/prefs/apps); without them the public RSS feeds are used. */
  redditClientId: string
  redditSecret: string
  /** Optional TRDesk task manager: agent API base URL, key (trd_...) and the plan Talvis works in (id or name). Off while the key is empty. */
  trdeskUrl: string
  trdeskKey: string
  trdeskPlan: string
  /** Language of board notes and job reports; chat replies follow the language the user writes in. */
  language: string
}

const DEFAULT_SETTINGS: Settings = {
  language: 'English',
  autoSwitch: true,
  model: 'claude-opus-5-5',
  chatEffort: 'medium',
  jobEffort: 'high',
  openalexKey: '',
  s2Key: '',
  mailto: '',
  browser: 'auto',
  browserVisible: false,
  redditClientId: '',
  redditSecret: '',
  trdeskUrl: '',
  trdeskKey: '',
  trdeskPlan: '',
}

export function getSettings(): Settings {
  return kvGet('settings', DEFAULT_SETTINGS)
}

export function setSettings(s: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...s }
  kvSet('settings', next)
  return next
}

// ---------- activity ----------

export function logActivity(source: Activity['source'], module: ModuleKey, text: string): Activity {
  const at = now()
  const info = db.prepare('INSERT INTO activity (at, source, module, text, uid) VALUES (?, ?, ?, ?, ?)').run(at, source, module, text, uid())
  const a: Activity = { id: Number(info.lastInsertRowid), at, source, module, text }
  mirror.touch('activity', a.id)
  broadcast('activity', a)
  return a
}

function recentActivity(n = 40): Activity[] {
  return (db.prepare('SELECT id, at, source, module, text FROM activity WHERE uid = ? ORDER BY id DESC LIMIT ?').all(uid(), n) as Activity[]).reverse()
}

// ---------- chat ----------

export interface Thread { id: string; title: string; sdk_session: string | null; sdk_account: string | null; created_at: string }

export function currentThread(): Thread {
  const t = db.prepare('SELECT id, title, sdk_session, sdk_account, created_at FROM chat_threads WHERE uid = ? ORDER BY created_at DESC LIMIT 1').get(uid()) as Thread | undefined
  return t ?? newThread()
}

export function newThread(title = 'Chat'): Thread {
  const t: Thread = { id: crypto.randomUUID(), title, sdk_session: null, sdk_account: null, created_at: now() }
  db.prepare('INSERT INTO chat_threads (id, title, sdk_session, created_at, uid) VALUES (?, ?, ?, ?, ?)').run(t.id, t.title, null, t.created_at, uid())
  mirror.touch('chat_threads', t.id)
  return t
}

export function setThreadSession(id: string, session: string, account: string) {
  db.prepare('UPDATE chat_threads SET sdk_session = ?, sdk_account = ? WHERE id = ? AND uid = ?').run(session, account, id, uid())
  mirror.touch('chat_threads', id)
}

/** The last messages of a thread as plain text, to carry a conversation over to another account. */
export function threadHistory(threadId: string, excludeId?: string, n = 12): string {
  return threadMessages(threadId)
    .filter((m) => m.id !== excludeId && m.text)
    .slice(-n)
    .map((m) => `${m.role === 'user' ? 'User' : 'Talvis'}: ${m.text.slice(0, 1200)}`)
    .join('\n\n')
}

export function threadMessages(threadId: string): ChatMessage[] {
  // Messages are reached through a thread, so the thread has to be the user's own.
  const rows = db.prepare('SELECT m.* FROM chat_messages m JOIN chat_threads t ON t.id = m.thread_id WHERE m.thread_id = ? AND t.uid = ? ORDER BY m.at').all(threadId, uid()) as {
    id: string; role: ChatMessage['role']; text: string; tools: string | null; at: string
  }[]
  return rows.map((r) => ({ id: r.id, role: r.role, text: r.text, tools: r.tools ? JSON.parse(r.tools) : undefined, at: r.at }))
}

export function saveMessage(threadId: string, m: ChatMessage) {
  db.prepare(
    'INSERT INTO chat_messages (id, thread_id, role, text, tools, at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET text = excluded.text, tools = excluded.tools',
  ).run(m.id, threadId, m.role, m.text, m.tools ? JSON.stringify(m.tools) : null, m.at)
  mirror.touch('chat_messages', m.id)
}

// ---------- API response cache ----------

export function cacheGet(k: string, maxAgeMs: number): string | undefined {
  const r = db.prepare('SELECT body, at FROM api_cache WHERE k = ?').get(k) as { body: string; at: number } | undefined
  if (!r || Date.now() - r.at > maxAgeMs) return undefined
  return r.body
}

export function cacheSet(k: string, body: string) {
  db.prepare('INSERT INTO api_cache (k, body, at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET body = excluded.body, at = excluded.at').run(k, body, Date.now())
}

// ---------- URLs seen in tool results (evidence links must come from here) ----------

export const normUrl = (u: string) =>
  u.trim().replace(/[).,;\]>"']+$/, '').replace(/^http:\/\//, 'https://').replace(/^https:\/\/(www\.|old\.|new\.)?reddit\.com/, 'https://reddit.com').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase()

const seenStmt = db.prepare('INSERT INTO seen_urls (url, at) VALUES (?, ?) ON CONFLICT(url) DO UPDATE SET at = excluded.at')
export function noteUrls(text: string | string[]) {
  const urls = Array.isArray(text) ? text : (text.match(/https?:\/\/[^\s"'<>()\]\\]+/g) ?? [])
  const t = Date.now()
  db.transaction(() => {
    for (const u of urls) if (u) seenStmt.run(normUrl(u), t)
  })()
  for (const u of urls) if (u) mirror.touch('seen_urls', normUrl(u))
}

export function wasSeen(url: string): boolean {
  return Boolean(db.prepare('SELECT 1 FROM seen_urls WHERE url = ?').get(normUrl(url)))
}

// ---------- full snapshot for the board ----------

export function getState(jobs: AppState['jobs']): AppState {
  return {
    profile: getProfile(),
    topics: list('topics'),
    universities: list('universities'),
    groups: list('groups'),
    researchers: list('researchers'),
    // Abstracts stay server-side; the panel fetches them per paper.
    papers: list('papers').map((p) => ({ ...p, abstract: p.abstract ? p.abstract.slice(0, 280) : undefined })),
    deadlines: list('deadlines'),
    tasks: list('tasks'),
    gaps: list('gaps'),
    venues: list('venues'),
    docs: list('docs').map((d) => ({ ...d, content: d.content.slice(0, 400) })),
    positions: list('positions'),
    insights: list('insights'),
    directions: list('directions'),
    activity: recentActivity(),
    jobs,
  }
}

// ---------- users ----------

export interface User { id: number; email: string; name: string; salt: string; hash: string; admin: number; created_at: string }
export type PublicUser = { id: number; email: string; name: string; admin: boolean }

export const publicUser = (u: User): PublicUser => ({ id: u.id, email: u.email, name: u.name, admin: Boolean(u.admin) })
export const normEmail = (e: string) => e.trim().toLowerCase()

export function userCount(): number {
  return (db.prepare('SELECT count(*) AS n FROM users').get() as { n: number }).n
}

export function getUser(id: number): User | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined
}

export function userByEmail(email: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(normEmail(email)) as User | undefined
}

/** The first account is the admin: it manages settings and Claude accounts, and keeps the board from before accounts existed. */
export function createUser(u: { email: string; name: string; salt: string; hash: string }): User {
  const first = userCount() === 0
  const info = db
    .prepare('INSERT INTO users (email, name, salt, hash, admin, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(normEmail(u.email), u.name.trim(), u.salt, u.hash, first ? 1 : 0, now())
  const id = Number(info.lastInsertRowid)
  mirror.touch('users', id)
  if (first) adoptOrphans(id)
  return getUser(id)!
}

export function setUserPassword(id: number, salt: string, hash: string) {
  db.prepare('UPDATE users SET salt = ?, hash = ? WHERE id = ?').run(salt, hash, id)
  mirror.touch('users', id)
}

/** kv keys that were the single board's before accounts existed. */
const LEGACY_KV = ['profile']

/** Board rows without an owner (from before accounts, or restored that way) go to the given user, normally the first admin. */
export function adoptOrphans(to?: number) {
  const owner = to ?? (db.prepare('SELECT id FROM users ORDER BY admin DESC, id LIMIT 1').get() as { id: number } | undefined)?.id
  if (!owner) return
  let moved = 0
  for (const t of USER_TABLES) {
    const ids = (db.prepare(`SELECT id FROM ${t} WHERE uid IS NULL`).all() as { id: unknown }[]).map((r) => r.id)
    if (!ids.length) continue
    db.prepare(`UPDATE ${t} SET uid = ? WHERE uid IS NULL`).run(owner)
    for (const k of ids) mirror.touch(t, k)
    moved += ids.length
  }
  for (const k of LEGACY_KV) {
    const r = db.prepare('SELECT v FROM kv WHERE k = ?').get(k) as { v: string } | undefined
    if (!r) continue
    const target = `u${owner}:${k}`
    if (!db.prepare('SELECT 1 FROM kv WHERE k = ?').get(target)) {
      db.prepare('INSERT INTO kv (k, v) VALUES (?, ?)').run(target, r.v)
      mirror.touch('kv', target)
    }
    db.prepare('DELETE FROM kv WHERE k = ?').run(k)
    mirror.touch('kv', k)
    moved++
  }
  if (moved) console.log(`Moved ${moved} rows from before accounts to user ${owner}`)
}
