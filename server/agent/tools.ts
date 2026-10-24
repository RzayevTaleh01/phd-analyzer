import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { CONDITIONS } from '../../shared/criteria'
import type { ModuleKey } from '../../shared/types'
import { COLLS, COLL_MODULE, get, insert, list, logActivity, remove, setProfile, update, type Coll } from '../db'
import { resolveUniversity, saveResearcher, savePaper, saveVenue, findPaper } from '../library'
import { dedupe, searchPapers } from '../research'
import * as oa from '../research/openalex'
import { arxivById, crossrefLookup, s2Paper, s2Recommend } from '../research/scholar'
import type { WorkHit } from '../research/types'
import { buildOverview, todayISO } from './overview'
import type { JobKind } from './prompts'

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }
const ok = (data: unknown): ToolResult => ({ content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 1) }] })
const fail = (msg: string): ToolResult => ({ content: [{ type: 'text', text: `ERROR: ${msg}` }], isError: true })

function safe<A>(fn: (a: A) => Promise<ToolResult> | ToolResult) {
  return async (a: A): Promise<ToolResult> => {
    try {
      return await fn(a)
    } catch (e) {
      return fail((e as Error).message)
    }
  }
}

function brief(h: WorkHit, absLen = 450) {
  const inLib = findPaper(h)
  return {
    inLibrary: inLib ? `P${inLib.id}` : undefined,
    openalexId: h.openalexId,
    s2Id: h.s2Id,
    arxivId: h.arxivId,
    doi: h.doi,
    title: h.title,
    year: h.year,
    venue: h.venue,
    authors: h.authors.slice(0, 4).join(', ') + (h.authors.length > 4 ? ' et al.' : ''),
    citedBy: h.citedBy,
    tldr: h.tldr,
    abstract: h.abstract ? h.abstract.slice(0, absLen) + (h.abstract.length > absLen ? '...' : '') : undefined,
    url: h.url,
  }
}

function compact(c: Coll, item: Record<string, unknown>) {
  const out = { ...item }
  if (c === 'papers' && typeof out.abstract === 'string') out.abstract = (out.abstract as string).slice(0, 200)
  if (c === 'docs' && typeof out.content === 'string') out.content = (out.content as string).slice(0, 200)
  return out
}

async function resolveWork(ref: { openalexId?: string; doi?: string; arxivId?: string; s2Id?: string }): Promise<WorkHit | undefined> {
  if (ref.openalexId) return oa.getWork(ref.openalexId)
  if (ref.doi) return (await oa.getWork(ref.doi)) ?? (await s2Paper(`DOI:${ref.doi}`))
  if (ref.arxivId) return (await oa.getWork(`10.48550/arXiv.${ref.arxivId}`)) ?? (await arxivById(ref.arxivId))
  if (ref.s2Id) return s2Paper(ref.s2Id)
  return undefined
}

const collEnum = z.enum(COLLS as [Coll, ...Coll[]])
const moduleEnum = z.enum(['today', 'deadlines', 'universities', 'topics', 'groups', 'researchers', 'papers', 'gaps', 'publish', 'documents', 'profile'])
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
const ids = z.array(z.number().int()).optional()

let jobStarter: ((kind: JobKind, params: Record<string, unknown>) => string) | null = null
export function setJobStarter(fn: typeof jobStarter) {
  jobStarter = fn
}

const ro = { annotations: { readOnlyHint: true } }

