// Several Claude accounts, each in its own Claude config folder. The active one runs chats and
// jobs; when it hits its plan limit, the next ready account takes over (if auto-switch is on).
import fs from 'node:fs'
import path from 'node:path'
import { query, type SDKRateLimitInfo } from '@anthropic-ai/claude-agent-sdk'
import { DATA_DIR, getSettings, kvGet, kvSet, logActivity } from '../db'
import { broadcast } from '../events'

export const AGENT_CWD = path.join(DATA_DIR, 'agent')
fs.mkdirSync(AGENT_CWD, { recursive: true })
const ACCOUNTS_DIR = path.join(DATA_DIR, 'accounts')

export interface Usage {
  fiveHour?: number | null
  fiveHourResetsAt?: string | null
  sevenDay?: number | null
  sevenDayResetsAt?: string | null
}

export interface Account {
  id: string
  label: string
  /** null = the default Claude folder (~/.claude), i.e. the original login. */
  configDir: string | null
  state: 'checking' | 'connected' | 'login_required' | 'error'
  email?: string
  plan?: string
  detail?: string
  limitedUntil?: number
  limitType?: string
  usage?: Usage
  checkedAt?: number
}

/**
 * The Claude Code process runs on the user's own Claude login (subscription), not an API key.
 * Strip inherited Anthropic/Claude variables so a stray key or a parent Claude session
 * does not take over; CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`) is kept.
 */
export function baseEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env }
  for (const k of Object.keys(env)) {
    if (k === 'CLAUDE_CODE_OAUTH_TOKEN' || k === 'CLAUDE_CONFIG_DIR') continue
    if (k.startsWith('ANTHROPIC_') || k.startsWith('CLAUDE')) delete env[k]
  }
  if (process.env.PHD_USE_API_KEY === '1' && process.env.ANTHROPIC_API_KEY) env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  env.CLAUDE_AGENT_SDK_CLIENT_APP = 'talvis-phd/0.1'
  return env
}

// ---------- storage ----------

// Folders are stored as absolute paths; on another machine (or in the cloud) they live under this DATA_DIR.
let accounts: Account[] = kvGet<{ list: Account[] }>('accounts', { list: [] }).list.map((a) => ({
  ...a,
  configDir: a.configDir ? path.join(ACCOUNTS_DIR, a.configDir.split(/[\\/]/).filter(Boolean).pop()!) : null,
  state: 'checking' as const,
}))
if (!accounts.some((a) => a.id === 'main')) accounts.unshift({ id: 'main', label: 'Account 1', configDir: null, state: 'checking' })
let activeId: string = kvGet<{ id: string }>('accounts_active', { id: 'main' }).id
if (!accounts.some((a) => a.id === activeId)) activeId = 'main'

function persist() {
  kvSet('accounts', { list: accounts.map(({ state: _s, detail: _d, ...a }) => a) })
  kvSet('accounts_active', { id: activeId })
  publish()
}

function publish() {
  broadcast('accounts', accountsView())
  broadcast('claude', claudeState())
}

export const publishAccounts = publish

export function accountsView() {
  return { accounts, activeId, autoSwitch: getSettings().autoSwitch }
}

export function getAccount(id: string): Account | undefined {
  return accounts.find((a) => a.id === id)
}

export function activeAccount(): Account {
  return getAccount(activeId) ?? accounts[0]
}

export function envFor(id: string): Record<string, string | undefined> {
  const env = baseEnv()
  const acc = getAccount(id)
  if (acc?.configDir) env.CLAUDE_CONFIG_DIR = acc.configDir
  return env
}

function patch(id: string, p: Partial<Account>) {
  accounts = accounts.map((a) => (a.id === id ? { ...a, ...p } : a))
  persist()
}

export function addAccount(label?: string): Account {
  let n = accounts.length + 1
  while (accounts.some((a) => a.id === `acc-${n}`)) n++
  const id = `acc-${n}`
  const configDir = path.join(ACCOUNTS_DIR, id)
  fs.mkdirSync(configDir, { recursive: true })
  const acc: Account = { id, label: label?.trim() || `Account ${n}`, configDir, state: 'login_required' }
  accounts.push(acc)
  persist()
  return acc
}

export function renameAccount(id: string, label: string) {
  if (label.trim()) patch(id, { label: label.trim() })
}

/** Removes an extra account and its local Claude login folder. The original login is kept. */
export function removeAccount(id: string): boolean {
  const acc = getAccount(id)
  if (!acc || id === 'main') return false
  accounts = accounts.filter((a) => a.id !== id)
  if (activeId === id) activeId = 'main'
  if (acc.configDir && acc.configDir.startsWith(ACCOUNTS_DIR)) fs.rmSync(acc.configDir, { recursive: true, force: true })
  persist()
  return true
}

export function setActive(id: string, reason?: string) {
  if (!getAccount(id) || id === activeId) return
  const from = activeAccount()
  activeId = id
  persist()
  logActivity('system', 'core', reason ?? `Active Claude account: ${from.label} → ${activeAccount().label}`)
}

// ---------- status ----------

export function isReady(a: Account): boolean {
  return a.state === 'connected' && (!a.limitedUntil || a.limitedUntil <= Date.now())
}

