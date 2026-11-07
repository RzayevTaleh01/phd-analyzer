import express, { type NextFunction, type Request, type Response } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import {
  adoptOrphans, COLLS, currentThread, get, getSettings, getState, insert, list, logActivity, newThread, remove, setProfile, setSettings,
  threadMessages, update, COLL_MODULE, type Coll,
} from './db'
import { addClient, broadcast } from './events'
import { resolveUniversity, savePaper, saveResearcher, saveVenue } from './library'
import { dedupe, searchPapers, type PaperSource } from './research'
import * as oa from './research/openalex'
import type { WorkHit } from './research/types'
import { beginLogin, chatBusy, checkClaude, claudeState, listJobs, sendChat, startJob, stopChat, stopJob } from './agent/runner'
import { cancelLogin, loginState, submitCode } from './agent/login'
import { accountsView, activeAccount, addAccount, checkAccount, checkAll, publishAccounts, removeAccount, renameAccount, setActive } from './agent/accounts'
import type { JobKind } from './agent/prompts'
import { adminOnly, authInfo, changePassword, guard, login, logout, register } from './auth'
import { uid } from './ctx'
import { readPage } from './browser/read'
import { browserStatus } from './browser/render'
import { searchPortals, PORTALS, PORTAL_KEYS, portalOf } from './research/portals'
import { findSubreddits, redditSearch, redditThread } from './research/reddit'
import { flatTasks, planRef, syncBoard, trdesk } from './integrations/trdesk'
import { todayISO } from './agent/overview'

const PORT = Number(process.env.PORT || 5179)
const app = express()
// Behind Cloud Run's proxy: real client address and https for the login cookie.
app.set('trust proxy', true)
app.use(express.json({ limit: '4mb' }))
app.get('/api/auth', authInfo)
app.post('/api/auth/register', register)
app.post('/api/auth/login', login)
app.post('/api/auth/logout', logout)
app.post('/api/auth/password', changePassword)
app.use(guard)

type H = (req: Request, res: Response) => unknown | Promise<unknown>
const h = (fn: H) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const out = await fn(req, res)
    if (out !== undefined && !res.headersSent) res.json(out)
  } catch (e) {
    next(e)
  }
}

const isColl = (c: string): c is Coll => (COLLS as string[]).includes(c)
const num = (v: unknown) => (v === undefined || v === '' ? undefined : Number(v))

// ---------- board ----------
app.get('/api/state', h(() => getState(listJobs())))
app.get('/api/events', (_req, res) => addClient(res, uid()))

app.put('/api/profile', h((req) => setProfile(req.body)))
// Settings are server-wide (model, keys, browser): the admin's to read and change.
app.get('/api/settings', adminOnly, h(() => getSettings()))
app.put('/api/settings', adminOnly, h((req) => setSettings(req.body)))

app.get('/api/items/:coll/:id', h((req, res) => {
  const c = String(req.params.coll)
  if (!isColl(c)) return res.status(404).json({ error: 'unknown collection' })
  return get(c, Number(req.params.id)) ?? res.status(404).json({ error: 'not found' })
}))
app.post('/api/items/:coll', h((req, res) => {
  const c = String(req.params.coll)
  if (!isColl(c)) return res.status(404).json({ error: 'unknown collection' })
  const extra = c === 'tasks' ? { createdBy: 'user' } : c === 'topics' || c === 'universities' || c === 'gaps' || c === 'insights' || c === 'directions' ? { createdAt: new Date().toISOString() } : {}
  const item = insert(c, { ...extra, ...req.body })
  logActivity('user', COLL_MODULE[c], `Added: ${(item as { title?: string; name?: string }).title ?? (item as { name?: string }).name ?? c}`)
  return item
}))
app.patch('/api/items/:coll/:id', h((req, res) => {
  const c = String(req.params.coll)
  if (!isColl(c)) return res.status(404).json({ error: 'unknown collection' })
  const patch = { ...req.body }
  if (c === 'deadlines' && patch.verified === true) patch.verifiedAt = new Date().toISOString()
  return update(c, Number(req.params.id), patch) ?? res.status(404).json({ error: 'not found' })
}))
app.delete('/api/items/:coll/:id', h((req, res) => {
  const c = String(req.params.coll)
  if (!isColl(c)) return res.status(404).json({ error: 'unknown collection' })
  return { ok: remove(c, Number(req.params.id)) }
}))