export const phdTools = [
  // ---------- board: read ----------
  tool('get_overview', 'Fresh text snapshot of the whole PhD board (profile, topics, universities, deadlines, tasks, researchers, papers, gaps, venues, documents).', {}, safe(async () => ok(buildOverview())), ro),

  tool(
    'list_items',
    'List saved items of one board collection, optionally filtered by a text query.',
    { type: collEnum, query: z.string().optional(), limit: z.number().int().max(200).optional() },
    safe(async ({ type, query, limit }) => {
      let items = list(type) as unknown as Record<string, unknown>[]
      if (query) items = items.filter((i) => JSON.stringify(i).toLowerCase().includes(query.toLowerCase()))
      return ok(items.slice(0, limit ?? 60).map((i) => compact(type, i)))
    }),
    ro,
  ),

  tool(
    'get_item',
    'Full details of one saved item (papers include the abstract, documents the full text).',
    { type: collEnum, id: z.number().int() },
    safe(async ({ type, id }) => {
      const item = get(type, id)
      return item ? ok(item) : fail(`${type} ${id} not found`)
    }),
    ro,
  ),

  // ---------- board: write ----------
  tool(
    'save_profile',
    "Update the user's PhD profile (only the fields given are changed).",
    {
      name: z.string().optional(),
      field: z.string().optional(),
      stage: z.string().optional().describe('e.g. "applying for Fall 2027", "1st year PhD"'),
      targetTerm: z.string().optional(),
      countries: z.array(z.string()).optional(),
      interests: z.string().optional(),
      background: z.string().optional(),
      languages: z.string().optional(),
      directions: z.array(z.string()).optional().describe('broad research directions, e.g. ["Natural Language Processing", "Adaptive learning systems"]'),
      rankingSystem: z.enum(['QS', 'THE', 'ARWU', 'any']).optional(),
      rankingMax: z.number().int().min(0).optional().describe('only universities in the top N of the ranking; 0 = no limit'),
      conditions: z.array(z.enum(CONDITIONS.map((c) => c.key) as [string, ...string[]])).optional(),
      conditionsNote: z.string().optional(),
      citizenship: z.string().optional(),
      education: z.string().optional().describe('previous degrees, institution and teaching language'),
    },
    safe(async (p) => {
      const prof = setProfile(p)
      logActivity('ai', 'profile', 'Profil yeniləndi')
      return ok(prof)
    }),
  ),

  tool(
    'add_topic',
    'Add a research topic the user is investigating.',
    { title: z.string(), description: z.string().optional(), keywords: z.array(z.string()), priority: z.number().int().min(1).max(3).optional() },
    safe(async (t) => {
      const existing = list('topics').find((x) => x.title.toLowerCase() === t.title.toLowerCase())
      if (existing) return ok({ note: 'already exists', topic: existing })
      const topic = insert('topics', { ...t, priority: (t.priority ?? 2) as 1 | 2 | 3, status: 'active', createdAt: new Date().toISOString() })
      logActivity('ai', 'topics', `Mövzu əlavə olundu: ${topic.title}`)
      return ok(topic)
    }),
  ),

  tool(
    'add_university',
    'Add or update a target university (same name updates it). The OpenAlex institution id is resolved automatically. Give ranking and language-test facts only with an official source URL.',
    {
      name: z.string(),
      countryCode: z.string().optional(),
      country: z.string().optional(),
      city: z.string().optional(),
      website: z.string().optional(),
      openalexId: z.string().optional(),
      status: z.enum(['interested', 'researching', 'applying', 'applied', 'interview', 'accepted', 'rejected']).optional(),
      notes: z.string().optional(),
      rank: z.number().int().optional().describe('numeric rank for sorting; for a band like 201-250 use 201'),
      rankLabel: z.string().optional().describe('as published, e.g. "QS 2026 #85" or "THE 2026 201-250"'),
      rankSource: z.string().optional().describe('URL of the ranking page'),
      langCert: z.enum(['not_required', 'waiver', 'required', 'unknown']).optional().describe('English test certificate for this applicant'),
      langCertNote: z.string().optional().describe('what the official page says and whether it applies to the user'),
      langCertSource: z.string().optional().describe('URL of the official language requirements page'),
      fitNote: z.string().optional().describe('one or two lines: how it meets the directions and conditions'),
    },
    safe(async ({ name, ...extra }) => {
      if (extra.rankLabel && !extra.rankSource) return fail('rankLabel needs rankSource (ranking page URL)')
      if (extra.langCert && extra.langCert !== 'unknown' && !extra.langCertSource) return fail('langCert needs langCertSource (official requirements page URL)')
      const u = await resolveUniversity(name, Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined)))
      logActivity('ai', 'universities', `Universitet: ${u.name}${u.rankLabel ? ` (${u.rankLabel})` : ''}`)
      return ok(u)
    }),
  ),

  tool(
    'add_deadline',
    'Save a deadline. sourceUrl is required when verified=true. Same title+date updates the existing one.',
    {
      title: z.string(),
      dueDate: date,
      kind: z.enum(['application', 'scholarship', 'interview', 'document', 'conference', 'journal', 'other']),
      universityId: z.number().int().optional(),
      program: z.string().optional(),
      dueTime: z.string().optional(),
      timezone: z.string().optional(),
      sourceUrl: z.string().optional(),
      verified: z.boolean(),
      notes: z.string().optional(),
    },
    safe(async (d) => {
      if (d.verified && !d.sourceUrl) return fail('verified=true needs a sourceUrl from an official page')
      const patch = { ...d, verifiedAt: d.verified ? new Date().toISOString() : undefined }
      const existing = list('deadlines').find((x) => x.title.toLowerCase() === d.title.toLowerCase() && x.universityId === d.universityId)
      const saved = existing ? update('deadlines', existing.id, patch)! : insert('deadlines', { ...patch, status: 'open' })
      logActivity('ai', 'deadlines', `Deadline: ${saved.title} - ${saved.dueDate}${saved.verified ? ' (təsdiqli)' : ''}`)
      return ok(saved)
    }),
  ),

  tool(
    'add_task',
    'Add a to-do task (for today use dueDate = today).',
    {
      title: z.string(),
      notes: z.string().optional(),
      dueDate: date.optional(),
      priority: z.number().int().min(1).max(3).optional(),
      module: moduleEnum.optional(),
    },
    safe(async (t) => {
      const dup = list('tasks').find((x) => x.title.toLowerCase() === t.title.toLowerCase() && x.dueDate === t.dueDate && x.status !== 'done')
      if (dup) return ok({ note: 'already exists', task: dup })
      const task = insert('tasks', { ...t, priority: (t.priority ?? 2) as 1 | 2 | 3, status: 'todo', createdBy: 'ai' })
      logActivity('ai', 'today', `Tapşırıq: ${task.title}`)
      return ok(task)
    }),
  ),

  tool(
    'add_group',
    'Save a research group / lab.',
    {
      name: z.string(),
      universityId: z.number().int().optional(),
      piName: z.string().optional(),
      url: z.string().optional(),
      description: z.string().optional(),
      topicIds: ids,
    },
    safe(async (g) => {
      const existing = list('groups').find((x) => x.name.toLowerCase() === g.name.toLowerCase())
      const saved = existing ? update('groups', existing.id, { ...g, topicIds: [...new Set([...existing.topicIds, ...(g.topicIds ?? [])])] })! : insert('groups', { ...g, topicIds: g.topicIds ?? [] })
      logActivity('ai', 'groups', `Qrup: ${saved.name}`)
      return ok(saved)
    }),
  ),

  tool(
    'add_researcher',
    'Save a researcher. Give openalexId (from find_researchers_at / search_authors) so real metrics are fetched; otherwise give name.',
    {
      openalexId: z.string().optional(),
      name: z.string().optional(),
      universityId: z.number().int().optional(),
      groupId: z.number().int().optional(),
      position: z.string().optional(),
      homepage: z.string().optional(),
      email: z.string().optional(),
      relevance: z.number().int().min(0).max(100).optional(),
      topicIds: ids,
      notes: z.string().optional(),
    },
    safe(async ({ openalexId, name, ...extra }) => {
      if (openalexId) {
        const [a] = await oa.getAuthors([openalexId])
        if (!a) return fail(`OpenAlex author ${openalexId} not found`)
        const { researcher, created } = saveResearcher(a, extra)
        logActivity('ai', 'researchers', `Tədqiqatçı: ${researcher.name}`)
        return ok({ created, researcher })
      }
      if (!name) return fail('give openalexId or name')
      const r = insert('researchers', { name, ...extra, concepts: [], topicIds: extra.topicIds ?? [], status: 'new' })
      logActivity('ai', 'researchers', `Tədqiqatçı: ${r.name}`)
      return ok({ created: true, researcher: r })
    }),
  ),

  tool(
    'save_papers',
    'Save real papers to the library by id (metadata is fetched from the source, so nothing is made up). Each item needs one of openalexId, doi, arxivId, s2Id.',
    {
      items: z.array(z.object({ openalexId: z.string().optional(), doi: z.string().optional(), arxivId: z.string().optional(), s2Id: z.string().optional() })).max(25),
      topicIds: ids,
      researcherIds: ids,
      status: z.enum(['to_read', 'reading', 'read', 'key']).optional(),
    },
    safe(async ({ items, topicIds, researcherIds, status }) => {
      const out: { ref: string; id?: number; title?: string; created?: boolean; error?: string }[] = []
      for (const ref of items) {
        const label = ref.openalexId ?? ref.doi ?? ref.arxivId ?? ref.s2Id ?? '?'
        const hit = await resolveWork(ref).catch(() => undefined)
        if (!hit) {
          out.push({ ref: label, error: 'not found in OpenAlex/S2/arXiv' })
          continue
        }
        const { paper, created } = savePaper(hit, { topicIds, researcherIds, status })
        out.push({ ref: label, id: paper.id, title: paper.title, created })
      }
      const n = out.filter((o) => o.created).length
      if (n) logActivity('ai', 'papers', `${n} məqalə kitabxanaya əlavə olundu`)
      return ok(out)
    }),
  ),

  tool(
    'add_gap',
    'Save a research gap backed by evidence papers that are already in the library (paperId = board P id).',
    {
      topicId: z.number().int().optional(),
      title: z.string(),
      description: z.string(),
      evidence: z.array(z.object({ paperId: z.number().int(), note: z.string() })).min(1),
      novelty: z.number().int().min(1).max(5),
      feasibility: z.number().int().min(1).max(5),
      methods: z.string().optional(),
    },
    safe(async (g) => {
      const missing = g.evidence.filter((e) => !get('papers', e.paperId)).map((e) => e.paperId)
      if (missing.length) return fail(`papers not in library: ${missing.join(', ')}. Save them with save_papers first.`)
      const gap = insert('gaps', {
        ...g,
        evidence: g.evidence.map((e) => ({ paperId: e.paperId, ref: `P${e.paperId}`, note: e.note })),
        status: 'candidate',
        createdAt: new Date().toISOString(),
      })
      logActivity('ai', 'gaps', `Research gap: ${gap.title}`)
      return ok(gap)
    }),
  ),

  tool(
    'add_venue',
    'Save a publication venue suggestion. With openalexId the real stats (h-index, OA, DOAJ, APC) are fetched.',
    {
      openalexId: z.string().optional(),
      name: z.string(),
      type: z.enum(['journal', 'conference', 'repository', 'other']).optional(),
      fit: z.number().int().min(0).max(100).optional(),
      reason: z.string().optional(),
      homepage: z.string().optional(),
      status: z.enum(['suggested', 'shortlisted', 'submitted', 'rejected', 'accepted']).optional(),
    },
    safe(async ({ openalexId, name, ...extra }) => {
      const src = openalexId ? await oa.getSource(openalexId) : undefined
      const v = saveVenue(src ?? { name }, Object.fromEntries(Object.entries(extra).filter(([, x]) => x !== undefined)))
      logActivity('ai', 'publish', `Nəşr yeri: ${v.name}`)
      return ok(v)
    }),
  ),

  tool(
    'save_document',
    'Create or update a document (SOP, CV, proposal, email draft, cover letter, note). Give id to update.',
    {
      id: z.number().int().optional(),
      title: z.string(),
      kind: z.enum(['sop', 'cv', 'proposal', 'email', 'cover_letter', 'note']),
      content: z.string(),
      status: z.enum(['draft', 'review', 'final']).optional(),
      universityId: z.number().int().optional(),
    },
    safe(async ({ id, ...d }) => {
      const doc = id ? update('docs', id, d) : insert('docs', { ...d, status: d.status ?? 'draft' })
      if (!doc) return fail(`document ${id} not found`)
      logActivity('ai', 'documents', `Sənəd: ${doc.title}`)
      return ok({ id: doc.id, title: doc.title, status: doc.status })
    }),
  ),

  tool(
    'update_item',
    'Change fields of a saved item, e.g. {status:"contacted"} on a researcher, {status:"done"} on a task, {verified:true, sourceUrl:"..."} on a deadline.',
    { type: collEnum, id: z.number().int(), patch: z.record(z.string(), z.unknown()) },
    safe(async ({ type, id, patch }) => {
      const p = { ...patch }
      if (type === 'deadlines' && p.verified === true) {
        if (!p.sourceUrl && !get('deadlines', id)?.sourceUrl) return fail('verified=true needs a sourceUrl')
        p.verifiedAt = new Date().toISOString()
      }
      const item = update(type, id, p as never)
      if (!item) return fail(`${type} ${id} not found`)
      logActivity('ai', COLL_MODULE[type], `Yeniləndi: ${type} #${id}`)
      return ok(compact(type, item as unknown as Record<string, unknown>))
    }),
  ),

  tool(
    'delete_item',
    'Delete a saved item. Only when the user explicitly asked for it.',
    { type: collEnum, id: z.number().int() },
    safe(async ({ type, id }) => {
      const okDel = remove(type, id)
      if (okDel) logActivity('ai', COLL_MODULE[type], `Silindi: ${type} #${id}`)
      return okDel ? ok('deleted') : fail('not found')
    }),
  ),

  // ---------- real research ----------
  tool(
    'search_papers',
    'Search real scholarly papers. source: openalex (broad, citations), semantic_scholar (TLDRs), arxiv (newest preprints) or all. Results show inLibrary when already saved.',
    {
      query: z.string(),
      source: z.enum(['openalex', 'semantic_scholar', 'arxiv', 'all']).optional(),
      fromYear: z.number().int().optional(),
      toYear: z.number().int().optional(),
      sort: z.enum(['relevance', 'cited', 'recent']).optional(),
      limit: z.number().int().max(40).optional(),
    },
    safe(async (s) => {
      const { hits, errors } = await searchPapers({ ...s, source: s.source ?? 'openalex', limit: s.limit ?? 12 })
      return ok({ count: hits.length, errors: errors.length ? errors : undefined, results: hits.map((h) => brief(h)) })
    }),
    ro,
  ),

  tool(
    'paper_details',
    'Full metadata and abstract of one paper by openalexId, doi, arxivId or s2Id.',
    { openalexId: z.string().optional(), doi: z.string().optional(), arxivId: z.string().optional(), s2Id: z.string().optional() },
    safe(async (ref) => {
      const h = await resolveWork(ref)
      return h ? ok({ ...brief(h, 4000), authors: h.authors, pdfUrl: h.pdfUrl, isOa: h.isOa }) : fail('paper not found')
    }),
    ro,
  ),

  tool(
    'related_papers',
    'Citation neighbourhood of a paper: "cited_by" (newer work citing it), "cites" (its references, needs openalexId) or "similar" (Semantic Scholar recommendations; give s2Id or doi).',
    {
      direction: z.enum(['cites', 'cited_by', 'similar']),
      openalexId: z.string().optional(),
      s2Id: z.string().optional(),
      doi: z.string().optional(),
      limit: z.number().int().max(30).optional(),
    },
    safe(async ({ direction, openalexId, s2Id, doi, limit }) => {
      if (direction === 'similar') {
        const id = s2Id ?? (doi ? `DOI:${doi}` : undefined)
        if (!id) return fail('similar needs s2Id or doi')
        return ok((await s2Recommend(id, limit ?? 10)).map((h) => brief(h, 250)))
      }
      if (!openalexId) return fail('cites/cited_by need openalexId')
      return ok(dedupe(await oa.relatedWorks(openalexId, direction, limit ?? 12)).map((h) => brief(h, 250)))
    }),
    ro,
  ),

  tool(
    'find_institution',
    'Find a university/institute in OpenAlex (returns its institution id for other tools).',
    { name: z.string() },
    safe(async ({ name }) => ok(await oa.findInstitutions(name))),
    ro,
  ),

  tool(
    'find_researchers_at',
    'Who at an institution publishes on a topic (OpenAlex works grouped by author, with h-index and whether they are currently there).',
    { institutionId: z.string(), query: z.string(), fromYear: z.number().int().optional(), limit: z.number().int().max(25).optional() },
    safe(async ({ institutionId, query, fromYear, limit }) => ok(await oa.topAuthorsAt(institutionId, query, fromYear, limit ?? 12))),
    ro,
  ),

  tool(
    'search_authors',
    'Find a researcher by name in OpenAlex (optionally limited to an institution id).',
    { name: z.string(), institutionId: z.string().optional() },
    safe(async ({ name, institutionId }) => ok(await oa.searchAuthors(name, institutionId))),
    ro,
  ),

  tool(
    'researcher_works',
    "A researcher's publications from OpenAlex, optionally filtered by a topic query.",
    { openalexId: z.string(), query: z.string().optional(), sort: z.enum(['relevance', 'cited', 'recent']).optional(), limit: z.number().int().max(30).optional() },
    safe(async ({ openalexId, query, sort, limit }) =>
      ok(dedupe(await oa.searchWorks({ authorId: openalexId, query, sort: sort ?? (query ? 'relevance' : 'recent'), limit: limit ?? 10 })).map((h) => brief(h, 250))),
    ),
    ro,
  ),

  tool(
    'find_venues',
    'Real journals/conferences that publish work like this (OpenAlex), with h-index, OA, DOAJ, APC and how many matching papers they published.',
    { query: z.string(), fromYear: z.number().int().optional(), limit: z.number().int().max(20).optional() },
    safe(async ({ query, fromYear, limit }) => ok(await oa.venuesFor(query, fromYear, limit ?? 12))),
    ro,
  ),

  tool('verify_doi', 'Check that a DOI really exists (Crossref) and get its title/venue/year.', { doi: z.string() }, safe(async ({ doi }) => ok(await crossrefLookup(doi))), ro),

  tool(
    'topic_trend',
    'Publications per year for a topic query (OpenAlex) to see whether a field is growing.',
    { query: z.string(), fromYear: z.number().int().optional() },
    safe(async ({ query, fromYear }) => ok(await oa.yearTrend(query, fromYear))),
    ro,
  ),

  // ---------- background jobs ----------
  tool(
    'start_job',
    'Start a long research job in the background (it fills the board on its own). kinds: find_universities (universities matching the profile criteria; optional note), gap_analysis (topicId), scout_university (universityId, optional topicIds), verify_deadlines (optional universityId), daily_plan, venue_match (title, abstract).',
    {
      kind: z.enum(['find_universities', 'gap_analysis', 'scout_university', 'verify_deadlines', 'daily_plan', 'venue_match']),
      topicId: z.number().int().optional(),
      topicIds: ids,
      universityId: z.number().int().optional(),
      title: z.string().optional(),
      abstract: z.string().optional(),
      note: z.string().optional(),
    },
    safe(async ({ kind, ...params }) => {
      if (!jobStarter) return fail('job runner not ready')
      return ok({ started: jobStarter(kind, params), kind })
    }),
  ),
]

