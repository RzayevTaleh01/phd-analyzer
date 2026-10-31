// Real browser for JavaScript pages (SPAs, portals that render listings client-side).
// Uses the Edge/Chrome already installed on the computer through playwright-core, so nothing is downloaded.
// No stealth tricks: when a site answers with a bot check, the result says so instead of trying to get around it.
import { chromium, type Browser, type BrowserContext } from 'playwright-core'
import { cacheGet, cacheSet, getSettings, noteUrls } from '../db'

export interface PageLink {
  text: string
  href: string
}

export interface RenderedPage {
  url: string
  finalUrl: string
  status?: number
  title: string
  /** Readable page text (main content first, scripts/menus removed). */
  text: string
  links: PageLink[]
  /** schema.org JSON-LD blocks (JobPosting, Course, EducationalOccupationalProgram, ...). */
  jsonld: unknown[]
  /** Set when the page is a bot check, login wall or error page instead of real content. */
  blocked?: string
  via: 'browser' | 'http' | 'pdf'
}

export interface RenderOpts {
  /** CSS selector to wait for before reading the page. */
  waitFor?: string
  /** Extra wait after load for late JavaScript, ms. */
  waitMs?: number
  /** Scroll down to trigger lazy-loaded lists. */
  scroll?: boolean
  cacheMs?: number
}

const CHANNELS = ['msedge', 'chrome', 'chromium'] as const
let browser: Browser | null = null
let context: BrowserContext | null = null
let launching: Promise<BrowserContext> | null = null
let idleTimer: NodeJS.Timeout | null = null
let active = 0
const queue: (() => void)[] = []
const MAX_PAGES = 3

export class BrowserMissingError extends Error {}

async function launch(): Promise<BrowserContext> {
  const s = getSettings()
  const order = s.browser && s.browser !== 'auto' ? [s.browser] : [...CHANNELS]
  const errors: string[] = []
  for (const ch of order) {
    try {
      // Chromium means Playwright's own build ("npm run browser:install"); the others are the installed browsers.
      browser = await chromium.launch({ channel: ch === 'chromium' ? undefined : ch, headless: !s.browserVisible })
      break
    } catch (e) {
      errors.push(`${ch}: ${(e as Error).message.split('\n')[0]}`)
    }
  }
  if (!browser)
    throw new BrowserMissingError(`Brauzer tapılmadı. Edge və ya Chrome quraşdır, ya da "npm run browser:install" işlət. (${errors.join(' | ')})`)
  browser.on('disconnected', () => {
    browser = null
    context = null
  })
  context = await browser.newContext({ locale: 'en-US', viewport: { width: 1366, height: 900 } })
  // Images, fonts and media are not needed for reading text.
  await context.route('**/*', (route) => {
    const t = route.request().resourceType()
    return t === 'image' || t === 'media' || t === 'font' ? route.abort() : route.continue()
  })
  return context
}

async function getContext(): Promise<BrowserContext> {
  if (context) return context
  launching ??= launch().finally(() => (launching = null))
  return launching
}

function scheduleClose() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => void closeBrowser(), 3 * 60_000)
  idleTimer.unref()
}

export async function closeBrowser() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  const b = browser
  browser = null
  context = null
  await b?.close().catch(() => undefined)
}

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_PAGES) await new Promise<void>((r) => queue.push(r))
  active++
  try {
    return await fn()
  } finally {
    active--
    queue.shift()?.()
  }
}

const BLOCK_PATTERNS: [RegExp, string][] = [
  [/just a moment|checking your browser|verify you are human|cf-chl|attention required|are you a robot|captcha/i, 'bot qoruması (Cloudflare/CAPTCHA)'],
  [/access denied|request blocked|forbidden/i, 'giriş qadağandır (403)'],
  [/enable javascript and cookies/i, 'bot qoruması'],
  [/log ?in to continue|sign in to continue|please log in/i, 'giriş (login) tələb olunur'],
]

export function detectBlock(title: string, text: string, status?: number): string | undefined {
  const head = `${title}\n${text.slice(0, 1500)}`
  for (const [re, why] of BLOCK_PATTERNS) if (re.test(head) && text.length < 4000) return why
  if (status && status >= 400) return `HTTP ${status}`
  return undefined
}

/**
 * Runs inside the page: readable text, links and JSON-LD. Kept as plain JavaScript source so the
 * TypeScript loader cannot add helpers that do not exist in the page.
 * The text walks the DOM instead of using innerText, so content of closed accordions and inactive
 * tabs (where admission rules and deadlines often sit) is included.
 */
