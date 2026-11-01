// Optional integration with the TRDesk task manager through its agent API: plans, days, tasks, notes.
// Key: TRDesk → Settings → "Claude API (agent)" → "New key" (trd_...); key and the TRDesk address go in Settings.
import { getSettings, list, setSettings, update } from '../db'
import { todayISO } from '../agent/overview'

/** L lesson · R reading · C code · P paper · W writing · Q test · X review · S other */
export const TASK_TYPES = ['L', 'R', 'C', 'P', 'W', 'Q', 'X', 'S'] as const

export interface TrPlanSummary {
  id: string
  title: string
  startDate: string
  archived: boolean
  status?: string
  progress?: { requiredTotal: number; requiredDone: number; percent: number; minutesDone: number; minutesTotal: number }
}

export interface TrTask {
  id: string
  type: string
  text: string
  section: string
  minutes: number
  optional: boolean
  hasContent: boolean
  doneOn: string | null
}

export interface TrDay { id: string; n: number; idx: number; title: string; note: string; tasks: TrTask[] }
export interface TrWeek { id: string; n: number; title: string; goal: string; days: TrDay[] }
export interface TrPlan { id: string; title: string; description: string; startDate: string; color: string; archived: boolean; weeks: TrWeek[] }

export class TrdeskError extends Error {}

function conf() {
  const s = getSettings()
  if (!s.trdeskKey) throw new TrdeskError('TRDesk key missing: Profile → Settings → TRDesk key (trd_...)')
  if (!s.trdeskUrl) throw new TrdeskError('TRDesk URL missing: Profile → Settings → TRDesk URL')
  return { base: s.trdeskUrl.replace(/\/+$/, ''), key: s.trdeskKey }
}

