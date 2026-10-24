// Turns research hits into saved, de-duplicated records on the board.
import type { Paper, Researcher, University, Venue } from '../shared/types'
import { find, insert, list, update } from './db'
import * as oa from './research/openalex'
import type { AuthorHit, VenueHit, WorkHit } from './research/types'

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const uniq = <T>(xs: T[]) => [...new Set(xs)]

export function findPaper(h: Partial<WorkHit>): Paper | undefined {
  return find('papers', (p) =>
    Boolean(
      (h.doi && p.doi?.toLowerCase() === h.doi.toLowerCase()) ||
        (h.openalexId && p.openalexId === h.openalexId) ||
        (h.arxivId && p.arxivId === h.arxivId) ||
        (h.s2Id && p.s2Id === h.s2Id) ||
        (h.title && norm(p.title) === norm(h.title)),
    ),
  )
}

export function savePaper(h: WorkHit, link: { topicIds?: number[]; researcherIds?: number[]; status?: Paper['status']; notes?: string } = {}): { paper: Paper; created: boolean } {
  const existing = findPaper(h)
  if (existing) {
    const paper = update('papers', existing.id, {
      topicIds: uniq([...existing.topicIds, ...(link.topicIds ?? [])]),
      researcherIds: uniq([...existing.researcherIds, ...(link.researcherIds ?? [])]),
      openalexId: existing.openalexId ?? h.openalexId,
      s2Id: existing.s2Id ?? h.s2Id,
      arxivId: existing.arxivId ?? h.arxivId,
      doi: existing.doi ?? h.doi,
      abstract: existing.abstract ?? h.abstract,
      tldr: existing.tldr ?? h.tldr,
      pdfUrl: existing.pdfUrl ?? h.pdfUrl,
      citedBy: Math.max(existing.citedBy ?? 0, h.citedBy ?? 0),
      ...(link.status ? { status: link.status } : {}),
      ...(link.notes ? { notes: link.notes } : {}),
    })!
    return { paper, created: false }
  }
  // Link authors already on the board automatically.
  const byOa = new Map(list('researchers').filter((r) => r.openalexId).map((r) => [r.openalexId!, r.id]))
  const autoResearchers = (h.authorIds ?? []).map((a) => byOa.get(a)).filter((x): x is number => x !== undefined)
  const paper = insert('papers', {
    title: h.title,
    authors: h.authors.slice(0, 12),
    year: h.year,
    venue: h.venue,
    doi: h.doi,
    openalexId: h.openalexId,
    s2Id: h.s2Id,
    arxivId: h.arxivId,
    url: h.url,
    pdfUrl: h.pdfUrl,
    abstract: h.abstract,
    tldr: h.tldr,
    citedBy: h.citedBy,
    status: link.status ?? 'to_read',
    topicIds: uniq(link.topicIds ?? []),
    researcherIds: uniq([...(link.researcherIds ?? []), ...autoResearchers]),
    notes: link.notes,
    addedAt: new Date().toISOString(),
  })
  return { paper, created: true }
}

export async function resolveUniversity(name: string, extra: Partial<University> = {}): Promise<University> {
  const existing = find('universities', (u) => norm(u.name) === norm(name) || Boolean(extra.openalexId && u.openalexId === extra.openalexId))
  if (existing) return Object.keys(extra).length ? update('universities', existing.id, extra)! : existing
  let hit: Awaited<ReturnType<typeof oa.findInstitutions>>[number] | undefined
  if (!extra.openalexId) hit = (await oa.findInstitutions(name, 1).catch(() => []))[0]
  return insert('universities', {
    ...extra,
    name: hit?.name ?? name,
    openalexId: extra.openalexId ?? hit?.openalexId,
    countryCode: extra.countryCode ?? hit?.countryCode ?? '',
    country: extra.country ?? '',
    city: extra.city ?? hit?.city,
    website: extra.website ?? hit?.homepage,
    status: extra.status ?? 'interested',
  })
}

export function saveResearcher(a: AuthorHit, extra: Partial<Researcher> = {}): { researcher: Researcher; created: boolean } {
  const existing = find('researchers', (r) => r.openalexId === a.openalexId || (!r.openalexId && norm(r.name) === norm(a.name)))
  const fields: Partial<Researcher> = {
    name: a.name,
    openalexId: a.openalexId,
    orcid: a.orcid,
    hIndex: a.hIndex,
    worksCount: a.worksCount,
    citedBy: a.citedBy,
    concepts: a.topics,
    topicWorks: a.topicWorks,
  }
  if (existing) {
    const researcher = update('researchers', existing.id, {
      ...fields,
      ...extra,
      topicIds: uniq([...existing.topicIds, ...(extra.topicIds ?? [])]),
      status: existing.status,
    })!
    return { researcher, created: false }
  }
  return { researcher: insert('researchers', { status: 'new', topicIds: [], ...fields, ...extra }), created: true }
}

export function saveVenue(v: Partial<VenueHit> & { name: string }, extra: Partial<Venue> = {}): Venue {
  const existing = find('venues', (x) => Boolean((v.openalexId && x.openalexId === v.openalexId) || norm(x.name) === norm(v.name)))
  const t = (v.type ?? '').toLowerCase()
  const fields: Partial<Venue> = {
    name: v.name,
    openalexId: v.openalexId,
    issn: v.issn,
    publisher: v.publisher,
    isOa: v.isOa,
    inDoaj: v.inDoaj,
    apcUsd: v.apcUsd,
    hIndex: v.hIndex,
    worksCount: v.worksCount,
    homepage: v.homepage,
    type: extra.type ?? (t.includes('conference') ? 'conference' : t.includes('repository') ? 'repository' : 'journal'),
  }
  if (existing) return update('venues', existing.id, { ...fields, ...extra, status: extra.status ?? existing.status })!
  return insert('venues', { status: 'suggested', ...fields, ...extra })
}
