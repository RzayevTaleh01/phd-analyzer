import { getSettings } from '../db'
import { fetchData } from './http'
import type { AuthorHit, InstitutionHit, VenueHit, WorkHit } from './types'

const BASE = 'https://api.openalex.org'

export const short = (id?: string | null) => (id ? id.replace(/^https?:\/\/openalex\.org\//, '') : undefined)
const cleanDoi = (doi?: string | null) => (doi ? doi.replace(/^https?:\/\/doi\.org\//i, '') : undefined)
// Commas separate filters in OpenAlex, so strip them from free-text search values.
const q = (s: string) => encodeURIComponent(s.replace(/[,:|]/g, ' ').replace(/\s+/g, ' ').trim())

function url(path: string, params: Record<string, string | number | undefined>) {
  const s = getSettings()
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${v}`)
  if (s.openalexKey) parts.push(`api_key=${encodeURIComponent(s.openalexKey)}`)
  if (s.mailto) parts.push(`mailto=${encodeURIComponent(s.mailto)}`)
  return `${BASE}${path}?${parts.join('&')}`
}

export function abstractFrom(inv?: Record<string, number[]> | null): string | undefined {
  if (!inv) return undefined
  const words: string[] = []
  for (const [w, pos] of Object.entries(inv)) for (const p of pos) words[p] = w
  return words.filter(Boolean).join(' ')
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toWork(w: any): WorkHit {
  const loc = w.primary_location
  return {
    source: 'openalex',
    openalexId: short(w.id),
    doi: cleanDoi(w.doi),
    arxivId: w.ids?.arxiv ? String(w.ids.arxiv).replace(/^https?:\/\/arxiv\.org\/abs\//, '') : undefined,
    title: w.display_name ?? w.title ?? '(adsız)',
    year: w.publication_year ?? undefined,
    venue: loc?.source?.display_name ?? undefined,
    authors: (w.authorships ?? []).map((a: any) => a.author?.display_name).filter(Boolean),
    authorIds: (w.authorships ?? []).map((a: any) => short(a.author?.id)).filter(Boolean),
    citedBy: w.cited_by_count ?? 0,
    abstract: abstractFrom(w.abstract_inverted_index),
    url: w.doi ?? loc?.landing_page_url ?? w.id,
    pdfUrl: w.open_access?.oa_url ?? loc?.pdf_url ?? undefined,
    isOa: w.open_access?.is_oa ?? undefined,
  }
}

const WORK_FIELDS = 'id,doi,display_name,publication_year,cited_by_count,authorships,primary_location,abstract_inverted_index,ids,open_access,type'

export interface WorkQuery {
  query?: string
  fromYear?: number
  toYear?: number
  sort?: 'relevance' | 'cited' | 'recent'
  limit?: number
  institutionId?: string
  authorId?: string
  sourceId?: string
}

export const ARXIV_SOURCE = 'S4306400194'

export async function searchWorks(o: WorkQuery): Promise<WorkHit[]> {
  const filters: string[] = []
  if (o.query) filters.push(`title_and_abstract.search:${q(o.query)}`)
  if (o.fromYear) filters.push(`from_publication_date:${o.fromYear}-01-01`)
  if (o.toYear) filters.push(`to_publication_date:${o.toYear}-12-31`)
  if (o.institutionId) filters.push(`authorships.institutions.lineage:${short(o.institutionId)}`)
  if (o.authorId) filters.push(`author.id:${short(o.authorId)}`)
  if (o.sourceId) filters.push(`locations.source.id:${short(o.sourceId)}`)
  const limit = Math.min(o.limit ?? 15, 50)
  // Keyword search sorted purely by citations drifts off-topic, so "most cited"
  // means most cited among the 50 most relevant matches.
  const citedWithinRelevant = o.sort === 'cited' && Boolean(o.query)
  const sort = citedWithinRelevant || (!o.sort && o.query) || (o.sort === 'relevance' && o.query)
    ? 'relevance_score:desc'
    : o.sort === 'recent' ? 'publication_date:desc' : 'cited_by_count:desc'
  const data = await fetchData<any>(url('/works', { filter: filters.join(','), sort, per_page: citedWithinRelevant ? 50 : limit, select: WORK_FIELDS }))
  const hits: WorkHit[] = (data.results ?? []).map(toWork)
  if (citedWithinRelevant) return hits.sort((a, b) => (b.citedBy ?? 0) - (a.citedBy ?? 0)).slice(0, limit)
  return hits
}

export async function getWork(id: string): Promise<WorkHit | undefined> {
  const key = /^10\./.test(id) ? `doi:${id}` : short(id)
  try {
    const w = await fetchData<any>(url(`/works/${key}`, { select: WORK_FIELDS }), { cacheMs: 24 * 3600_000 })
    return toWork(w)
  } catch {
    return undefined
  }
}

export async function relatedWorks(id: string, direction: 'cites' | 'cited_by', limit = 15): Promise<WorkHit[]> {
  const filter = direction === 'cited_by' ? `cites:${short(id)}` : `cited_by:${short(id)}`
  const data = await fetchData<any>(url('/works', { filter, sort: 'cited_by_count:desc', per_page: Math.min(limit, 50), select: WORK_FIELDS }))
  return (data.results ?? []).map(toWork)
}

export async function findInstitutions(name: string, limit = 6): Promise<InstitutionHit[]> {
  const data = await fetchData<any>(
    url('/institutions', { search: q(name), per_page: limit, select: 'id,display_name,country_code,homepage_url,geo,type,works_count' }),
    { cacheMs: 7 * 24 * 3600_000 },
  )
  return (data.results ?? []).map((i: any) => ({
    openalexId: short(i.id)!,
    name: i.display_name,
    countryCode: i.country_code ?? undefined,
    city: i.geo?.city ?? undefined,
    homepage: i.homepage_url ?? undefined,
    type: i.type ?? undefined,
    worksCount: i.works_count ?? undefined,
  }))
}

const AUTHOR_FIELDS = 'id,display_name,orcid,last_known_institutions,summary_stats,works_count,cited_by_count,topics'

function toAuthor(a: any, institutionId?: string): AuthorHit {
  const target = short(institutionId)
  const known: any[] = a.last_known_institutions ?? []
  const match = target ? known.find((i) => short(i.id) === target || (i.lineage ?? []).map(short).includes(target)) : undefined
  const inst = match ?? known[0]
  const isCurrent = target ? Boolean(match) : undefined
  return {
    openalexId: short(a.id)!,
    name: a.display_name,
    orcid: a.orcid ?? undefined,
    institution: inst?.display_name ?? undefined,
    institutionId: short(inst?.id),
    isCurrent,
    hIndex: a.summary_stats?.h_index ?? undefined,
    worksCount: a.works_count ?? undefined,
    citedBy: a.cited_by_count ?? undefined,
    topics: (a.topics ?? []).slice(0, 5).map((t: any) => t.display_name),
  }
}

export async function getAuthors(ids: string[], institutionId?: string): Promise<AuthorHit[]> {
  if (ids.length === 0) return []
  const data = await fetchData<any>(url('/authors', { filter: `openalex:${ids.map(short).join('|')}`, per_page: ids.length, select: AUTHOR_FIELDS }))
  return (data.results ?? []).map((a: any) => toAuthor(a, institutionId))
}

export async function searchAuthors(name: string, institutionId?: string, limit = 8): Promise<AuthorHit[]> {
  const filter = institutionId ? `affiliations.institution.lineage:${short(institutionId)}` : undefined
  const data = await fetchData<any>(url('/authors', { search: q(name), filter, per_page: limit, select: AUTHOR_FIELDS }))
  return (data.results ?? []).map((a: any) => toAuthor(a, institutionId))
}

/** Who at an institution publishes on a topic: groups matching works by author. */
export async function topAuthorsAt(institutionId: string, query: string, fromYear = new Date().getFullYear() - 6, limit = 10): Promise<AuthorHit[]> {
  const filter = [
    `title_and_abstract.search:${q(query)}`,
    `authorships.institutions.lineage:${short(institutionId)}`,
    `from_publication_date:${fromYear}-01-01`,
  ].join(',')
  const data = await fetchData<any>(url('/works', { filter, group_by: 'authorships.author.id', per_page: 50 }))
  const groups: { key: string; count: number }[] = (data.group_by ?? []).slice(0, limit * 2)
  const authors = await getAuthors(groups.map((g) => g.key), institutionId)
  const counts = new Map(groups.map((g) => [short(g.key)!, g.count]))
  return authors
    .map((a) => ({ ...a, topicWorks: counts.get(a.openalexId) ?? 0 }))
    .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || (b.topicWorks ?? 0) - (a.topicWorks ?? 0))
    .slice(0, limit)
}

export async function getSource(id: string): Promise<VenueHit | undefined> {
  const data = await fetchData<any>(
    url('/sources', { filter: `openalex:${short(id)}`, select: 'id,display_name,issn_l,host_organization_name,is_oa,is_in_doaj,apc_usd,summary_stats,works_count,homepage_url,type' }),
    { cacheMs: 7 * 24 * 3600_000 },
  )
  const s = data.results?.[0]
  return s ? toVenue(s) : undefined
}

function toVenue(s: any): VenueHit {
  return {
    openalexId: short(s.id)!,
    name: s.display_name,
    type: s.type ?? undefined,
    issn: s.issn_l ?? undefined,
    publisher: s.host_organization_name ?? undefined,
    isOa: s.is_oa ?? undefined,
    inDoaj: s.is_in_doaj ?? undefined,
    apcUsd: s.apc_usd ?? undefined,
    hIndex: s.summary_stats?.h_index ?? undefined,
    meanCitedness: s.summary_stats?.['2yr_mean_citedness'] ?? undefined,
    worksCount: s.works_count ?? undefined,
    homepage: s.homepage_url ?? undefined,
  }
}

/** Venues where similar work gets published, ranked by how many matching papers they host. */
export async function venuesFor(query: string, fromYear = new Date().getFullYear() - 5, limit = 12): Promise<VenueHit[]> {
  const filter = [`title_and_abstract.search:${q(query)}`, `from_publication_date:${fromYear}-01-01`].join(',')
  const data = await fetchData<any>(url('/works', { filter, group_by: 'primary_location.source.id', per_page: 50 }))
  const groups: { key: string; count: number }[] = (data.group_by ?? []).filter((g: any) => g.key && g.key !== 'unknown').slice(0, limit + 6)
  if (groups.length === 0) return []
  const srcData = await fetchData<any>(
    url('/sources', {
      filter: `openalex:${groups.map((g) => short(g.key)).join('|')}`,
      per_page: groups.length,
      select: 'id,display_name,issn_l,host_organization_name,is_oa,is_in_doaj,apc_usd,summary_stats,works_count,homepage_url,type',
    }),
    { cacheMs: 7 * 24 * 3600_000 },
  )
  const counts = new Map(groups.map((g) => [short(g.key)!, g.count]))
  return (srcData.results ?? [])
    .map((s: any) => ({ ...toVenue(s), matchingWorks: counts.get(short(s.id)!) ?? 0 }))
    .filter((v: VenueHit) => v.type !== 'repository' || /arxiv/i.test(v.name))
    .sort((a: VenueHit, b: VenueHit) => (b.matchingWorks ?? 0) - (a.matchingWorks ?? 0))
    .slice(0, limit)
}

/** Publication counts per year: how fast a topic is growing. */
export async function yearTrend(query: string, fromYear = 2012): Promise<{ year: number; works: number }[]> {
  const filter = [`title_and_abstract.search:${q(query)}`, `from_publication_date:${fromYear}-01-01`].join(',')
  const data = await fetchData<any>(url('/works', { filter, group_by: 'publication_year' }))
  return (data.group_by ?? [])
    .map((g: any) => ({ year: Number(g.key), works: g.count }))
    .filter((g: { year: number }) => g.year <= new Date().getFullYear())
    .sort((a: { year: number }, b: { year: number }) => a.year - b.year)
}
