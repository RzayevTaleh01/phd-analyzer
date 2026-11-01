import { query, SYSTEM_PROMPT_DYNAMIC_BOUNDARY, type Options, type SDKMessage, type SDKRateLimitInfo } from '@anthropic-ai/claude-agent-sdk'
import type { ChatMessage, Job, ModuleKey } from '../../shared/types'
import { CONDITION_BY_KEY } from '../../shared/criteria'
import { currentThread, get, getProfile, getSettings, list, logActivity, noteUrls, saveMessage, setThreadSession, threadHistory, update } from '../db'
import { broadcast } from '../events'
import * as oa from '../research/openalex'
import {
  AGENT_CWD, activeAccount, checkAccount, checkAll, claudeState, envFor, getAccount, limitText, markLimited, pickAccount, recordRateLimit,
  type Account,
} from './accounts'
import { startLogin, type LoginState } from './login'
import { buildOverview } from './overview'
import { CORE_PROMPT, JOB_PROMPTS, type JobKind } from './prompts'
import { PHD_TOOL_NAMES, phdServer, setJobStarter, toolMeta } from './tools'

export { claudeState }

function baseOptions(o: {
  effort: Options['effort']
  maxTurns: number
  resume?: string
  abort: AbortController
  persist: boolean
  account: Account
  history?: string
  focus?: string
}): Options {
  const s = getSettings()
  const fallback = s.model.includes('sonnet') ? 'claude-opus-5-5' : 'claude-sonnet-5-5'
  const dynamic = `# BOARD SNAPSHOT\n${buildOverview()}${o.focus ? `\n\nFOCUS: ${o.focus}` : ''}${o.history ? `\n\n# CONVERSATION SO FAR (continue it naturally)\n${o.history}` : ''}`
  return {
    model: s.model || undefined,
    fallbackModel: fallback,
    effort: o.effort,
    systemPrompt: [CORE_PROMPT, SYSTEM_PROMPT_DYNAMIC_BOUNDARY, dynamic],
    tools: ['WebSearch', 'WebFetch'],
    allowedTools: ['WebSearch', 'WebFetch', ...PHD_TOOL_NAMES],
    mcpServers: { phd: phdServer() },
    permissionMode: 'dontAsk',
    settingSources: [],
    strictMcpConfig: true,
    cwd: AGENT_CWD,
    env: envFor(o.account.id),
    includePartialMessages: true,
    maxTurns: o.maxTurns,
    resume: o.resume,
    persistSession: o.persist,
    abortController: o.abort,
    stderr: (d) => {
      if (/error/i.test(d)) console.error('[claude]', d.trim().slice(0, 400))
    },
  }
}

// ---------- Claude login status ----------

export async function checkClaude(force = false) {
  const a = activeAccount()
  if (force || a.state === 'checking' || !a.checkedAt || Date.now() - a.checkedAt > 60_000) await checkAll()
  return claudeState()
}

/** Sign in the given account (default: the active one) inside the app. */
export function beginLogin(accountId?: string): LoginState {
  const id = accountId && getAccount(accountId) ? accountId : activeAccount().id
  return startLogin(envFor(id) as NodeJS.ProcessEnv, id, () => void checkAccount(id))
}

const AUTH_RE = /authenticat|oauth|log ?in|credential|401/i
const LIMIT_RE = /usage limit|limit reached|hit your limit|rate.?limit|too many requests|\b429\b|quota exceeded/i

// ---------- stream handling shared by chat and jobs ----------

interface StreamHooks {
  onText?: (t: string) => void
  onTool?: (id: string, name: string, input: Record<string, unknown>) => void
  onToolDone?: (id: string, isError: boolean) => void
  onInit?: (sessionId: string) => void
  onRateLimit?: (info: SDKRateLimitInfo) => void
}

