// Accounts: register, sign in, sign out. Each account has its own board (see ctx.ts and db.ts).
// Anyone who can open the app can create an account; the first account is the admin.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import type { Profile } from '../shared/types'
import { CONDITION_BY_KEY, RANKING_LIMITS, RANKING_SYSTEMS } from '../shared/criteria'
import { runAs, uid } from './ctx'
import { createUser, getUser, kvGet, kvSet, normEmail, publicUser, setProfile, setUserPassword, userByEmail, userCount, type User } from './db'
import { activeAccount, isReady } from './agent/accounts'
import { startJob } from './agent/runner'

const COOKIE = 'talvis_session'
const MAX_AGE = 30 * 24 * 3600

/** Signs session cookies. SESSION_SECRET if set, else a random secret kept in the database (so it survives restarts). */
function secret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET
  const cur = kvGet<{ s: string }>('session_secret', { s: '' }).s
  if (cur) return cur
  const s = randomBytes(32).toString('hex')
  kvSet('session_secret', { s })
  return s
}

const hashOf = (pw: string, salt: string) => scryptSync(pw, salt, 32).toString('hex')

function same(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

// The signature covers part of the password hash: changing the password signs out the other devices.
const sign = (u: User, exp: number) => createHmac('sha256', secret()).update(`${u.id}.${exp}.${u.hash.slice(0, 16)}`).digest('hex')

function cookieOf(req: Request): string | undefined {
  return req.headers.cookie?.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
}

/** The account a request's session cookie belongs to, if the cookie is valid and not expired. */
export function sessionUser(req: Request): User | undefined {
  const [id, exp, sig] = (cookieOf(req) ?? '').split('.')
  if (!id || !exp || !sig || Number(exp) < Date.now() / 1000) return undefined
  const u = getUser(Number(id))
  return u && same(sig, sign(u, Number(exp))) ? u : undefined
}

function startSession(req: Request, res: Response, u: User) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https'
  res.setHeader('Set-Cookie', `${COOKIE}=${u.id}.${exp}.${sign(u, exp)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure ? '; Secure' : ''}`)
}

function newHash(pw: string) {
  const salt = randomBytes(16).toString('hex')
  return { salt, hash: hashOf(pw, salt) }
}

// Slow down password guessing: 8 failed tries per 10 minutes per address.
const tries = new Map<string, { n: number; until: number }>()
function tooMany(req: Request) {
  const t = tries.get(req.ip ?? 'unknown')
  return Boolean(t && t.until > Date.now() && t.n >= 8)
}
function failed(req: Request) {
  const ip = req.ip ?? 'unknown'
  const t = tries.get(ip)
  tries.set(ip, { n: (t && t.until > Date.now() ? t.n : 0) + 1, until: Date.now() + 10 * 60_000 })
}

/** GET /api/auth: who is signed in, and what the sign-in page needs to know. */
export function authInfo(req: Request, res: Response) {
  const u = sessionUser(req)
  res.json({ user: u ? publicUser(u) : null, hasUsers: userCount() > 0 })
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const strs = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x, 120)).filter(Boolean).slice(0, 30) : [])

/** POST /api/auth/register: account, plus the research interests that start the board. */
export function register(req: Request, res: Response) {
  if (tooMany(req)) return res.status(429).json({ error: 'Too many attempts, try again in 10 minutes' })
  const b = (req.body ?? {}) as Record<string, unknown>
  const name = str(b.name, 80)
  const email = normEmail(str(b.email, 200))
  const password = typeof b.password === 'string' ? b.password : ''
  if (!name) return res.status(400).json({ error: 'Enter your name' })
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address' })
  if (password.length < 6) return res.status(400).json({ error: 'Use a password of at least 6 characters' })
  if (userByEmail(email)) return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' })

  const user = createUser({ email, name, ...newHash(password) })
  const p = (b.profile ?? {}) as Record<string, unknown>
  const directions = strs(p.directions)
  runAs(user.id, () => {
    // Only what was filled in: the first account may already have a profile from before accounts.
    const patch: Partial<Profile> = { name }
    const field = str(p.field)
    const stage = str(p.stage)
    const targetTerm = str(p.targetTerm)
    const countries = strs(p.countries)
    const interests = str(p.interests, 2000)
    if (field) patch.field = field
    if (stage) patch.stage = stage
    if (targetTerm) patch.targetTerm = targetTerm
    if (countries.length) patch.countries = countries
    if (directions.length) patch.directions = directions
    if (interests || directions.length) patch.interests = interests || directions.join(', ')
    // Targets and background from the later register steps; only known values are kept.
    const rankingSystem = str(p.rankingSystem)
    const rankingMax = Number(p.rankingMax)
    if ((RANKING_SYSTEMS as readonly string[]).includes(rankingSystem)) patch.rankingSystem = rankingSystem
    if ((RANKING_LIMITS as readonly number[]).includes(rankingMax)) patch.rankingMax = rankingMax
    const conditions = strs(p.conditions).filter((k) => CONDITION_BY_KEY[k])
    if (conditions.length) patch.conditions = conditions
    for (const k of ['citizenship', 'education', 'languages'] as const) {
      const v = str(p[k], 300)
      if (v) patch[k] = v
    }
    setProfile(patch)
    // With Claude ready, Talvis groups the interests into directions right away (as the welcome page would).
    if (directions.length && isReady(activeAccount())) startJob('setup_directions', {})
  })
  startSession(req, res, user)
  return res.json({ user: publicUser(user) })
}

/** POST /api/auth/login */
export function login(req: Request, res: Response) {
  if (tooMany(req)) return res.status(429).json({ error: 'Too many attempts, try again in 10 minutes' })
  const u = userByEmail(str(req.body?.email))
  const pw = typeof req.body?.password === 'string' ? req.body.password : ''
  if (!u || !same(hashOf(pw, u.salt), u.hash)) {
    failed(req)
    return res.status(401).json({ error: 'Wrong email or password' })
  }
  tries.delete(req.ip ?? 'unknown')
  startSession(req, res, u)
  return res.json({ user: publicUser(u) })
}

/** POST /api/auth/logout */
export function logout(_req: Request, res: Response) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
  res.json({ ok: true })
}

/** POST /api/auth/password { current, next }: this device stays signed in, the others are signed out. */
export function changePassword(req: Request, res: Response) {
  const u = sessionUser(req)
  if (!u) return res.status(401).json({ error: 'auth' })
  const current = typeof req.body?.current === 'string' ? req.body.current : ''
  const next = typeof req.body?.next === 'string' ? req.body.next : ''
  if (!same(hashOf(current, u.salt), u.hash)) return res.status(403).json({ error: 'The current password is wrong' })
  if (next.length < 6) return res.status(400).json({ error: 'Use a password of at least 6 characters' })
  const h = newHash(next)
  setUserPassword(u.id, h.salt, h.hash)
  startSession(req, res, getUser(u.id)!)
  return res.json({ ok: true })
}

/** Every /api route except /api/auth* needs a signed-in account, and then runs as that account. */
export function guard(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith('/api/') || req.path.startsWith('/api/auth')) return next()
  const u = sessionUser(req)
  if (!u) return res.status(401).json({ error: 'auth' })
  return runAs(u.id, () => next())
}

/** Server-wide configuration (settings, Claude accounts) is the admin's. */
export function adminOnly(_req: Request, res: Response, next: NextFunction) {
  if (getUser(uid())?.admin) return next()
  return res.status(403).json({ error: 'Only the admin account can change this' })
}
