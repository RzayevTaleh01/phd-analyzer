import express, { type NextFunction, type Request, type Response } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import {
  COLLS, currentThread, get, getSettings, getState, insert, logActivity, newThread, remove, setProfile, setSettings,
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

const PORT = Number(process.env.PORT || 5179)
const app = express()
app.use(express.json({ limit: '4mb' }))

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
app.get('/api/events', (_req, res) => addClient(res))

app.put('/api/profile', h((req) => setProfile(req.body)))
app.get('/api/settings', h(() => getSettings()))
app.put('/api/settings', h((req) => setSettings(req.body)))

app.get('/api/items/:coll/:id', h((req, res) => {
  const c = String(req.params.coll)
  if (!isColl(c)) return res.status(404).json({ error: 'unknown collection' })
  return get(c, Number(req.params.id)) ?? res.status(404).json({ error: 'not found' })
}))
app.post('/api/items/:coll', h((req, res) => {
  const c = String(req.params.coll)
  if (!isColl(c)) return res.status(404).json({ error: 'unknown collection' })
  const extra = c === 'tasks' ? { createdBy: 'user' } : c === 'topics' || c === 'universities' || c === 'gaps' ? { createdAt: new Date().toISOString() } : {}
  const item = insert(c, { ...extra, ...req.body })
  logActivity('user', COLL_MODULE[c], `Əlavə: ${(item as { title?: string; name?: string }).title ?? (item as { name?: string }).name ?? c}`)
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

app.post('/api/research/save-paper', h((req) => {
  const { hit, topicIds, researcherIds, status } = req.body as { hit: WorkHit; topicIds?: number[]; researcherIds?: number[]; status?: 'to_read' }
  const out = savePaper(hit, { topicIds, researcherIds, status })
  if (out.created) logActivity('user', 'papers', `Məqalə: ${out.paper.title.slice(0, 80)}`)
  return out
}))
app.post('/api/research/save-researcher', h(async (req, res) => {
  const { openalexId, ...extra } = req.body as { openalexId: string; universityId?: number; topicIds?: number[]; relevance?: number; topicWorks?: number }
  const [a] = await oa.getAuthors([openalexId])
  if (!a) return res.status(404).json({ error: 'author not found' })
  const out = saveResearcher(a, extra)
  if (out.created) logActivity('user', 'researchers', `Tədqiqatçı: ${out.researcher.name}`)
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
  logActivity('user', 'universities', `Universitet: ${u.name}`)
  return u
}))

// ---------- Claude ----------
app.get('/api/claude', h(async (req) => (req.query.refresh ? checkClaude(true) : claudeState())))
app.get('/api/claude/login', h(() => loginState()))
app.post('/api/claude/login', h((req) => beginLogin(req.body?.accountId)))

// ---------- Claude accounts ----------
app.get('/api/accounts', h(() => accountsView()))
app.post('/api/accounts', h((req) => {
  const acc = addAccount(req.body?.label)
  return { account: acc, login: beginLogin(acc.id) }
}))
app.post('/api/accounts/:id/activate', h((req) => {
  setActive(String(req.params.id))
  return accountsView()
}))
app.post('/api/accounts/:id/check', h(async (req) => {
  await checkAccount(String(req.params.id))
  return accountsView()
}))
app.patch('/api/accounts/:id', h((req) => {
  renameAccount(String(req.params.id), String(req.body?.label ?? ''))
  return accountsView()
}))
app.delete('/api/accounts/:id', h((req, res) => (removeAccount(String(req.params.id)) ? accountsView() : res.status(400).json({ error: 'Bu hesab silinə bilməz' }))))
app.put('/api/accounts/auto-switch', h((req) => {
  setSettings({ autoSwitch: Boolean(req.body?.on) })
  publishAccounts()
  return accountsView()
}))
app.post('/api/claude/login/code', h((req) => submitCode(String(req.body?.code ?? ''))))
app.post('/api/claude/login/cancel', h(() => {
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
  if (chatBusy()) return res.status(409).json({ error: 'Talvis hələ əvvəlki suala cavab verir' })
  void sendChat(text).catch((e) => console.error('chat failed', e))
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
const JOB_KINDS: JobKind[] = ['find_universities', 'gap_analysis', 'scout_university', 'verify_deadlines', 'daily_plan', 'venue_match']
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

// Local only: the server can run research agents and open a login terminal.
app.listen(PORT, '127.0.0.1', () => {
  console.log(`PhD Analyzer (Talvis): http://localhost:${PORT}`)
  void checkAll().then(() => {
    const a = activeAccount()
    console.log(`Claude: ${a.label} ${a.state}${a.email ? ` (${a.email})` : ''}`)
  })
})