async function consume(q: AsyncIterable<SDKMessage>, h: StreamHooks): Promise<{ text: string; error?: string }> {
  let finalText = ''
  let error: string | undefined
  let blockOpen = false
  for await (const m of q) {
    if (m.type === 'system' && m.subtype === 'init') h.onInit?.(m.session_id)
    else if (m.type === 'rate_limit_event') h.onRateLimit?.(m.rate_limit_info)
    else if (m.type === 'assistant' && m.error === 'rate_limit') h.onRateLimit?.({ status: 'rejected' })
    else if (m.type === 'stream_event' && !m.parent_tool_use_id) {
      const ev = m.event
      if (ev.type === 'content_block_start' && ev.content_block.type === 'text') {
        if (blockOpen) h.onText?.('\n\n')
        blockOpen = true
      } else if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') h.onText?.(ev.delta.text)
    } else if (m.type === 'assistant' && !m.parent_tool_use_id) {
      for (const b of m.message.content) {
        if (b.type !== 'tool_use') continue
        const input = (b.input ?? {}) as Record<string, unknown>
        if (b.name === 'WebFetch' && typeof input.url === 'string') noteUrls([input.url])
        h.onTool?.(b.id, b.name, input)
      }
    } else if (m.type === 'user' && Array.isArray(m.message.content)) {
      for (const b of m.message.content as { type: string; tool_use_id?: string; is_error?: boolean; content?: unknown }[]) {
        if (b.type !== 'tool_result' || !b.tool_use_id) continue
        if (!b.is_error && b.content) noteUrls(typeof b.content === 'string' ? b.content : JSON.stringify(b.content))
        h.onToolDone?.(b.tool_use_id, Boolean(b.is_error))
      }
    } else if (m.type === 'result') {
      if (m.subtype === 'success') {
        finalText = m.result
        if (m.is_error) error = m.result
      } else error = m.errors?.join('; ') || m.subtype
    }
  }
  return { text: finalText, error }
}

function friendlyError(e: string, account?: Account): string {
  if (AUTH_RE.test(e) && !LIMIT_RE.test(e)) {
    if (account) void checkAccount(account.id)
    return `Claude-a giriş lazımdır${account ? ` (${account.label})` : ''}. **Claude-a qoşul** düyməsini bas: açılan linkdə hesabına daxil ol, göstərilən kodu bura yapışdır. Sonra yenidən yaz.`
  }
  if (/max_turns/.test(e)) return 'Addım limiti doldu, iş yarımçıq qaldı. Davam etməyimi istəsən "davam et" yaz.'
  return `Xəta: ${e}`
}

interface Attempt {
  text: string
  error?: string
  limited: boolean
}

/**
 * Runs one query, and when the account hits its plan limit, moves to the next ready account
 * and runs it again (auto-switch). `run` gets the account and whether this is a retry.
 */
export async function withFailover(
  run: (account: Account, retry: boolean, onRateLimit: (info: SDKRateLimitInfo) => void) => Promise<{ text: string; error?: string }>,
  onSwitch: (from: Account, to: Account) => void,
): Promise<Attempt & { account?: Account }> {
  const tried = new Set<string>()
  let prev: Account | undefined
  for (;;) {
    const account = await pickAccount(tried)
    if (!account) return { text: '', error: prev ? limitText(getAccount(prev.id)!) + ' Başqa hazır hesab yoxdur.' : 'Claude hesabı yoxdur', limited: true, account: prev }
    if (prev) onSwitch(prev, account)
    tried.add(account.id)
    let limited = false
    let res: { text: string; error?: string }
    try {
      res = await run(account, Boolean(prev), (info) => {
        recordRateLimit(account.id, info)
        if (info.status === 'rejected') limited = true
      })
    } catch (e) {
      res = { text: '', error: (e as Error).message }
    }
    if (!limited && res.error && LIMIT_RE.test(res.error)) {
      limited = true
      markLimited(account.id)
    }
    if (!limited) return { ...res, limited: false, account }
    if (!getSettings().autoSwitch) return { text: res.text, error: `${limitText(getAccount(account.id)!)} Profil → Claude hesablarında başqa hesaba keç və ya avtomatik keçidi aç.`, limited: true, account }
    prev = account
  }
}

// ---------- chat ----------

let chatAbort: AbortController | null = null

export function chatBusy() {
  return chatAbort !== null
}

