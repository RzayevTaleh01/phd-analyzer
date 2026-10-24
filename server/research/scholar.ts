import { XMLParser } from 'fast-xml-parser'
import { getSettings } from '../db'
import { fetchData } from './http'
import type { WorkHit } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------- Semantic Scholar ----------

const S2 = 'https://api.semanticscholar.org/graph/v1'
const S2_FIELDS = 'paperId,title,year,venue,citationCount,authors,externalIds,abstract,tldr,url,openAccessPdf'

function s2Headers(): Record<string, string> {
  const key = getSettings().s2Key
  return key ? { 'x-api-key': key } : {}
}

function fromS2(p: any): WorkHit {
  return {
    source: 's2',
    s2Id: p.paperId,
    doi: p.externalIds?.DOI ?? undefined,
    arxivId: p.externalIds?.ArXiv ?? undefined,
    title: p.title ?? '(adsız)',
    year: p.year ?? undefined,
    venue: p.venue || undefined,
    authors: (p.authors ?? []).map((a: any) => a.name),
    citedBy: p.citationCount ?? 0,
    abstract: p.abstract ?? undefined,
    tldr: p.tldr?.text ?? undefined,
    url: p.url ?? undefined,
    pdfUrl: p.openAccessPdf?.url || undefined,
  }
}

export async function s2Search(query: string, opts: { fromYear?: number; toYear?: number; limit?: number } = {}): Promise<WorkHit[]> {
  const year = opts.fromYear || opts.toYear ? `&year=${opts.fromYear ?? ''}-${opts.toYear ?? ''}` : ''
  const data = await fetchData<any>(
    `${S2}/paper/search?query=${encodeURIComponent(query)}&limit=${Math.min(opts.limit ?? 15, 50)}&fields=${S2_FIELDS}${year}`,
    { headers: s2Headers(), retries: 4 },
  )
  return (data.data ?? []).map(fromS2)
}

/** Accepts an S2 paper id or prefixed ids such as "DOI:10.x/y" or "ARXIV:2401.00001". */
export async function s2Paper(id: string): Promise<WorkHit | undefined> {
  try {
    const p = await fetchData<any>(`${S2}/paper/${encodeURIComponent(id)}?fields=${S2_FIELDS}`, { headers: s2Headers(), retries: 4, cacheMs: 24 * 3600_000 })
    return fromS2(p)
  } catch {
    return undefined
  }
}

export async function s2Recommend(paperId: string, limit = 10): Promise<WorkHit[]> {
  const data = await fetchData<any>(
    `https://api.semanticscholar.org/recommendations/v1/papers/forpaper/${encodeURIComponent(paperId)}?limit=${limit}&fields=${S2_FIELDS}`,
    { headers: s2Headers(), retries: 4 },
  )
  return (data.recommendedPapers ?? []).map(fromS2)
}

// ---------- arXiv ----------

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' })

// arXiv throttles aggressively; after a failure skip it for a while so callers fall back fast.
let arxivDownUntil = 0

async function arxivFetch(url: string, cacheMs?: number): Promise<string> {
  if (Date.now() < arxivDownUntil) throw new Error('arXiv API temporarily unavailable')
  try {
    return await fetchData<string>(url, { as: 'text', retries: 1, timeoutMs: 12000, cacheMs })
  } catch (e) {
    arxivDownUntil = Date.now() + 30 * 60_000
    throw e
  }
}

export async function arxivSearch(query: string, opts: { limit?: number; sort?: 'recent' | 'relevance'; category?: string } = {}): Promise<WorkHit[]> {
  const terms = query.replace(/["()]/g, ' ').split(/\s+/).filter((t) => t.length > 1)
  let sq = terms.map((t) => `all:${encodeURIComponent(t)}`).join('+AND+')
  if (opts.category) sq = `(${sq})+AND+cat:${opts.category}`
  const sortBy = opts.sort === 'relevance' ? 'relevance' : 'submittedDate'
  const body = await arxivFetch(`https://export.arxiv.org/api/query?search_query=${sq}&max_results=${Math.min(opts.limit ?? 15, 50)}&sortBy=${sortBy}&sortOrder=descending`)
  return parseArxiv(body)
}

export async function arxivById(id: string): Promise<WorkHit | undefined> {
  const body = await arxivFetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id.replace(/^arxiv:/i, ''))}`, 7 * 24 * 3600_000)
  return parseArxiv(body)[0]
}

function parseArxiv(body: string): WorkHit[] {
  const feed = xml.parse(body)?.feed
  const entries = feed?.entry ? (Array.isArray(feed.entry) ? feed.entry : [feed.entry]) : []
  return entries.map((e: any): WorkHit => {
    const id = String(e.id ?? '').replace(/^https?:\/\/arxiv\.org\/abs\//, '').replace(/v\d+$/, '')
    const authors = Array.isArray(e.author) ? e.author : e.author ? [e.author] : []
    const links = Array.isArray(e.link) ? e.link : e.link ? [e.link] : []
    return {
      source: 'arxiv',
      arxivId: id,
      doi: e['arxiv:doi']?.['#text'] ?? e['arxiv:doi'] ?? undefined,
      title: String(e.title ?? '').replace(/\s+/g, ' ').trim(),
      year: e.published ? Number(String(e.published).slice(0, 4)) : undefined,
      venue: 'arXiv',
      authors: authors.map((a: any) => a.name),
      abstract: String(e.summary ?? '').replace(/\s+/g, ' ').trim(),
      url: `https://arxiv.org/abs/${id}`,
      pdfUrl: links.find((l: any) => l.title === 'pdf')?.href ?? `https://arxiv.org/pdf/${id}`,
      isOa: true,
    }
  })
}

// ---------- Crossref (DOI verification) ----------

export async function crossrefLookup(doi: string): Promise<{ exists: boolean; title?: string; venue?: string; year?: number; publisher?: string; type?: string }> {
  const clean = doi.replace(/^https?:\/\/doi\.org\//i, '').trim()
  try {
    const data = await fetchData<any>(`https://api.crossref.org/works/${encodeURIComponent(clean)}`, { cacheMs: 30 * 24 * 3600_000, retries: 2 })
    const m = data.message
    return {
      exists: true,
      title: m.title?.[0],
      venue: m['container-title']?.[0],
      year: m.issued?.['date-parts']?.[0]?.[0],
      publisher: m.publisher,
      type: m.type,
    }
  } catch {
    return { exists: false }
  }
}
