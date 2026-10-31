// Password login for a deployed Talvis (set APP_PASSWORD). Locally, without it, nothing changes.
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

const COOKIE = 'talvis_auth'
const MAX_AGE = 30 * 24 * 3600

export const authRequired = () => Boolean(process.env.APP_PASSWORD)

/** The cookie value: derived from the password, so changing the password signs everyone out. */
const token = () => createHmac('sha256', process.env.APP_PASSWORD!).update('talvis-session-v1').digest('hex')

function same(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

function cookieOf(req: Request): string | undefined {
  return req.headers.cookie?.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
}

export const isAuthed = (req: Request) => !authRequired() || same(cookieOf(req) ?? '', token())

// Slow down password guessing: 8 tries per 10 minutes per address.
const tries = new Map<string, { n: number; until: number }>()

export function login(req: Request, res: Response) {
  if (!authRequired()) return res.json({ ok: true })
  const ip = req.ip ?? 'unknown'
  const t = tries.get(ip)
  if (t && t.until > Date.now() && t.n >= 8) return res.status(429).json({ error: 'Çox cəhd oldu, 10 dəqiqə sonra yenidən yoxla' })
  if (!same(String(req.body?.password ?? ''), process.env.APP_PASSWORD!)) {
    tries.set(ip, { n: (t && t.until > Date.now() ? t.n : 0) + 1, until: Date.now() + 10 * 60_000 })
    return res.status(401).json({ error: 'Parol səhvdir' })
  }
  tries.delete(ip)
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https'
  res.setHeader('Set-Cookie', `${COOKIE}=${token()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure ? '; Secure' : ''}`)
  return res.json({ ok: true })
}

export function logout(_req: Request, res: Response) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
  res.json({ ok: true })
}

/** Every /api route except /api/auth* needs the cookie. */
export function guard(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith('/api/') || req.path.startsWith('/api/auth')) return next()
  if (isAuthed(req)) return next()
  res.status(401).json({ error: 'auth' })
}