export function stopChat() {
  chatAbort?.abort()
}

export async function sendChat(text: string, directionId?: number): Promise<void> {
  if (chatAbort) throw new Error('busy')
  const thread = currentThread()
  // Links the user pastes count as known sources.
  noteUrls(text)
  const user: ChatMessage = { id: crypto.randomUUID(), role: 'user', text, at: new Date().toISOString() }
  saveMessage(thread.id, user)
  broadcast('chat', { kind: 'message', message: user })
  const reply: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', text: '', tools: [], at: new Date().toISOString() }
  broadcast('chat', { kind: 'start', message: reply })
  chatAbort = new AbortController()
  const abort = chatAbort
  const s = getSettings()
  const dir = directionId ? get('directions', directionId) : undefined
  const focus = dir ? `the user is viewing the board filtered to direction group [A${dir.id}] ${dir.name}` : undefined
  const say = (t: string) => {
    reply.text += t
    broadcast('chat', { kind: 'delta', id: reply.id, text: t })
  }
  try {
    const { text: final, error, account } = await withFailover(
      (acc, _retry, onRateLimit) => {
        // A session can only be resumed by the account that created it; otherwise carry the recent chat over.
        const t = currentThread()
        const resume = t.sdk_session && t.sdk_account === acc.id ? t.sdk_session : undefined
        const history = resume ? undefined : threadHistory(thread.id, user.id)
        const q = query({ prompt: text, options: baseOptions({ effort: s.chatEffort, maxTurns: 60, resume, abort, persist: true, account: acc, history, focus }) })
        return consume(q, {
          onInit: (sid) => setThreadSession(thread.id, sid, acc.id),
          onRateLimit,
          onText: say,
          onTool: (id, name, input) => {
            const meta = toolMeta(name, input)
            const tool = { id, name, label: meta.label, module: meta.module, status: 'running' as const }
            reply.tools!.push(tool)
            broadcast('chat', { kind: 'tool', id: reply.id, tool })
            broadcast('pulse', { module: meta.module })
          },
          onToolDone: (id, isError) => {
            const tool = reply.tools!.find((x) => x.id === id)
            if (tool) tool.status = isError ? 'error' : 'done'
            broadcast('chat', { kind: 'tool', id: reply.id, tool })
          },
        })
      },
      (from, to) => say(`${reply.text ? '\n\n' : ''}> ${from.label} hesabının limiti bitdi, **${to.label}** hesabına keçdim.\n\n`),
    )
    if (!reply.text.trim() && final) reply.text = final
    if (error) say(`${reply.text ? '\n\n' : ''}${abort.signal.aborted ? 'Dayandırıldı.' : friendlyError(error, account)}`)
  } catch (e) {
    say(`${reply.text ? '\n\n' : ''}${abort.signal.aborted ? 'Dayandırıldı.' : friendlyError((e as Error).message)}`)
  } finally {
    chatAbort = null
    for (const t of reply.tools ?? []) if (t.status === 'running') t.status = 'done'
    saveMessage(thread.id, reply)
    broadcast('chat', { kind: 'done', message: reply })
  }
}

// ---------- background jobs ----------

const jobs = new Map<string, Job & { abort?: AbortController }>()
const JOB_MODULE: Record<JobKind, ModuleKey> = {
  find_universities: 'universities',
  gap_analysis: 'gaps',
  scout_university: 'researchers',
  verify_deadlines: 'deadlines',
  daily_plan: 'today',
  venue_match: 'publish',
  student_voice: 'insights',
  portal_scan: 'positions',
  direction_fit: 'directions',
  admission_chance: 'universities',
}

export function listJobs(): Job[] {
  return [...jobs.values()]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 20)
    .map(({ abort: _a, ...j }) => j)
}

function publishJob(j: Job) {
  const { abort: _a, ...pub } = j as Job & { abort?: AbortController }
  broadcast('job', pub)
}

export function stopJob(id: string) {
  jobs.get(id)?.abort?.abort()
}

