import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import type {
  Activity, AppState, ChatMessage, Deadline, Direction, Doc, Gap, Group, Insight, ModuleKey, Paper, Position, Profile, Researcher, Task,
  Topic, University, Venue,
} from '../shared/types'
import { broadcast } from './events'
import { mirror } from './pgsync'
import { createSchema, DATA_DIR } from './schema'

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
  directions: { description: '', keywords: [], color: '#2fd8ff', status: 'exploring' },
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

export function list<C extends Coll>(c: C): Collections[C][] {
  const rows = db.prepare(`SELECT * FROM ${c} ORDER BY id`).all() as Row[]
  return rows.map((r) => hydrate(c, r))
}

export function get<C extends Coll>(c: C, id: number): Collections[C] | undefined {
  const r = db.prepare(`SELECT * FROM ${c} WHERE id = ?`).get(id) as Row | undefined
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
  const info = db.prepare(`INSERT INTO ${c} (data, created_at, updated_at) VALUES (?, ?, ?)`).run(JSON.stringify(payload), t, t)
  mirror.touch(c, Number(info.lastInsertRowid))
  changed(c)
  return get(c, Number(info.lastInsertRowid))!
}

export function update<C extends Coll>(c: C, id: number, patch: Partial<Collections[C]>): Collections[C] | undefined {
  const cur = get(c, id)
  if (!cur) return undefined
  const next = { ...strip(cur as unknown as Record<string, unknown>), ...strip(patch as Record<string, unknown>) }
  db.prepare(`UPDATE ${c} SET data = ?, updated_at = ? WHERE id = ?`).run(JSON.stringify(next), now(), id)
  mirror.touch(c, id)
  changed(c)
  return get(c, id)
}

export function remove(c: Coll, id: number): boolean {
  const res = db.prepare(`DELETE FROM ${c} WHERE id = ?`).run(id)
  mirror.touch(c, id)
  if (res.changes) changed(c)
  return res.changes > 0
}

let pending = new Set<Coll | 'profile' | 'activity'>()
let flushTimer: NodeJS.Timeout | null = null
function changed(c: Coll | 'profile' | 'activity') {
  pending.add(c)
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    broadcast('changed', { collections: [...pending] })
    pending = new Set()
    flushTimer = null
  }, 120)
}

// ---------- key/value (profile, settings) ----------

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
  return kvGet('profile', EMPTY_PROFILE)
}

export function setProfile(p: Partial<Profile>): Profile {
  const next = { ...getProfile(), ...p, updatedAt: now() }
  kvSet('profile', next)
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
  /** TRDesk task manager: agent API base URL, key (trd_...) and the plan Talvis works in (id or name). */
  trdeskUrl: string
  trdeskKey: string
  trdeskPlan: string
}

const DEFAULT_SETTINGS: Settings = {
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
  const info = db.prepare('INSERT INTO activity (at, source, module, text) VALUES (?, ?, ?, ?)').run(at, source, module, text)
  const a: Activity = { id: Number(info.lastInsertRowid), at, source, module, text }
  mirror.touch('activity', a.id)
  broadcast('activity', a)
  return a
}

function recentActivity(n = 40): Activity[] {
  return (db.prepare('SELECT * FROM activity ORDER BY id DESC LIMIT ?').all(n) as Activity[]).reverse()
}

// ---------- chat ----------

export interface Thread { id: string; title: string; sdk_session: string | null; sdk_account: string | null; created_at: string }

export function currentThread(): Thread {
  const t = db.prepare('SELECT * FROM chat_threads ORDER BY created_at DESC LIMIT 1').get() as Thread | undefined
  return t ?? newThread()
}

export function newThread(title = 'Söhbət'): Thread {
  const t: Thread = { id: crypto.randomUUID(), title, sdk_session: null, sdk_account: null, created_at: now() }
  db.prepare('INSERT INTO chat_threads (id, title, sdk_session, created_at) VALUES (?, ?, ?, ?)').run(t.id, t.title, null, t.created_at)
  mirror.touch('chat_threads', t.id)
  return t
}

export function setThreadSession(id: string, session: string, account: string) {
  db.prepare('UPDATE chat_threads SET sdk_session = ?, sdk_account = ? WHERE id = ?').run(session, account, id)
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
  const rows = db.prepare('SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY at').all(threadId) as {
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

// ---------- direction groups: two to start with, once ----------

if (!kvGet('directionsSeeded', { done: false }).done) {
  if (list('directions').length === 0) {
    const t = now()
    insert('directions', {
      name: 'NLP',
      description: 'Təbii dilin emalı: aşağı resurslu dillər, Azərbaycan dili, korpus, morfologiya, LLM-lər, təhsil üçün NLP.',
      keywords: ['NLP', 'natural language processing', 'computational linguistics', 'low-resource', 'Azerbaijani', 'morpholog', 'tokeniz', 'corpus', 'language model', 'LLM', 'machine translation', 'grammatical error', 'speech', 'dialogue', 'syntax', 'semantics', 'educational NLP'],
      color: '#2fd8ff',
      status: 'exploring',
      createdAt: t,
    })
    insert('directions', {
      name: 'Adaptive learning',
      description: 'AI in Education: adaptiv öyrənmə sistemləri, intellektual tutorlar, learner modeling, educational data mining, learning analytics, HCI və istifadəçi tədqiqatları.',
      keywords: ['adaptive learning', 'adaptive', 'intelligent tutoring', 'tutor', 'learner model', 'educational data mining', 'learning analytics', 'AI in education', 'education', 'e-learning', 'online learning', 'feedback', 'personaliz', 'recommender', 'vocabulary', 'learners', 'teaching', 'HCI', 'human-computer interaction', 'user study'],
      color: '#a594ff',
      status: 'exploring',
      createdAt: t,
    })
  }
  kvSet('directionsSeeded', { done: true })
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
