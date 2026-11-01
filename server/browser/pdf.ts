// PDFs on the web (papers, admission regulations, call documents): download and extract text per page.
// Text layer only: a scanned PDF without one is reported as such (no OCR).
import { extractText, getDocumentProxy, getMeta } from 'unpdf'
import { cacheGet, cacheSet, get, noteUrls } from '../db'
import * as oa from '../research/openalex'

export interface PdfDoc {
  url: string
  title?: string
  author?: string
  pages: number
  /** Text of each page (index 0 = page 1). */
  text: string[]
  /** True when the PDF has (almost) no text layer, e.g. a scan. */
  scanned: boolean
}

const MAX_BYTES = 40 * 1024 * 1024
const UA = 'TalvisPhD/0.2 (personal research assistant)'

export class PdfError extends Error {}

const isPdf = (buf: Uint8Array) => buf.length > 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 // %PDF

/** A landing page often points at its PDF (Google Scholar meta tags used by most publishers and repositories). */
function pdfLinkIn(html: string, base: string): string | undefined {
  const meta = html.match(/<meta[^>]+name=["']citation_pdf_url["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']citation_pdf_url["']/i)?.[1]
  const link = meta ?? html.match(/<a[^>]+href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/i)?.[1]
  if (!link) return undefined
  try {
    return new URL(link.replace(/&amp;/g, '&'), base).href
  } catch {
    return undefined
  }
}

async function download(url: string, hops = 0): Promise<{ url: string; data: Uint8Array }> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/pdf,text/html;q=0.8,*/*;q=0.5' }, redirect: 'follow', signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new PdfError(`${new URL(url).host}: HTTP ${res.status}${res.status === 403 ? ' (the site blocks downloads)' : ''}`)
  const len = Number(res.headers.get('content-length') ?? 0)
  if (len > MAX_BYTES) throw new PdfError(`PDF is too large (${Math.round(len / 1e6)} MB, limit 40 MB)`)
  const data = new Uint8Array(await res.arrayBuffer())
  if (data.length > MAX_BYTES) throw new PdfError('PDF is too large (limit 40 MB)')
  if (isPdf(data)) return { url: res.url || url, data }
  // Not a PDF: a landing page. Follow its PDF link once or twice.
  const type = res.headers.get('content-type') ?? ''
  if (/html/i.test(type) && hops < 2) {
    const next = pdfLinkIn(new TextDecoder().decode(data), res.url || url)
    if (next && next !== url) return download(next, hops + 1)
  }
  throw new PdfError(`${new URL(url).host}: this link is not a PDF (${type || 'unknown type'}) and no PDF link was found on the page`)
}

export async function readPdf(url: string): Promise<PdfDoc> {
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  const key = `pdf:${url}`
  const hit = cacheGet(key, 30 * 24 * 3600_000)
  if (hit) return JSON.parse(hit) as PdfDoc
  const { url: finalUrl, data } = await download(url)
  const pdf = await getDocumentProxy(data)
  const [{ text, totalPages }, meta] = await Promise.all([extractText(pdf, { mergePages: false }), getMeta(pdf).catch(() => ({ info: {} as Record<string, unknown> }))])
  const pages = (text as string[]).map((t) => t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim())
  const chars = pages.reduce((n, t) => n + t.length, 0)
  const info = (meta.info ?? {}) as Record<string, unknown>
  const doc: PdfDoc = {
    url: finalUrl,
    title: typeof info.Title === 'string' && info.Title.trim() ? info.Title.trim() : undefined,
    author: typeof info.Author === 'string' && info.Author.trim() ? info.Author.trim() : undefined,
    pages: totalPages,
    text: pages,
    scanned: chars < totalPages * 80,
  }
  cacheSet(key, JSON.stringify(doc))
  noteUrls([url, finalUrl])
  return doc
}

/** Open-access PDF candidates for a library paper: its own pdfUrl, arXiv, then every OpenAlex location. */
export async function paperPdfCandidates(paperId: number): Promise<{ title: string; urls: string[] }> {
  const p = get('papers', paperId)
  if (!p) throw new PdfError(`P${paperId} is not in the library`)
  const urls: string[] = []
  if (p.pdfUrl) urls.push(p.pdfUrl)
  if (p.arxivId) urls.push(`https://arxiv.org/pdf/${p.arxivId}`)
  const ref = p.openalexId ?? p.doi
  if (ref) {
    const w = await oa.workLocations(ref).catch(() => [])
    urls.push(...w)
  }
  if (p.doi) urls.push(`https://doi.org/${p.doi}`)
  if (p.url) urls.push(p.url)
  return { title: p.title, urls: [...new Set(urls)] }
}

/** Page range like "1-3,7" -> zero-based indexes within the document. */
export function pageIndexes(spec: string | undefined, total: number): number[] {
  if (!spec) return Array.from({ length: total }, (_, i) => i)
  const out = new Set<number>()
  for (const part of spec.split(',')) {
    const [a, b] = part.split('-').map((x) => Number(x.trim()))
    if (!a) continue
    for (let i = a; i <= (b || a); i++) if (i >= 1 && i <= total) out.add(i - 1)
  }
  return [...out].sort((x, y) => x - y)
}

/** Paragraphs that contain any of the words, with their page number. */
export function findInPdf(doc: PdfDoc, words: string, pages?: number[]) {
  const ws = words.toLowerCase().split(/\s+/).filter(Boolean)
  const hits: { page: number; text: string }[] = []
  for (const i of pages ?? doc.text.map((_, k) => k)) {
    const paras = doc.text[i].split(/\n\s*\n|(?<=[.!?])\n/)
    for (const para of paras) if (ws.some((w) => para.toLowerCase().includes(w))) hits.push({ page: i + 1, text: para.replace(/\s+/g, ' ').trim().slice(0, 900) })
  }
  return hits
}
