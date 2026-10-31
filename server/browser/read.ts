// Read any web page: a plain HTTP request first (fast), the real browser when the page needs JavaScript.
import { cacheGet, cacheSet, noteUrls } from '../db'
import { readPdf } from './pdf'
import { detectBlock, renderPage, type PageLink, type RenderedPage, type RenderOpts } from './render'

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', hellip: '...' }
const decode = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m,
  )

/** Small HTML to text conversion for server-rendered pages (no DOM needed). */
export function htmlToPage(html: string, baseUrl: string): Omit<RenderedPage, 'url' | 'finalUrl' | 'status' | 'via'> {
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '')
  const jsonld: unknown[] = []
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      jsonld.push(JSON.parse(m[1]))
    } catch {
      /* ignore broken blocks */
    }
  }
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html.match(/<body[\s\S]*<\/body>/i)?.[0] ?? html
  const links: PageLink[] = []
  const seen = new Set<string>()
  for (const m of main.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let href: string
    try {
      href = new URL(decode(m[1]), baseUrl).href
    } catch {
      continue
    }
    const text = decode(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
    if (!text || !/^https?:/.test(href) || seen.has(href)) continue
    seen.add(href)
    links.push({ text: text.slice(0, 160), href })
  }
  const text = decode(
    main
      .replace(/<(script|style|noscript|svg|nav|footer|template)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article|\/dd|\/dt)[^>]*>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<h([1-6])[^>]*>/gi, (_m, n: string) => `\n${'#'.repeat(Number(n))} `)
      .replace(/<(td|th)[^>]*>/gi, ' | ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { title, text, links, jsonld }
}

/** Signs that the HTML is only a JavaScript shell and the content is drawn in the browser. */
function needsBrowser(html: string, text: string): boolean {
  if (text.length < 600) return true
  if (/<div id="(root|app|__next|__nuxt)"[^>]*>\s*<\/div>/i.test(html)) return true
  if (/(enable|turn on) javascript/i.test(text.slice(0, 2000)) && text.length < 3000) return true
  return false
}

export interface ReadOpts extends RenderOpts {
  /** auto: HTTP first, browser if needed. browser: always render. http: never render. */
  mode?: 'auto' | 'browser' | 'http'
}

export async function readPage(url: string, opts: ReadOpts = {}): Promise<RenderedPage> {
  const mode = opts.mode ?? 'auto'
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  if (/\.pdf(\?|#|$)/i.test(url)) return pdfAsPage(url)
  if (mode !== 'browser') {
    const plain = await plainFetch(url, opts.cacheMs).catch((e: Error) => ({ error: e.message }))
    if ('page' in plain) {
      const p = plain.page
      if (p.via === 'pdf' || mode === 'http' || (!p.blocked && !needsBrowser(plain.html, p.text))) return p
    } else if (mode === 'http') throw new Error(plain.error)
  }
  return renderPage(url, opts)
}

async function plainFetch(url: string, cacheMs = 6 * 3600_000): Promise<{ page: RenderedPage; html: string }> {
  const key = `http:${url}`
  let html = cacheMs > 0 ? cacheGet(key, cacheMs) : undefined
  let status = 200
  let finalUrl = url
  if (html === undefined) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'TalvisPhD/0.2 (personal research assistant)', Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.8' },
      redirect: 'follow',
      signal: AbortSignal.timeout(25_000),
    })
    status = res.status
    finalUrl = res.url || url
    const type = res.headers.get('content-type') ?? ''
    if (/pdf/i.test(type)) {
      void res.body?.cancel()
      return { page: await pdfAsPage(finalUrl), html: '' }
    }
    if (!/html|xml|text/i.test(type)) throw new Error(`${type || 'unknown'} content (not a web page)`)
    html = await res.text()
    if (res.ok && cacheMs > 0) cacheSet(key, html)
  }
  const parsed = htmlToPage(html, finalUrl)
  const page: RenderedPage = { url, finalUrl, status, ...parsed, via: 'http' }
  page.blocked = detectBlock(page.title, page.text, status)
  noteUrls([url, finalUrl, ...page.links.map((l) => l.href)])
  return { page, html }
}

/** A PDF as a page: the text of every page, marked with its page number. */
export async function pdfAsPage(url: string): Promise<RenderedPage> {
  const d = await readPdf(url)
  const text = d.text.map((t, i) => `--- səhifə ${i + 1} ---\n${t}`).join('\n\n')
  return {
    url,
    finalUrl: d.url,
    status: 200,
    title: d.title ?? d.url.split('/').pop() ?? 'PDF',
    text: d.scanned ? `(PDF skan edilib: mətn qatı yoxdur və ya çox azdır, ${d.pages} səhifə)\n${text}` : text,
    links: [],
    jsonld: [],
    via: 'pdf',
  }
}

/** Compact JSON-LD: keep the schema.org objects that matter for PhD search, drop page chrome. */
export function usefulJsonLd(blocks: unknown[]): unknown[] {
  const out: unknown[] = []
  const walk = (x: unknown) => {
    if (Array.isArray(x)) return x.forEach(walk)
    if (!x || typeof x !== 'object') return
    const o = x as Record<string, unknown>
    if (o['@graph']) return walk(o['@graph'])
    const t = String(o['@type'] ?? '')
    if (/JobPosting|Course|EducationalOccupationalProgram|CollegeOrUniversity|Event|ScholarlyArticle|Dataset|ItemList|FAQPage/i.test(t)) out.push(o)
  }
  blocks.forEach(walk)
  return out.slice(0, 10)
}