async function buildJobPrompt(kind: JobKind, p: Record<string, unknown>): Promise<{ title: string; prompt: string }> {
  const note = p.note ? `User note: ${String(p.note)}` : ''
  switch (kind) {
    case 'find_universities': {
      const prof = getProfile()
      const directions = prof.directions.length ? prof.directions : list('topics').filter((t) => t.status === 'active').map((t) => t.title)
      if (!directions.length) throw new Error('Profildə ən az bir tədqiqat istiqaməti yaz (məs. NLP)')
      const conds = prof.conditions.map((k) => CONDITION_BY_KEY[k]).filter(Boolean)
      const criteria = [
        `Research directions: ${directions.join('; ')}`,
        `Target countries: ${prof.countries.join(', ') || 'any (suggest a balanced set)'}`,
        `Ranking limit: ${prof.rankingMax ? `${prof.rankingSystem !== 'any' ? prof.rankingSystem : 'QS, THE or ARWU'} top ${prof.rankingMax}` : 'none'}`,
        `Hard conditions: ${conds.length ? conds.map((c) => `\n- [${c.key}] ${c.check}`).join('') : 'none'}`,
        prof.conditionsNote ? `Extra conditions from the user: ${prof.conditionsNote}` : '',
        `Applicant: citizenship ${prof.citizenship || 'unknown'}; education ${prof.education || 'unknown'}; target intake ${prof.targetTerm || 'unknown'}`,
        note,
      ].filter(Boolean)
      return { title: 'Kriteriyalara uyğun universitetlər', prompt: JOB_PROMPTS.find_universities(criteria.join('\n')) }
    }
    case 'gap_analysis': {
      const topics = list('topics')
      const t = (p.topicId ? get('topics', Number(p.topicId)) : undefined) ?? (topics.length === 1 ? topics[0] : undefined)
      if (!t) throw new Error('Mövzu seçilməyib (topicId lazımdır)')
      return { title: `Gap analizi: ${t.title}`, prompt: JOB_PROMPTS.gap_analysis(t.title, t.id, t.keywords.join(', '), `${t.description ?? ''} ${note}`) }
    }
    case 'scout_university': {
      const u = p.universityId ? get('universities', Number(p.universityId)) : undefined
      if (!u) throw new Error('Universitet seçilməyib (universityId lazımdır)')
      let openalexId = u.openalexId
      if (!openalexId) {
        openalexId = (await oa.findInstitutions(u.name, 1).catch(() => []))[0]?.openalexId
        if (openalexId) update('universities', u.id, { openalexId })
      }
      const ids = (p.topicIds as number[] | undefined) ?? list('topics').filter((t) => t.status === 'active').map((t) => t.id)
      let topics = ids.map((id) => get('topics', id)).filter(Boolean).map((t) => `"${t!.title}" (T${t!.id}; keywords: ${t!.keywords.join(', ')})`)
      if (topics.length === 0) topics = getProfile().directions.map((d) => `"${d}" (research direction from the profile)`)
      if (topics.length === 0) throw new Error('Əvvəl mövzu və ya profildə istiqamət əlavə et')
      return { title: `Kəşf: ${u.name}`, prompt: `${JOB_PROMPTS.scout_university(u.name, u.id, openalexId ?? '', topics.join('; '))}\n${note}` }
    }
    case 'verify_deadlines': {
      const u = p.universityId ? get('universities', Number(p.universityId)) : undefined
      const scope = u
        ? `for ${u.name} (U${u.id})`
        : `for all target universities: ${list('universities').map((x) => `${x.name} (U${x.id})`).join(', ') || '(none saved yet - say so and stop)'}`
      return { title: u ? `Deadline yoxlanışı: ${u.name}` : 'Bütün deadline-ların yoxlanışı', prompt: `${JOB_PROMPTS.verify_deadlines(scope)}\n${note}` }
    }
    case 'daily_plan':
      return { title: 'Bugünkü plan', prompt: `${JOB_PROMPTS.daily_plan()}\n${note}` }
    case 'student_voice': {
      const u = p.universityId ? get('universities', Number(p.universityId)) : undefined
      const subject = u?.name ?? String(p.subject ?? p.note ?? '').trim()
      if (!subject) throw new Error('Universitet seçilməyib (universityId və ya ad lazımdır)')
      const prof = getProfile()
      const focus = [
        `The user: field ${prof.field || prof.directions.join(', ') || 'unknown'}; citizenship ${prof.citizenship || 'unknown'}. Give extra weight to what matters for them (their department/field, international students).`,
        u?.city ? `City: ${u.city}.` : '',
        p.note && u ? `User note: ${String(p.note)}` : '',
      ].filter(Boolean).join('\n')
      return { title: `Tələbə səsi: ${subject}`, prompt: JOB_PROMPTS.student_voice(subject, u?.id, focus) }
    }
    case 'direction_fit': {
      const all = list('directions').filter((d) => d.status !== 'dropped')
      const one = p.directionId ? get('directions', Number(p.directionId)) : undefined
      const scope = one ? [one] : all
      if (!scope.length) throw new Error('Əvvəl ən az bir istiqamət qrupu əlavə et')
      const prof = getProfile()
      const groups = scope.map((d) => `[A${d.id}] ${d.name}: ${d.description} (keywords: ${d.keywords.join(', ')}; user interest: ${d.interest ? `${d.interest}/5` : 'not rated'})`).join('\n')
      const others = one ? all.filter((d) => d.id !== one.id).map((d) => `[A${d.id}] ${d.name}`).join(', ') : ''
      const profile = [
        `Field: ${prof.field || '-'}; stage: ${prof.stage || '-'}; target intake: ${prof.targetTerm || '-'}`,
        `Interests: ${prof.interests || '-'}`,
        `Background: ${prof.background || '-'}`,
        `Education: ${prof.education || '-'}; languages: ${prof.languages || '-'}; citizenship: ${prof.citizenship || '-'}`,
        `Target countries: ${prof.countries.join(', ') || 'any'}`,
      ].join('\n')
      return { title: one ? `İstiqamət analizi: ${one.name}` : 'İstiqamətlərin müqayisəsi', prompt: `${JOB_PROMPTS.direction_fit(groups, profile, others)}\n${note}` }
    }
    case 'portal_scan': {
      const prof = getProfile()
      const directions = prof.directions.length ? prof.directions : list('topics').filter((t) => t.status === 'active').map((t) => t.title)
      if (!directions.length) throw new Error('Profildə ən az bir tədqiqat istiqaməti yaz (məs. NLP)')
      const conds = prof.conditions.map((k) => CONDITION_BY_KEY[k]).filter(Boolean)
      const u = p.universityId ? get('universities', Number(p.universityId)) : undefined
      const criteria = [
        `Research directions: ${directions.join('; ')}`,
        `Target countries: ${prof.countries.join(', ') || 'any'}`,
        `Hard conditions: ${conds.length ? conds.map((c) => `\n- [${c.key}] ${c.check}`).join('') : 'none'}`,
        prof.conditionsNote ? `Extra conditions: ${prof.conditionsNote}` : '',
        `Applicant: citizenship ${prof.citizenship || 'unknown'}; education ${prof.education || 'unknown'}; target intake ${prof.targetTerm || 'unknown'}`,
        `Universities already on the board: ${list('universities').map((x) => `${x.name} (U${x.id})`).join(', ') || 'none'}`,
      ].filter(Boolean)
      const focus = [u ? `Focus on positions at ${u.name} (U${u.id}).` : '', note].filter(Boolean).join('\n')
      return { title: u ? `PhD elanları: ${u.name}` : 'PhD portallarında elan axtarışı', prompt: JOB_PROMPTS.portal_scan(criteria.join('\n'), focus) }
    }
    case 'admission_chance': {
      const one = p.universityId ? get('universities', Number(p.universityId)) : undefined
      const unis = one ? [one] : list('universities')
      if (!unis.length) throw new Error('Əvvəl universitet əlavə et')
      const prof = getProfile()
      const scope = unis
        .map((u) => `[U${u.id}] ${u.name} (${u.countryCode || u.country || '?'}) | rank: ${u.rankLabel ?? '?'} | language test: ${u.langCert ?? 'unknown'} | openalex: ${u.openalexId ?? '-'} | researchers on board: ${list('researchers').filter((r) => r.universityId === u.id).length}${u.admitChance !== undefined ? ` | earlier estimate: ${u.admitChance}%` : ''}`)
        .join('\n')
      const conds = prof.conditions.map((k) => CONDITION_BY_KEY[k]?.short ?? k)
      const applicant = [
        `Field: ${prof.field || '-'}; directions: ${prof.directions.join(', ') || '-'}; target intake: ${prof.targetTerm || '-'}`,
        `Education: ${prof.education || '-'}`,
        `Background: ${prof.background || '-'}`,
        `Languages: ${prof.languages || '-'}; citizenship: ${prof.citizenship || '-'}`,
        `Conditions the user needs: ${conds.join(', ') || 'none'}`,
      ].join('\n')
      return { title: one ? `Qəbul şansı: ${one.name}` : 'Qəbul şansının qiymətləndirilməsi', prompt: `${JOB_PROMPTS.admission_chance(scope, applicant)}\n${note}` }
    }
    case 'venue_match': {
      const title = String(p.title ?? '').trim()
      if (!title) throw new Error('Məqalənin başlığı lazımdır')
      return { title: `Jurnal seçimi: ${title.slice(0, 60)}`, prompt: `${JOB_PROMPTS.venue_match(title, String(p.abstract ?? ''))}\n${note}` }
    }
  }
}