const EXTRACT_JS = `(() => {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'IFRAME', 'TEMPLATE', 'NAV', 'FOOTER', 'SELECT', 'OPTION', 'DIALOG'])
  const BLOCK = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'ASIDE', 'HEADER', 'MAIN', 'UL', 'OL', 'LI', 'TABLE', 'TR', 'DL', 'DT', 'DD', 'BR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'FIGCAPTION', 'DETAILS', 'SUMMARY'])
  const junk = (el) => {
    const r = el.getAttribute('role')
    const idc = ((el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : '')).toLowerCase()
    return r === 'navigation' || r === 'dialog' || /cookie|consent|gdpr|newsletter|skip-link|breadcrumb|share/.test(idc)
  }
  const out = []
  const walk = (node) => {
    if (node.nodeType === 3) { out.push(node.nodeValue); return }
    if (node.nodeType !== 1) return
    const el = node
    if (SKIP.has(el.tagName) || junk(el)) return
    const block = BLOCK.has(el.tagName)
    if (block) out.push('\\n')
    if (/^H[1-6]$/.test(el.tagName)) out.push('#'.repeat(Number(el.tagName[1])) + ' ')
    else if (el.tagName === 'LI') out.push('- ')
    else if (el.tagName === 'TD' || el.tagName === 'TH') out.push(' | ')
    if (el.shadowRoot) el.shadowRoot.childNodes.forEach(walk)
    el.childNodes.forEach(walk)
    if (block) out.push('\\n')
  }
  const root = document.querySelector('main, [role=main], article') || document.body
  walk(root)
  let text = out.join('')
  if (text.replace(/\\s+/g, '').length < 200 && root !== document.body) {
    out.length = 0
    walk(document.body)
    text = out.join('')
  }
  text = text.replace(/[ \\t\\u00a0]+/g, ' ').replace(/ *\\n */g, '\\n').replace(/(\\n- )+\\n/g, '\\n').replace(/\\n{3,}/g, '\\n\\n').trim()
  const seen = new Set()
  const links = []
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.href
    if (!/^https?:/.test(href) || seen.has(href)) continue
    const t = (a.textContent || a.getAttribute('aria-label') || a.title || '').replace(/\\s+/g, ' ').trim()
    if (!t) continue
    seen.add(href)
    links.push({ text: t.slice(0, 160), href })
  }
  const jsonld = []
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { jsonld.push(JSON.parse(s.textContent || '')) } catch (e) { /* ignore broken blocks */ }
  }
  return { text, links, jsonld, title: document.title }
})()`

export async function renderPage(url: string, opts: RenderOpts = {}): Promise<RenderedPage> {
  const key = `render:${url}|${opts.waitFor ?? ''}`
  const cacheMs = opts.cacheMs ?? 6 * 3600_000
  if (cacheMs > 0) {
    const hit = cacheGet(key, cacheMs)
    if (hit) return JSON.parse(hit) as RenderedPage
  }
  const out = await slot(async () => {
    const ctx = await getContext()
    const page = await ctx.newPage()
    try {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined)
      if (opts.waitFor) await page.waitForSelector(opts.waitFor, { timeout: 15_000 }).catch(() => undefined)
      if (opts.scroll) {
        for (let i = 0; i < 6; i++) {
          await page.mouse.wheel(0, 2500)
          await page.waitForTimeout(500)
        }
      }
      await page.waitForTimeout(opts.waitMs ?? 1200)
      const data = (await page.evaluate(EXTRACT_JS)) as { text: string; links: PageLink[]; jsonld: unknown[]; title: string }
      const status = res?.status()
      const r: RenderedPage = { url, finalUrl: page.url(), status, title: data.title, text: data.text, links: data.links, jsonld: data.jsonld, via: 'browser' }
      r.blocked = detectBlock(r.title, r.text, status)
      return r
    } finally {
      await page.close().catch(() => undefined)
      scheduleClose()
    }
  })
  if (!out.blocked && cacheMs > 0) cacheSet(key, JSON.stringify(out))
  noteUrls([out.url, out.finalUrl, ...out.links.map((l) => l.href)])
  return out
}

/** Which browser channel can be launched here (for the settings panel and scripts). */
export async function browserStatus(): Promise<{ ok: boolean; channel?: string; version?: string; error?: string }> {
  try {
    await getContext()
    scheduleClose()
    return { ok: true, version: browser?.version(), channel: getSettings().browser }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