/** Compatibility view of the active account for the header/chat status. */
export function claudeState() {
  const a = activeAccount()
  return { state: a.state, email: a.email, plan: a.plan, detail: a.detail, label: a.label, limitedUntil: a.limitedUntil }
}

const checking = new Map<string, Promise<Account>>()

export function checkAccount(id: string): Promise<Account> {
  const running = checking.get(id)
  if (running) return running
  const p = doCheck(id).finally(() => checking.delete(id))
  checking.set(id, p)
  return p
}

async function doCheck(id: string): Promise<Account> {
  const ac = new AbortController()
  // An idle prompt starts the CLI without sending a model request, so this costs nothing.
  async function* idle() {
    await new Promise((r) => ac.signal.addEventListener('abort', r))
  }
  try {
    const q = query({ prompt: idle(), options: { tools: [], settingSources: [], env: envFor(id), persistSession: false, abortController: ac, cwd: AGENT_CWD } })
    const info = await Promise.race([q.accountInfo(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 25000))])
    // Logged-in accounts report email/plan; tokenSource is only present (as "none") when logged out.
    const logged = Boolean(info.email || info.subscriptionType || (info.tokenSource && info.tokenSource !== 'none') || (info.apiKeySource && info.apiKeySource !== 'none'))
    let usage: Usage | undefined
    if (logged) usage = await readUsage(q).catch(() => undefined)
    patch(id, logged
      ? { state: 'connected', email: info.email, plan: info.subscriptionType, detail: undefined, checkedAt: Date.now(), ...(usage ? { usage } : {}) }
      : { state: 'login_required', email: undefined, plan: undefined, checkedAt: Date.now() })
  } catch (e) {
    patch(id, { state: 'error', detail: (e as Error).message, checkedAt: Date.now() })
  } finally {
    ac.abort()
  }
  return getAccount(id)!
}

/** Plan usage windows. The SDK marks this call experimental, so any failure just means "unknown". */
async function readUsage(q: ReturnType<typeof query>): Promise<Usage | undefined> {
  const fn = (q as unknown as Record<string, unknown>).usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET
  if (typeof fn !== 'function') return undefined
  const res = (await Promise.race([
    (fn as (o: { skipBehaviors: boolean }) => Promise<unknown>).call(q, { skipBehaviors: true }),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000)),
  ])) as { rate_limits?: { five_hour?: { utilization: number | null; resets_at: string | null } | null; seven_day?: { utilization: number | null; resets_at: string | null } | null } | null }
  const rl = res?.rate_limits
  if (!rl) return undefined
  return {
    fiveHour: rl.five_hour?.utilization ?? null,
    fiveHourResetsAt: rl.five_hour?.resets_at ?? null,
    sevenDay: rl.seven_day?.utilization ?? null,
    sevenDayResetsAt: rl.seven_day?.resets_at ?? null,
  }
}

export async function checkAll(): Promise<void> {
  await Promise.all(accounts.map((a) => checkAccount(a.id)))
}

// ---------- limits and switching ----------

const toMs = (t: number) => (t < 1e12 ? t * 1000 : t)

export function recordRateLimit(id: string, info: SDKRateLimitInfo) {
  const acc = getAccount(id)
  if (!acc) return
  if (info.status === 'rejected') {
    markLimited(id, info.resetsAt, info.rateLimitType)
    return
  }
  if (typeof info.utilization === 'number' && info.rateLimitType === 'five_hour')
    patch(id, { usage: { ...acc.usage, fiveHour: info.utilization, fiveHourResetsAt: info.resetsAt ? new Date(toMs(info.resetsAt)).toISOString() : acc.usage?.fiveHourResetsAt } })
}

export function markLimited(id: string, resetsAt?: number, type?: string) {
  const until = resetsAt ? toMs(resetsAt) : Date.now() + 60 * 60_000
  patch(id, { limitedUntil: until, limitType: type })
  const acc = getAccount(id)
  logActivity('system', 'core', `${acc?.label ?? id}: Claude limit reached (until ${new Date(until).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })})`)
}

/** The account to use now: the active one if ready, else (auto-switch) the next ready one. */
export async function pickAccount(exclude: Set<string> = new Set()): Promise<Account | undefined> {
  const a = activeAccount()
  if (a.state === 'checking') await checkAccount(a.id)
  if (!exclude.has(a.id) && isReady(activeAccount())) return activeAccount()
  if (!getSettings().autoSwitch) return exclude.has(a.id) ? undefined : activeAccount()
  for (const other of accounts) {
    if (other.id === a.id || exclude.has(other.id)) continue
    if (other.state === 'checking') await checkAccount(other.id)
    const fresh = getAccount(other.id)!
    if (isReady(fresh)) {
      setActive(fresh.id, `Claude account switched: ${a.label} → ${fresh.label}`)
      return fresh
    }
  }
  return exclude.has(a.id) ? undefined : activeAccount()
}

export function limitText(a: Account): string {
  const t = a.limitedUntil ? new Date(a.limitedUntil).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '?'
  return `The Claude limit of ${a.label} is used up (until ${t}).`
}