export function startJob(kind: JobKind, params: Record<string, unknown>): string {
  const id = crypto.randomUUID().slice(0, 8)
  const job: Job & { abort?: AbortController } = {
    id, kind, title: kind, module: JOB_MODULE[kind], status: 'running', progress: 'Hazırlanır...', startedAt: new Date().toISOString(), abort: new AbortController(),
  }
  jobs.set(id, job)
  publishJob(job)
  void runJob(job, params)
  return id
}

async function runJob(job: Job & { abort?: AbortController }, params: Record<string, unknown>) {
  const s = getSettings()
  try {
    const { title, prompt } = await buildJobPrompt(job.kind as JobKind, params)
    job.title = title
    job.progress = 'Claude işə başladı'
    publishJob(job)
    logActivity('ai', job.module, `Arxa plan işi: ${title}`)
    const effort = job.kind === 'daily_plan' ? 'medium' : s.jobEffort
    const { text, error } = await withFailover(
      (acc, _retry, onRateLimit) => {
        // Job prompts are in English, so the language of what the user reads has to be stated.
        const full = `${prompt}\n\nLanguage: write every summary, note and the final report in Azerbaijani; keep paper titles, venue names and quotes in their original language.`
        const q = query({ prompt: full, options: baseOptions({ effort, maxTurns: 90, abort: job.abort!, persist: false, account: acc }) })
        return consume(q, {
          onRateLimit,
          onTool: (_id, name, input) => {
            const meta = toolMeta(name, input)
            job.progress = meta.label
            publishJob(job)
            broadcast('pulse', { module: meta.module })
          },
        })
      },
      (from, to) => {
        job.progress = `${from.label} limiti bitdi, ${to.label} hesabı ilə yenidən`
        publishJob(job)
      },
    )
    if (error) throw new Error(error)
    job.status = 'done'
    job.progress = 'Bitdi'
    postReport(`**Arxa plan işi bitdi: ${job.title}**\n\n${text}`)
    logActivity('ai', job.module, `Bitdi: ${job.title}`)
  } catch (e) {
    job.status = 'error'
    job.progress = job.abort?.signal.aborted ? 'Dayandırıldı' : friendlyError((e as Error).message).replace(/\*\*/g, '')
    logActivity('system', job.module, `İş alınmadı: ${job.title} - ${job.progress}`)
  } finally {
    job.finishedAt = new Date().toISOString()
    publishJob(job)
  }
}

function postReport(text: string) {
  const thread = currentThread()
  const m: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', text, at: new Date().toISOString() }
  saveMessage(thread.id, m)
  broadcast('chat', { kind: 'message', message: m })
}

setJobStarter(startJob)
