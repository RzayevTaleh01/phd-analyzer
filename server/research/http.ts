import { cacheGet, cacheSet } from '../db'

// Per-host politeness: arXiv asks for one request every 3s, S2 is strict without a key.
const MIN_GAP_MS: Record<string, number> = {
  'export.arxiv.org': 3100,
  'api.semanticscholar.org': 1100,
  'api.openalex.org': 120,
  'api.crossref.org': 200,
}
const lastHit = new Map<string, number>()
const chains = new Map<string, Promise<unknown>>()

function throttle(host: string): Promise<void> {
  const gap = MIN_GAP_MS[host] ?? 0
  const prev = chains.get(host) ?? Promise.resolve()
  const next = prev.then(async () => {
    const wait = (lastHit.get(host) ?? 0) + gap - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastHit.set(host, Date.now())
  })
  chains.set(host, next.catch(() => undefined))
  return next
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

interface FetchOpts {
  headers?: Record<string, string>
  cacheMs?: number
  retries?: number
  timeoutMs?: number
  as?: 'json' | 'text'
}

export async function fetchData<T = unknown>(url: string, opts: FetchOpts = {}): Promise<T> {
  const { headers = {}, cacheMs = 6 * 3600_000, retries = 3, timeoutMs = 30000, as = 'json' } = opts
  const key = url.replace(/([?&])api_key=[^&]+/, '$1')
  if (cacheMs > 0) {
    const hit = cacheGet(key, cacheMs)
    if (hit !== undefined) return (as === 'json' ? JSON.parse(hit) : hit) as T
  }
  const host = new URL(url).host
  let delay = 2000
  for (let attempt = 0; ; attempt++) {
    await throttle(host)
    let res: Response
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': 'TalvisPhD/0.1 (personal research assistant)', ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (e) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delay))
        delay *= 2
        continue
      }
      throw new HttpError(0, `${host}: şəbəkə xətası (${(e as Error).message})`)
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const ra = Number(res.headers.get('retry-after'))
      await new Promise((r) => setTimeout(r, ra > 0 ? ra * 1000 : delay))
      delay *= 2
      continue
    }
    const body = await res.text()
    if (!res.ok) throw new HttpError(res.status, `${host} ${res.status}: ${body.slice(0, 200)}`)
    if (cacheMs > 0) cacheSet(key, body)
    return (as === 'json' ? JSON.parse(body) : body) as T
  }
}