export const PHD_TOOL_NAMES = phdTools.map((t) => `mcp__phd__${t.name}`)

export function phdServer() {
  return createSdkMcpServer({ name: 'phd', version: '0.1.0', tools: phdTools })
}

// ---------- UI metadata: which module a tool touches, and a readable label ----------

export function toolMeta(name: string, input: Record<string, unknown>): { module: ModuleKey; label: string } {
  const n = name.replace(/^mcp__phd__/, '')
  const s = (k: string) => (input[k] === undefined ? '' : String(input[k]))
  const typeModule = (): ModuleKey => (COLL_MODULE as Record<string, ModuleKey>)[s('type')] ?? 'core'
  switch (n) {
    case 'get_overview': return { module: 'core', label: 'Sistem vəziyyəti oxundu' }
    case 'list_items': return { module: typeModule(), label: `Siyahı: ${s('type')}${input.query ? ` "${s('query')}"` : ''}` }
    case 'get_item': return { module: typeModule(), label: `Oxundu: ${s('type')} #${s('id')}` }
    case 'save_profile': return { module: 'profile', label: 'Profil yeniləndi' }
    case 'add_topic': return { module: 'topics', label: `Mövzu: ${s('title')}` }
    case 'add_university': return { module: 'universities', label: `Universitet: ${s('name')}` }
    case 'add_deadline': return { module: 'deadlines', label: `Deadline: ${s('title')} (${s('dueDate')})` }
    case 'add_task': return { module: 'today', label: `Tapşırıq: ${s('title')}` }
    case 'add_group': return { module: 'groups', label: `Qrup: ${s('name')}` }
    case 'add_researcher': return { module: 'researchers', label: `Tədqiqatçı yadda saxlanılır ${s('name') || s('openalexId')}` }
    case 'save_papers': return { module: 'papers', label: `${(input.items as unknown[] | undefined)?.length ?? 0} məqalə yadda saxlanılır` }
    case 'add_gap': return { module: 'gaps', label: `Gap: ${s('title')}` }
    case 'add_venue': return { module: 'publish', label: `Nəşr yeri: ${s('name')}` }
    case 'save_document': return { module: 'documents', label: `Sənəd: ${s('title')}` }
    case 'update_item': return { module: typeModule(), label: `Yeniləmə: ${s('type')} #${s('id')}` }
    case 'delete_item': return { module: typeModule(), label: `Silmə: ${s('type')} #${s('id')}` }
    case 'search_papers': return { module: 'papers', label: `Məqalə axtarışı (${s('source') || 'openalex'}): "${s('query')}"` }
    case 'paper_details': return { module: 'papers', label: `Məqalə detalları: ${s('openalexId') || s('doi') || s('arxivId') || s('s2Id')}` }
    case 'related_papers': return { module: 'papers', label: `Sitat şəbəkəsi (${s('direction')})` }
    case 'find_institution': return { module: 'universities', label: `OpenAlex: "${s('name')}"` }
    case 'find_researchers_at': return { module: 'researchers', label: `"${s('query')}" üzrə tədqiqatçılar (${s('institutionId')})` }
    case 'search_authors': return { module: 'researchers', label: `Müəllif axtarışı: ${s('name')}` }
    case 'researcher_works': return { module: 'researchers', label: `Tədqiqatçının məqalələri ${s('openalexId')}` }
    case 'find_venues': return { module: 'publish', label: `Jurnal/konfrans axtarışı: "${s('query')}"` }
    case 'verify_doi': return { module: 'papers', label: `DOI yoxlanışı: ${s('doi')}` }
    case 'topic_trend': return { module: 'topics', label: `Trend: "${s('query')}"` }
    case 'start_job': return { module: 'core', label: `Arxa plan işi başladı: ${s('kind')}` }
    case 'WebSearch': return { module: 'core', label: `Veb axtarış: "${s('query')}"` }
    case 'WebFetch': return { module: 'core', label: `Səhifə oxunur: ${s('url').slice(0, 70)}` }
    default: return { module: 'core', label: n }
  }
}

export { todayISO }
