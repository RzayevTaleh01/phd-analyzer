// Reddit: what students and PhD candidates say about a university, lab or program.
// With a Reddit "script" app (Settings) the official OAuth API is used (scores, comment counts, full text).
// Without it, the public RSS feeds are used: slower (Reddit allows few requests), no scores.
import { XMLParser } from 'fast-xml-parser'
import { getSettings, noteUrls } from '../db'
import { fetchData, HttpError } from './http'

export interface RedditPost {
  id: string
  subreddit: string
  title: string
  author?: string
  url: string
  created?: string
  score?: number
  comments?: number
  text?: string
  /** Link target for link posts (not the Reddit thread). */
  link?: string
}

export interface RedditComment {
  author?: string
  text: string
  created?: string
  score?: number
  url?: string
  depth?: number
}

export interface SubredditHit {
  name: string
  title: string
  url: string
  subscribers?: number
  description?: string
}

type Sort = 'relevance' | 'top' | 'new' | 'comments'
type Time = 'all' | 'year' | 'month' | 'week'

const UA = 'windows:talvis-phd:0.2 (personal PhD research assistant)'
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', textNodeName: '#text' })

// ---------- text helpers ----------

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const unescape = (s: string) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e] ?? m))

function htmlText(html: string): string {
  let s = unescape(unescape(html))
  const md = s.match(/<div class="md">([\s\S]*?)<\/div>\s*<!-- SC_ON -->/)
  if (md) s = md[1]
  else s = s.replace(/submitted by[\s\S]*$/i, '')
  return s
    .replace(/<(br|\/p|\/li|\/blockquote)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const clip = (s: string | undefined, n: number) => (s && s.length > n ? `${s.slice(0, n)}...` : s)
const full = (permalink: string) => (permalink.startsWith('http') ? permalink : `https://www.reddit.com${permalink}`)
const iso = (sec?: number) => (sec ? new Date(sec * 1000).toISOString().slice(0, 10) : undefined)

// ---------- OAuth API (when credentials are set) ----------

let token: { value: string; until: number } | null = null

async function apiToken(): Promise<string | undefined> {
  const s = getSettings()
  if (!s.redditClientId || !s.redditSecret) return undefined
  if (token && token.until > Date.now() + 60_000) return token.value
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${s.redditClientId}:${s.redditSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new HttpError(res.status, `Reddit OAuth ${res.status}: client id / secret yoxla (reddit.com/prefs/apps)`)
  const j = (await res.json()) as { access_token: string; expires_in: number }
  token = { value: j.access_token, until: Date.now() + j.expires_in * 1000 }
  return token.value
}

async function api<T>(path: string, tok: string): Promise<T> {
  return fetchData<T>(`https://oauth.reddit.com${path}${path.includes('?') ? '&' : '?'}raw_json=1`, {
    headers: { Authorization: `Bearer ${tok}`, 'User-Agent': UA },
    cacheMs: 12 * 3600_000,
  })
}

interface ApiThing<T> { kind: string; data: T }
interface ApiListing<T> { data: { children: ApiThing<T>[] } }
interface ApiPost { id: string; subreddit: string; title: string; author: string; permalink: string; created_utc: number; score: number; num_comments: number; selftext: string; url: string; is_self: boolean }
interface ApiComment { author: string; body: string; created_utc: number; score: number; permalink: string; depth: number; replies?: ApiListing<ApiComment> | '' }

const fromApi = (p: ApiPost, textLen: number): RedditPost => ({
  id: p.id, subreddit: p.subreddit, title: p.title, author: p.author, url: full(p.permalink), created: iso(p.created_utc),
  score: p.score, comments: p.num_comments, text: clip(p.selftext, textLen), link: p.is_self ? undefined : p.url,
})

// ---------- public RSS (no credentials) ----------

interface AtomEntry {
  id: string
  title: string | { '#text': string }
  link: { href: string } | { href: string }[]
  author?: { name: string }
  category?: { term: string }
  content?: string | { '#text': string }
  updated?: string
  published?: string
}

async function rss(path: string): Promise<AtomEntry[]> {
  const body = await fetchData<string>(`https://www.reddit.com${path}`, { as: 'text', cacheMs: 12 * 3600_000, headers: { 'User-Agent': UA }, retries: 2 }).catch((e: Error) => {
    if (e instanceof HttpError && (e.status === 429 || e.status === 403))
      throw new HttpError(e.status, `Reddit sorğunu məhdudlaşdırdı (${e.status}). Bir az sonra yenidən yoxla, ya da Ayarlarda Reddit app açarlarını yaz (daha çox limit).`)
    throw e
  })
  const doc = xml.parse(body) as { feed?: { entry?: AtomEntry | AtomEntry[] } }
  const e = doc.feed?.entry
  return e ? (Array.isArray(e) ? e : [e]) : []
}

const txt = (v: AtomEntry['title'] | AtomEntry['content']) => (typeof v === 'string' ? v : v?.['#text'] ?? '')
const href = (l: AtomEntry['link']) => (Array.isArray(l) ? l[0]?.href : l?.href) ?? ''

function fromEntry(e: AtomEntry, textLen: number): RedditPost {
  const html = unescape(txt(e.content))
  const link = html.match(/<a href="([^"]+)">\[link\]<\/a>/)?.[1]
  const url = href(e.link)
  return {
    id: e.id.replace(/^t3_/, ''),
    subreddit: e.category?.term ?? url.match(/\/r\/([^/]+)/)?.[1] ?? '',
    title: unescape(txt(e.title)),
    author: e.author?.name?.replace(/^\/u\//, ''),
    url,
    created: (e.published ?? e.updated)?.slice(0, 10),
    text: clip(htmlText(txt(e.content)), textLen) || undefined,
    link: link && !link.includes('reddit.com') ? link : undefined,
  }
}

// ---------- public functions ----------

export async function redditSearch(o: { query: string; subreddit?: string; sort?: Sort; time?: Time; limit?: number; textLen?: number }): Promise<{ posts: RedditPost[]; via: 'api' | 'rss' }> {
  const sort = o.sort ?? 'relevance'
  const time = o.time ?? 'all'
  const limit = Math.min(o.limit ?? 25, 100)
  const textLen = o.textLen ?? 500
  const sub = o.subreddit?.replace(/^\/?r\//, '')
  const qs = `q=${encodeURIComponent(o.query)}&sort=${sort}&t=${time}&limit=${limit}${sub ? '&restrict_sr=1' : ''}`
  const base = sub ? `/r/${sub}/search` : '/search'
  const tok = await apiToken()
  let out: { posts: RedditPost[]; via: 'api' | 'rss' }
  if (tok) {
    const j = await api<ApiListing<ApiPost>>(`${base}?${qs}&type=link`, tok)
    out = { posts: j.data.children.filter((c) => c.kind === 't3').map((c) => fromApi(c.data, textLen)), via: 'api' }
  } else {
    const entries = await rss(`${base}.rss?${qs}${sub ? '' : '&type=link'}`)
    out = { posts: entries.filter((e) => String(e.id).startsWith('t3_')).map((e) => fromEntry(e, textLen)), via: 'rss' }
  }
  noteUrls(out.posts.map((p) => p.url))
  return out
}

/** A thread with its top comments. Accepts a full reddit URL or a post id. */
export async function redditThread(ref: string, limit = 40): Promise<{ post?: RedditPost; comments: RedditComment[]; via: 'api' | 'rss' }> {
  const id = ref.match(/comments\/([a-z0-9]+)/i)?.[1] ?? ref.replace(/^t3_/, '')
  const tok = await apiToken()
  let out: { post?: RedditPost; comments: RedditComment[]; via: 'api' | 'rss' }
  if (tok) {
    const [postL, comL] = await api<[ApiListing<ApiPost>, ApiListing<ApiComment>]>(`/comments/${id}?sort=top&limit=${limit}&depth=3`, tok)
    const comments: RedditComment[] = []
    const walk = (l: ApiListing<ApiComment> | '' | undefined) => {
      if (!l) return
      for (const c of l.data.children) {
        if (c.kind !== 't1' || comments.length >= limit) continue
        comments.push({ author: c.data.author, text: clip(c.data.body, 1200)!, created: iso(c.data.created_utc), score: c.data.score, url: full(c.data.permalink), depth: c.data.depth })
        walk(c.data.replies)
      }
    }
    walk(comL)
    const p = postL.data.children[0]?.data
    out = { post: p ? fromApi(p, 4000) : undefined, comments, via: 'api' }
  } else {
    const entries = await rss(`/comments/${id}/.rss?sort=top&limit=${limit}`)
    const postEntry = entries.find((e) => String(e.id).startsWith('t3_'))
    out = {
      post: postEntry ? fromEntry(postEntry, 4000) : undefined,
      comments: entries
        .filter((e) => String(e.id).startsWith('t1_'))
        .slice(0, limit)
        .map((e) => ({ author: e.author?.name?.replace(/^\/u\//, ''), text: clip(htmlText(txt(e.content)), 1200) ?? '', created: e.updated?.slice(0, 10), url: href(e.link) })),
      via: 'rss',
    }
  }
  noteUrls([...(out.post ? [out.post.url] : []), ...out.comments.map((c) => c.url ?? '')])
  return out
}

export async function findSubreddits(query: string, limit = 8): Promise<SubredditHit[]> {
  const tok = await apiToken()
  let out: SubredditHit[]
  if (tok) {
    const j = await api<ApiListing<{ display_name: string; title: string; url: string; subscribers: number; public_description: string }>>(
      `/subreddits/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      tok,
    )
    out = j.data.children.map(({ data: d }) => ({ name: d.display_name, title: d.title, url: full(d.url), subscribers: d.subscribers, description: clip(d.public_description, 200) }))
  } else {
    const entries = await rss(`/subreddits/search.rss?q=${encodeURIComponent(query)}&limit=${limit}`)
    out = entries.map((e) => {
      const url = href(e.link)
      return { name: url.match(/\/r\/([^/]+)/)?.[1] ?? '', title: unescape(txt(e.title)), url, description: clip(htmlText(txt(e.content)), 200) }
    })
  }
  noteUrls(out.map((s) => s.url))
  return out
}

/** Subreddits where PhD applicants and students talk about universities. */
export const ACADEMIC_SUBS = ['PhD', 'gradadmissions', 'AskAcademia', 'GradSchool', 'academia', 'phdstudents']