export async function tr<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const { base, key } = conf()
  const res = await fetch(`${base}/api/agent${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  })
  const text = await res.text()
  const data = text ? (() => { try { return JSON.parse(text) } catch { return text } })() : undefined
  if (!res.ok) {
    const msg = typeof data === 'object' && data ? (data as { message?: string | string[] }).message : data
    throw new TrdeskError(`TRDesk ${res.status}: ${Array.isArray(msg) ? msg.join('; ') : String(msg ?? '').slice(0, 300)}`)
  }
  return data as T
}

const enc = encodeURIComponent

/** Date of a plan day (startDate + idx). */
export function dayDate(startDate: string, idx: number): string {
  const [y, m, d] = startDate.split('-').map(Number)
  return todayISO(new Date(y, m - 1, d + idx))
}

export const trdesk = {
  plans: () => tr<TrPlanSummary[]>('GET', `/plans-summary?today=${todayISO()}`),
  plan: (plan: string) => tr<TrPlan>('GET', `/plans/${enc(plan)}`),
  createPlan: (b: { title: string; startDate?: string; description?: string; color?: string }) => tr<{ id: string }>('POST', '/plans', b),
  updatePlan: (plan: string, b: { title?: string; description?: string; startDate?: string; color?: string; archived?: boolean }) => tr('PUT', `/plans/${enc(plan)}`, b),
  deletePlan: (plan: string) => tr('DELETE', `/plans/${enc(plan)}`),
  addTask: (plan: string, b: { text: string; date?: string; type?: string; minutes?: number; optional?: boolean; section?: string; content?: string }) =>
    tr<{ id: string }>('POST', `/plans/${enc(plan)}/tasks`, b),
  task: (plan: string, taskId: string) => tr<Record<string, unknown>>('GET', `/plans/${enc(plan)}/tasks/${enc(taskId)}`),
  updateTask: (plan: string, taskId: string, b: { text?: string; date?: string; type?: string; minutes?: number; optional?: boolean; section?: string; content?: string }) =>
    tr('PUT', `/plans/${enc(plan)}/tasks/${enc(taskId)}`, b),
  deleteTask: (plan: string, taskId: string) => tr('DELETE', `/plans/${enc(plan)}/tasks/${enc(taskId)}`),
  setDone: (plan: string, taskId: string, doneOn: string | null) => tr('PUT', `/plans/${enc(plan)}/tasks/${enc(taskId)}/done`, { doneOn }),
  dayNote: (plan: string, dayId: string, text: string) => tr('PUT', `/plans/${enc(plan)}/days/${enc(dayId)}/note`, { text }),
  agenda: (from: string, to: string) => tr<unknown>('GET', `/agenda?from=${from}&to=${to}`),
}

/** The plan Talvis works in by default (Settings), or the given id/name. */
export function planRef(plan?: string): string {
  const p = plan || getSettings().trdeskPlan
  if (!p) throw new TrdeskError('No TRDesk plan selected: give a plan name or id, or create "PhD plan" with trdesk_sync')
  return p
}

/** Flat list of a plan's tasks with their dates (what Claude and the UI need). */
export function flatTasks(p: TrPlan, o: { from?: string; to?: string; open?: boolean } = {}) {
  const out: (TrTask & { date: string; dayId: string })[] = []
  for (const w of p.weeks)
    for (const d of w.days) {
      const date = dayDate(p.startDate, d.idx)
      if ((o.from && date < o.from) || (o.to && date > o.to)) continue
      for (const t of d.tasks) if (!o.open || !t.doneOn) out.push({ ...t, date, dayId: d.id })
    }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

// ---------- board <-> TRDesk sync ----------

/** Marker kept in the TRDesk task's section, so the same board item is never added twice. */
const marker = (kind: 'D' | 'K', id: number) => `Talvis ${kind}${id}`
const parseMarker = (section: string) => section.match(/Talvis ([DK])(\d+)/)

export interface SyncReport {
  plan: { id: string; title: string; created: boolean }
  added: string[]
  moved: string[]
  doneFromTrdesk: string[]
  doneToTrdesk: string[]
  skipped: string[]
}

/**
 * Makes sure the PhD plan exists, then mirrors the board into it:
 * open deadlines -> a task on the deadline date (type W, section "Talvis D<id>"),
 * open board tasks with a date -> a task on that date (section "Talvis K<id>").
 * Completion flows both ways: done in TRDesk -> done on the board, done on the board -> done in TRDesk.
 */
export async function syncBoard(o: { title?: string } = {}): Promise<SyncReport> {
  const s = getSettings()
  const today = todayISO()
  let created = false
  let ref = s.trdeskPlan
  if (ref) {
    const plans = await trdesk.plans()
    if (!plans.some((p) => p.id === ref || p.title.toLowerCase() === ref.toLowerCase())) ref = ''
  }
  if (!ref) {
    const title = o.title || 'PhD plan'
    const existing = (await trdesk.plans()).find((p) => p.title.toLowerCase() === title.toLowerCase() && !p.archived)
    ref = existing?.id ?? (await trdesk.createPlan({ title, startDate: today, description: 'PhD application plan: deadlines, universities, documents and contact with professors. Managed by Talvis (PhD Analyzer).', color: 'violet' })).id
    created = !existing
    setSettings({ trdeskPlan: ref })
  }
  const plan = await trdesk.plan(ref)
  const rep: SyncReport = { plan: { id: plan.id, title: plan.title, created }, added: [], moved: [], doneFromTrdesk: [], doneToTrdesk: [], skipped: [] }
  const tasks = flatTasks(plan)
  const byMarker = new Map<string, (typeof tasks)[number]>()
  for (const t of tasks) {
    const m = parseMarker(t.section)
    if (m) byMarker.set(`${m[1]}${m[2]}`, t)
  }
  const unis = list('universities')
  const uniName = (id?: number) => (id ? unis.find((u) => u.id === id)?.name : undefined)

  const mirror = async (key: string, item: { title: string; date: string; done: boolean; type: string; minutes: number; content?: string }, markDone: () => void) => {
    const t = byMarker.get(key)
    if (!t) {
      if (item.done) return
      let date = item.date
      let text = item.title
      if (date < plan.startDate) {
        // A passed deadline is history; an unfinished task still has to be done, so it goes on today.
        if (key[0] === 'D') {
          rep.skipped.push(`${key} ${item.title} (${item.date}: already passed)`)
          return
        }
        date = today >= plan.startDate ? today : plan.startDate
        text = `${item.title} (overdue, was due ${item.date})`
      }
      await trdesk.addTask(plan.id, { text, date, type: item.type, minutes: item.minutes, section: marker(key[0] as 'D' | 'K', Number(key.slice(1))), content: item.content })
      rep.added.push(`${key} ${text} (${date})`)
      return
    }
    if (t.doneOn && !item.done) {
      markDone()
      rep.doneFromTrdesk.push(`${key} ${item.title}`)
    } else if (!t.doneOn && item.done) {
      await trdesk.setDone(plan.id, t.id, today)
      rep.doneToTrdesk.push(`${key} ${item.title}`)
    } else if (!t.doneOn && t.date !== item.date && item.date >= plan.startDate) {
      await trdesk.updateTask(plan.id, t.id, { date: item.date })
      rep.moved.push(`${key} ${item.title} -> ${item.date}`)
    }
  }

  for (const d of list('deadlines')) {
    const title = `Deadline: ${d.title}${uniName(d.universityId) ? ` (${uniName(d.universityId)})` : ''}`
    const content = [`**${d.kind}** · ${d.dueDate}${d.dueTime ? ` ${d.dueTime}` : ''}${d.timezone ? ` ${d.timezone}` : ''}`, d.verified ? 'Verified (official source)' : 'Not verified', d.sourceUrl ?? '', d.notes ?? ''].filter(Boolean).join('\n\n')
    await mirror(`D${d.id}`, { title, date: d.dueDate, done: d.status !== 'open', type: 'W', minutes: 0, content }, () => update('deadlines', d.id, { status: 'done' }))
  }
  for (const k of list('tasks')) {
    if (!k.dueDate) continue
    const mins = Number(k.notes?.match(/(\d+)\s*(dəq|dk|min)/i)?.[1] ?? 0)
    await mirror(`K${k.id}`, { title: k.title, date: k.dueDate, done: k.status === 'done', type: k.module === 'papers' ? 'R' : k.module === 'documents' ? 'W' : 'S', minutes: mins, content: k.notes }, () => update('tasks', k.id, { status: 'done' }))
  }
  return rep
}
