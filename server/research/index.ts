import * as oa from './openalex'
import { arxivSearch, s2Search } from './scholar'
import type { WorkHit } from './types'

export type PaperSource = 'openalex' | 'semantic_scholar' | 'arxiv' | 'all'

export interface PaperSearch {
  query: string
  source?: PaperSource
  fromYear?: number
  toYear?: number
  sort?: 'relevance' | 'cited' | 'recent'
  limit?: number
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const isPreprintDoi = (d?: string) => Boolean(d && /^10\.48550\//i.test(d))

// The same paper often exists as preprint + proceedings with different DOIs, so merge by title.
export function dedupe(hits: WorkHit[]): WorkHit[] {
  const seen = new Map<string, WorkHit>()
  for (const h of hits) {
    const key = norm(h.title)
    const prev = seen.get(key)
    if (!prev) seen.set(key, h)
    else
      seen.set(key, {
        ...prev,
        doi: !prev.doi || (isPreprintDoi(prev.doi) && h.doi && !isPreprintDoi(h.doi)) ? h.doi ?? prev.doi : prev.doi,
        venue: prev.venue === 'arXiv' && h.venue ? h.venue : prev.venue,
        year: prev.year ?? h.year,
        openalexId: prev.openalexId ?? h.openalexId,
        s2Id: prev.s2Id ?? h.s2Id,
        arxivId: prev.arxivId ?? h.arxivId,
        abstract: prev.abstract ?? h.abstract,
        tldr: prev.tldr ?? h.tldr,
        pdfUrl: prev.pdfUrl ?? h.pdfUrl,
        citedBy: Math.max(prev.citedBy ?? 0, h.citedBy ?? 0),
      })
  }
  return [...seen.values()]
}

export async function searchPapers(s: PaperSearch): Promise<{ hits: WorkHit[]; errors: string[] }> {
  const source = s.source ?? 'openalex'
  const limit = s.limit ?? 15
  const errors: string[] = []
  const runs: Promise<WorkHit[]>[] = []
  const guard = (name: string, p: Promise<WorkHit[]>) =>
    p.catch((e) => {
      errors.push(`${name}: ${(e as Error).message}`)
      return [] as WorkHit[]
    })
  if (source === 'openalex' || source === 'all')
    runs.push(guard('OpenAlex', oa.searchWorks({ query: s.query, fromYear: s.fromYear, toYear: s.toYear, sort: s.sort, limit })))
  if (source === 'semantic_scholar' || source === 'all')
    runs.push(guard('Semantic Scholar', s2Search(s.query, { fromYear: s.fromYear, toYear: s.toYear, limit })))
  if (source === 'arxiv' || source === 'all')
    runs.push(
      guard(
        'arXiv',
        // arXiv's own API rate-limits hard; OpenAlex indexes arXiv too, so fall back to it.
        arxivSearch(s.query, { limit, sort: s.sort === 'relevance' ? 'relevance' : 'recent' }).catch(() =>
          oa.searchWorks({ query: s.query, sourceId: oa.ARXIV_SOURCE, fromYear: s.fromYear, toYear: s.toYear, sort: s.sort ?? 'recent', limit }).then((hits) =>
            hits.map((h) => ({ ...h, venue: 'arXiv' })),
          ),
        ),
      ),
    )
  const all = (await Promise.all(runs)).flat()
  let hits = dedupe(all)
  if (s.fromYear) hits = hits.filter((h) => !h.year || h.year >= s.fromYear!)
  if (s.toYear) hits = hits.filter((h) => !h.year || h.year <= s.toYear!)
  if (s.sort === 'cited') hits.sort((a, b) => (b.citedBy ?? 0) - (a.citedBy ?? 0))
  if (s.sort === 'recent') hits.sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
  return { hits, errors }
}

export { oa }