// ---------- research (direct from the panels) ----------
app.get('/api/research/papers', h(async (req) => {
  const q = String(req.query.q ?? '').trim()
  if (!q) return { hits: [], errors: [] }
  return searchPapers({
    query: q,
    source: (req.query.source as PaperSource) ?? 'openalex',
    fromYear: num(req.query.from),
    toYear: num(req.query.to),
    sort: (req.query.sort as 'relevance' | 'cited' | 'recent') ?? 'relevance',
    limit: num(req.query.limit) ?? 20,
  })
}))
app.get('/api/research/institutions', h((req) => oa.findInstitutions(String(req.query.q ?? ''))))
app.get('/api/research/researchers', h((req) => oa.topAuthorsAt(String(req.query.institutionId), String(req.query.q ?? ''), num(req.query.from), num(req.query.limit) ?? 15)))
app.get('/api/research/author-works', h(async (req) =>
  dedupe(await oa.searchWorks({ authorId: String(req.query.id), query: (req.query.q as string) || undefined, sort: (req.query.sort as 'cited' | 'recent') ?? 'recent', limit: num(req.query.limit) ?? 20 })),
))
app.get('/api/research/venues', h((req) => oa.venuesFor(String(req.query.q ?? ''), num(req.query.from), num(req.query.limit) ?? 15)))
app.get('/api/research/trend', h((req) => oa.yearTrend(String(req.query.q ?? ''), num(req.query.from))))

// Web sources: portals, Reddit, any page through the browser.
app.get('/api/portals', h(() => PORTAL_KEYS.map((k) => ({ key: k, name: PORTALS[k].name, note: PORTALS[k].note, direct: Boolean(PORTALS[k].direct) }))))
app.get('/api/portals/search', h((req) => {
  const q = String(req.query.q ?? '').trim()
  if (!q) return []
  const portals = req.query.portals ? String(req.query.portals).split(',').filter(Boolean) : undefined
  return searchPortals({ query: q, portals, country: (req.query.country as string) || undefined, limit: num(req.query.limit) })
}))
app.post('/api/positions', h((req, res) => {
  const b = req.body as { title?: string; url?: string; university?: string; deadline?: string; summary?: string; funding?: string }
  if (!b.title || !b.url) return res.status(400).json({ error: 'title and url are required' })
  const dup = list('positions').find((x) => x.url === b.url)
  if (dup) return dup
  const pos = insert('positions', { ...b, title: b.title, url: b.url, portal: portalOf(b.url), status: 'found', foundAt: new Date().toISOString() })
  logActivity('user', 'positions', `PhD position:${pos.title.slice(0, 80)}`)
  return pos
}))
app.get('/api/reddit/search', h((req) => redditSearch({
  query: String(req.query.q ?? ''),
  subreddit: (req.query.sub as string) || undefined,
  sort: (req.query.sort as 'relevance') || undefined,
  time: (req.query.t as 'all') || undefined,
  limit: num(req.query.limit),
})))
app.get('/api/reddit/thread', h((req) => redditThread(String(req.query.url ?? ''), num(req.query.limit) ?? 40)))
app.get('/api/reddit/subreddits', h((req) => findSubreddits(String(req.query.q ?? ''))))
app.get('/api/browse', h((req) => readPage(String(req.query.url ?? ''), { mode: (req.query.mode as 'auto') || 'auto' })))
app.get('/api/browser/status', h(() => browserStatus()))

// TRDesk (task manager)
app.post('/api/trdesk/sync', h(async () => {
  const rep = await syncBoard()
  logActivity('user', 'today', `TRDesk sync: +${rep.added.length}, completed ${rep.doneFromTrdesk.length + rep.doneToTrdesk.length}`)
  return rep
}))
app.get('/api/trdesk/upcoming', h(async () => {
  const p = await trdesk.plan(planRef())
  const today = todayISO()
  return { plan: { id: p.id, title: p.title }, tasks: flatTasks(p, { from: today }).slice(0, 40), overdue: flatTasks(p, { to: today, open: true }).filter((t) => t.date < today) }
}))
app.put('/api/trdesk/tasks/:id/done', h(async (req) => trdesk.setDone(planRef(), String(req.params.id), req.body?.done === false ? null : todayISO())))

app.post('/api/research/save-paper', h((req) => {
  const { hit, topicIds, researcherIds, status } = req.body as { hit: WorkHit; topicIds?: number[]; researcherIds?: number[]; status?: 'to_read' }
  const out = savePaper(hit, { topicIds, researcherIds, status })
  if (out.created) logActivity('user', 'papers', `Paper: ${out.paper.title.slice(0, 80)}`)
  return out
}))
app.post('/api/research/save-researcher', h(async (req, res) => {
  const { openalexId, ...extra } = req.body as { openalexId: string; universityId?: number; topicIds?: number[]; relevance?: number; topicWorks?: number }
  const [a] = await oa.getAuthors([openalexId])
  if (!a) return res.status(404).json({ error: 'author not found' })
  const out = saveResearcher(a, extra)
  if (out.created) logActivity('user', 'researchers', `Researcher: ${out.researcher.name}`)
  return out
}))
app.post('/api/research/save-venue', h(async (req) => {
  const { openalexId, ...extra } = req.body as { openalexId: string; fit?: number; reason?: string }
  const src = await oa.getSource(openalexId)
  return saveVenue(src ?? { name: openalexId }, extra)
}))
app.post('/api/universities/resolve', h(async (req) => {
  const { name, ...extra } = req.body as { name: string }
  const u = await resolveUniversity(name, extra)
  logActivity('user', 'universities', `University: ${u.name}`)
  return u
}))

// ---------- Claude ----------
app.get('/api/claude', h(async (req) => (req.query.refresh ? checkClaude(true) : claudeState())))
app.get('/api/claude/login', h(() => loginState()))
app.post('/api/claude/login', adminOnly, h((req) => beginLogin(req.body?.accountId)))

// ---------- Claude accounts ----------
app.get('/api/accounts', h(() => accountsView()))
app.post('/api/accounts', adminOnly, h((req) => {
  const acc = addAccount(req.body?.label)
  return { account: acc, login: beginLogin(acc.id) }
}))
app.post('/api/accounts/:id/activate', adminOnly, h((req) => {
  setActive(String(req.params.id))
  return accountsView()
}))
app.post('/api/accounts/:id/check', adminOnly, h(async (req) => {
  await checkAccount(String(req.params.id))
  return accountsView()
}))
app.patch('/api/accounts/:id', adminOnly, h((req) => {
  renameAccount(String(req.params.id), String(req.body?.label ?? ''))
  return accountsView()
}))
app.delete('/api/accounts/:id', adminOnly, h((req, res) => (removeAccount(String(req.params.id)) ? accountsView() : res.status(400).json({ error: 'This account cannot be removed' }))))
app.put('/api/accounts/auto-switch', adminOnly, h((req) => {
  setSettings({ autoSwitch: Boolean(req.body?.on) })
  publishAccounts()
  return accountsView()
}))
app.post('/api/claude/login/code', adminOnly, h((req) => submitCode(String(req.body?.code ?? ''))))
app.post('/api/claude/login/cancel', adminOnly, h(() => {
  cancelLogin()
  return loginState()
}))

app.get('/api/chat', h(() => {
  const t = currentThread()
  return { thread: t.id, messages: threadMessages(t.id), busy: chatBusy() }
}))
app.post('/api/chat', h((req, res) => {
  const text = String(req.body?.text ?? '').trim()
  if (!text) return res.status(400).json({ error: 'empty' })
  if (chatBusy()) return res.status(409).json({ error: 'Talvis is still answering the previous message' })
  const dir = Number(req.body?.directionId) || undefined
  void sendChat(text, dir).catch((e) => console.error('chat failed', e))
  return res.status(202).json({ ok: true })
}))
app.post('/api/chat/stop', h(() => {
  stopChat()
  return { ok: true }
}))
app.post('/api/chat/new', h(() => {
  stopChat()
  const t = newThread()
  broadcast('chat', { kind: 'reset', thread: t.id })
  return { thread: t.id }
}))

// ---------- jobs ----------
const JOB_KINDS: JobKind[] = ['find_universities', 'gap_analysis', 'scout_university', 'verify_deadlines', 'daily_plan', 'venue_match', 'student_voice', 'portal_scan', 'direction_fit', 'admission_chance', 'setup_directions']
app.post('/api/jobs', h((req, res) => {
  const { kind, ...params } = req.body as { kind: JobKind }
  if (!JOB_KINDS.includes(kind)) return res.status(400).json({ error: 'unknown job' })
  return { id: startJob(kind, params) }
}))
app.post('/api/jobs/:id/stop', h((req) => {
  stopJob(String(req.params.id))
  return { ok: true }
}))

// ---------- built UI ----------
const dist = path.resolve('dist')
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist))
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  res.status(500).json({ error: err.message })
})

// Local only by default (the server runs agents with your Claude login); HOST=0.0.0.0 in the container.
const HOST = process.env.HOST || '127.0.0.1'
if (HOST !== '127.0.0.1' && HOST !== 'localhost') console.warn('NOTE: the server is listening on a public address: anyone who can open it can create an account')
// Board rows from before accounts (or restored without an owner) belong to the first account.
adoptOrphans()
app.listen(PORT, HOST, () => {
  console.log(`PhD Analyzer (Talvis): http://localhost:${PORT}`)
  void checkAll().then(() => {
    const a = activeAccount()
    console.log(`Claude: ${a.label} ${a.state}${a.email ? ` (${a.email})` : ''}`)
  })
})
