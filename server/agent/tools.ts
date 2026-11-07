import { createSdkMcpServer, tool, type SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { runAs } from '../ctx'
import { CONDITIONS } from '../../shared/criteria'
import type { ModuleKey } from '../../shared/types'
import { COLLS, COLL_MODULE, get, insert, list, logActivity, normUrl, remove, setProfile, setSettings, update, wasSeen, type Coll } from '../db'
import { readPage, usefulJsonLd } from '../browser/read'
import { findInPdf, pageIndexes, paperPdfCandidates, readPdf, type PdfDoc } from '../browser/pdf'
import { resolveUniversity, saveResearcher, savePaper, saveVenue, findPaper } from '../library'
import { dedupe, searchPapers } from '../research'
import * as oa from '../research/openalex'
import { PORTAL_KEYS, portalOf, searchPortals } from '../research/portals'
import { ACADEMIC_SUBS, findSubreddits, redditSearch, redditThread } from '../research/reddit'
import { flatTasks, planRef, syncBoard, TASK_TYPES, trdesk } from '../integrations/trdesk'
import { CRITERION_KEYS, DIRECTION_COLORS, overallScore } from '../../shared/directions'
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
  if (c === 'positions' && typeof out.summary === 'string') out.summary = (out.summary as string).slice(0, 200)
  if (c === 'insights' && Array.isArray(out.evidence)) out.evidence = `${(out.evidence as unknown[]).length} links`
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
const moduleEnum = z.enum(['today', 'deadlines', 'universities', 'topics', 'groups', 'researchers', 'papers', 'gaps', 'publish', 'documents', 'profile', 'positions', 'insights', 'directions'])
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
      directions: z.array(z.string()).optional().describe('the research interests the user typed, e.g. ["NLP", "HCI", "adaptive learning"]; Talvis groups them into direction groups'),
      rankingSystem: z.enum(['QS', 'THE', 'ARWU', 'any']).optional(),
      rankingMax: z.number().int().min(0).optional().describe('only universities in the top N of the ranking; 0 = no limit'),
      conditions: z.array(z.enum(CONDITIONS.map((c) => c.key) as [string, ...string[]])).optional(),
      conditionsNote: z.string().optional(),
      citizenship: z.string().optional(),
      education: z.string().optional().describe('previous degrees, institution and teaching language'),
    },
    safe(async (p) => {
      const prof = setProfile(p)
      logActivity('ai', 'profile', 'Profile updated')
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
      logActivity('ai', 'topics', `Topic added: ${topic.title}`)
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
      admitChance: z.number().int().min(0).max(100).optional().describe('estimated admission chance for this applicant, 0-100 (see set_admission_chance)'),
      admitNote: z.string().optional().describe('decisive factors behind admitChance, in the board language'),
      admitSource: z.string().optional().describe('URL of the official page or statistic the estimate leans on most'),
    },
    safe(async ({ name, ...extra }) => {
      if (extra.rankLabel && !extra.rankSource) return fail('rankLabel needs rankSource (ranking page URL)')
      if (extra.langCert && extra.langCert !== 'unknown' && !extra.langCertSource) return fail('langCert needs langCertSource (official requirements page URL)')
      if (extra.admitChance !== undefined && !extra.admitNote) return fail('admitChance needs admitNote (the factors behind the estimate)')
      const admitAt = extra.admitChance !== undefined ? new Date().toISOString() : undefined
      const u = await resolveUniversity(name, Object.fromEntries(Object.entries({ ...extra, admitAt }).filter(([, v]) => v !== undefined)))
      logActivity('ai', 'universities', `University: ${u.name}${u.rankLabel ? ` (${u.rankLabel})` : ''}`)
      return ok(u)
    }),
  ),

  tool(
    'set_admission_chance',
    "Save the estimated chance (0-100) that the user is admitted to a PhD at a board university, with the reasons. It is an estimate, not a fact: base it on the official requirements, published acceptance numbers, research fit, funding and the user's record. Bands: 0-19 very low, 20-39 low, 40-64 moderate, 65+ good.",
    {
      universityId: z.number().int(),
      chance: z.number().int().min(0).max(100),
      note: z.string().describe('3-5 lines in the board language: the decisive factors, published numbers with their year, what would raise the chance'),
      source: z.string().optional().describe('URL of the official page or statistic the estimate leans on most (must have appeared in a tool result)'),
    },
    safe(async ({ universityId, chance, note, source }) => {
      if (source && !wasSeen(source)) return fail('source url did not appear in any tool result; read the page first')
      // '' clears the source of an earlier estimate.
      const u = update('universities', universityId, { admitChance: chance, admitNote: note, admitSource: source ?? '', admitAt: new Date().toISOString() })
      if (!u) return fail(`university ${universityId} not found`)
      logActivity('ai', 'universities', `Admission chance: ${u.name} - ${chance}%`)
      return ok({ id: u.id, name: u.name, admitChance: chance })
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
      logActivity('ai', 'deadlines', `Deadline: ${saved.title} - ${saved.dueDate}${saved.verified ? ' (verified)' : ''}`)
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
      logActivity('ai', 'today', `Task: ${task.title}`)
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
      logActivity('ai', 'groups', `Research group: ${saved.name}`)
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
        logActivity('ai', 'researchers', `Researcher: ${researcher.name}`)
        return ok({ created, researcher })
      }
      if (!name) return fail('give openalexId or name')
      const r = insert('researchers', { name, ...extra, concepts: [], topicIds: extra.topicIds ?? [], status: 'new' })
      logActivity('ai', 'researchers', `Researcher: ${r.name}`)
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
      if (n) logActivity('ai', 'papers', `${n} papers added to the library`)
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
      logActivity('ai', 'publish', `Venue: ${v.name}`)
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
      logActivity('ai', 'documents', `Document: ${doc.title}`)
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
      logActivity('ai', COLL_MODULE[type], `Updated: ${type} #${id}`)
      return ok(compact(type, item as unknown as Record<string, unknown>))
    }),
  ),

  tool(
    'delete_item',
    'Delete a saved item. Only when the user explicitly asked for it.',
    { type: collEnum, id: z.number().int() },
    safe(async ({ type, id }) => {
      const okDel = remove(type, id)
      if (okDel) logActivity('ai', COLL_MODULE[type], `Deleted: ${type} #${id}`)
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

  // ---------- the web: any page, Reddit, PhD portals ----------
  tool(
    'browse_page',
    'Read a web page, with a real browser when needed (runs JavaScript, so SPAs, portals and dynamic lists work; WebFetch does not). Returns readable text, links (optionally filtered) and schema.org JSON-LD (job postings, programs). Use it when WebFetch returns little or nothing, for listing pages, and to read the exact wording of an official page.',
    {
      url: z.string(),
      mode: z
        .enum(['auto', 'browser', 'http'])
        .optional()
        .describe('auto (default): fast HTTP first, browser if the page looks like a JavaScript shell. Use browser for search/result/listing pages whose results load after the page (auto may return only filters and menus)'),
      waitFor: z.string().optional().describe('CSS selector to wait for (e.g. a results list)'),
      scroll: z.boolean().optional().describe('scroll to load lazy lists'),
      find: z.string().optional().describe('only return paragraphs containing any of these space-separated words (case-insensitive)'),
      linkFilter: z.string().optional().describe('only return links whose URL or text contains this'),
      maxChars: z.number().int().max(40000).optional(),
    },
    safe(async ({ url, mode, waitFor, scroll, find, linkFilter, maxChars }) => {
      const p = await readPage(url, { mode, waitFor, scroll })
      let text = p.text
      if (find) {
        const words = find.toLowerCase().split(/\s+/).filter(Boolean)
        const paras = text.split(/\n+/).filter((x) => words.some((w) => x.toLowerCase().includes(w)))
        text = paras.length ? paras.join('\n') : `(nothing matched "${find}"; full text follows)\n${text}`
      }
      const lim = maxChars ?? 12000
      const lf = linkFilter?.toLowerCase()
      const links = p.links.filter((l) => !lf || l.href.toLowerCase().includes(lf) || l.text.toLowerCase().includes(lf)).slice(0, lf ? 80 : 40)
      return ok({
        url: p.finalUrl,
        via: p.via,
        status: p.status,
        title: p.title,
        blocked: p.blocked ? `${p.blocked} - do not retry; use WebSearch results/snippets instead, or ask the user to open the page` : undefined,
        jsonld: usefulJsonLd(p.jsonld),
        text: text.length > lim ? `${text.slice(0, lim)}\n...(${text.length - lim} more chars; use find= to target a section)` : text,
        links,
      })
    }),
    ro,
  ),

  tool(
    'read_pdf',
    'Read a PDF from the web: a paper\'s full text, admission regulations, a call document. Give url, or paperId (board P id) to find the open-access PDF of a library paper automatically (OpenAlex locations, arXiv, the landing page\'s citation_pdf_url). Use find to get only the paragraphs you need (with page numbers), pages to read a range ("1-3,8"). Text layer only: scanned PDFs are reported as such.',
    {
      url: z.string().optional(),
      paperId: z.number().int().optional(),
      find: z.string().optional().describe('space-separated words; returns matching paragraphs with page numbers'),
      pages: z.string().optional().describe('e.g. "1-3" or "2,5-7"'),
      maxChars: z.number().int().max(60000).optional(),
    },
    safe(async ({ url, paperId, find, pages, maxChars }) => {
      if (!url && !paperId) return fail('give url or paperId')
      let doc: PdfDoc | undefined
      const tried: string[] = []
      if (url) doc = await readPdf(url)
      else {
        const c = await paperPdfCandidates(paperId!)
        for (const u of c.urls) {
          try {
            doc = await readPdf(u)
            break
          } catch (e) {
            tried.push(`${u}: ${(e as Error).message}`)
          }
        }
        if (!doc) return fail(`no readable open-access PDF found for P${paperId} "${c.title}". Tried: ${tried.join(' | ') || 'no PDF links known'}. Say the full text is not available and use the abstract.`)
      }
      const idx = pageIndexes(pages, doc.pages)
      const lim = maxChars ?? 15000
      const head = { url: doc.url, title: doc.title, author: doc.author, pages: doc.pages, scanned: doc.scanned || undefined, triedFirst: tried.length ? tried : undefined }
      if (find) {
        const hits = findInPdf(doc, find, idx)
        return ok({ ...head, matches: hits.length, paragraphs: hits.slice(0, 40), note: hits.length ? undefined : 'nothing matched; try other words or read pages' })
      }
      let text = idx.map((i) => `--- page ${i + 1} ---\n${doc!.text[i]}`).join('\n\n')
      if (text.length > lim) text = `${text.slice(0, lim)}\n...(${text.length - lim} more chars; use pages= or find=)`
      return ok({ ...head, text })
    }),
    ro,
  ),

  tool(
    'reddit_search',
    `Search Reddit posts (what students and PhD candidates say). Use quotes for exact names, e.g. "University of Tartu" PhD. subreddit narrows it (academic ones: ${ACADEMIC_SUBS.join(', ')}; universities often have their own, find it with find_subreddits). Posts are anecdotes: note the date and score.`,
    {
      query: z.string(),
      subreddit: z.string().optional(),
      sort: z.enum(['relevance', 'top', 'new', 'comments']).optional(),
      time: z.enum(['all', 'year', 'month', 'week']).optional(),
      limit: z.number().int().max(50).optional(),
    },
    safe(async (o) => {
      const r = await redditSearch({ ...o, limit: o.limit ?? 20 })
      return ok({ via: r.via, count: r.posts.length, note: r.via === 'rss' ? 'public RSS: no scores; Reddit allows few requests, so search deliberately' : undefined, posts: r.posts })
    }),
    ro,
  ),

  tool(
    'reddit_thread',
    'Read one Reddit thread: the post and its top comments (url from reddit_search).',
    { url: z.string(), limit: z.number().int().max(100).optional() },
    safe(async ({ url, limit }) => ok(await redditThread(url, limit ?? 40))),
    ro,
  ),

  tool('find_subreddits', "Find subreddits by name, e.g. a university's own subreddit or a city/country one.", { query: z.string() }, safe(async ({ query }) => ok(await findSubreddits(query))), ro),

  tool(
    'portal_search',
    `Search PhD positions/programs on portals (${PORTAL_KEYS.join(', ')}). Portals that allow it are searched directly and return listings; for the others (PhDPortal, FindAPhD, EURAXESS...) the result gives a webQuery to run with WebSearch, because they block automated search pages. Read promising listings with browse_page before saving.`,
    {
      query: z.string().describe('field in English, e.g. "natural language processing"'),
      portals: z.array(z.string()).optional(),
      country: z.string().optional(),
      limit: z.number().int().max(30).optional(),
    },
    safe(async (o) => ok(await searchPortals(o))),
    ro,
  ),

  tool(
    'save_position',
    'Save a PhD position / program / studentship. url must be a page that appeared in a tool result (portal_search, browse_page, WebSearch, WebFetch). Same url updates it. deadline only as published (YYYY-MM-DD).',
    {
      title: z.string(),
      url: z.string(),
      universityId: z.number().int().optional(),
      university: z.string().optional(),
      country: z.string().optional(),
      field: z.string().optional(),
      supervisor: z.string().optional(),
      funding: z.string().optional().describe('e.g. "fully funded, EUR 2,800/month", "self-funded"'),
      deadline: date.optional(),
      summary: z.string().optional(),
      status: z.enum(['found', 'shortlisted', 'applying', 'applied', 'dismissed']).optional(),
    },
    safe(async ({ url, ...p }) => {
      if (!wasSeen(url)) return fail('this url did not appear in any tool result; find it with portal_search, WebSearch or browse_page first')
      const uniId = p.universityId ?? (p.university ? list('universities').find((u) => u.name.toLowerCase() === p.university!.toLowerCase())?.id : undefined)
      const existing = list('positions').find((x) => normUrl(x.url) === normUrl(url))
      const data = { ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)), universityId: uniId, url, portal: portalOf(url) }
      const saved = existing ? update('positions', existing.id, data)! : insert('positions', { ...data, status: p.status ?? 'found', foundAt: new Date().toISOString() })
      logActivity('ai', 'positions', `PhD position: ${saved.title.slice(0, 80)}`)
      return ok(saved)
    }),
  ),

  tool(
    'add_insight',
    'Save an analysis of what students say about a university/program (student voice). Every evidence url must be a Reddit post/comment or page that appeared in a tool result. Quote or closely paraphrase; no evidence = no claim. Same subject + source replaces the earlier analysis.',
    {
      subject: z.string().describe('university or program name'),
      universityId: z.number().int().optional(),
      source: z.enum(['reddit', 'web', 'mixed']).optional(),
      summary: z.string().describe('3-6 sentences: the overall picture, in the board language'),
      sentiment: z.number().int().min(-2).max(2),
      themes: z.array(z.object({ theme: z.string(), tone: z.enum(['positive', 'negative', 'mixed']), note: z.string() })).min(1),
      evidence: z
        .array(z.object({ url: z.string(), title: z.string().optional(), quote: z.string(), subreddit: z.string().optional(), date: z.string().optional(), score: z.number().optional() }))
        .min(2),
      postsAnalyzed: z.number().int().min(1),
      caveats: z.string().optional(),
    },
    safe(async (a) => {
      const unseen = a.evidence.filter((e) => !wasSeen(e.url)).map((e) => e.url)
      if (unseen.length) return fail(`evidence urls not found in any tool result: ${unseen.join(', ')}. Use reddit_search / reddit_thread / browse_page first.`)
      const uniId = a.universityId ?? list('universities').find((u) => u.name.toLowerCase() === a.subject.toLowerCase())?.id
      const source = a.source ?? 'reddit'
      const existing = list('insights').find((x) => (uniId ? x.universityId === uniId : x.subject.toLowerCase() === a.subject.toLowerCase()) && x.source === source)
      const data = { ...a, universityId: uniId, source, createdAt: new Date().toISOString() }
      const saved = existing ? update('insights', existing.id, data)! : insert('insights', data)
      logActivity('ai', 'insights', `Student voice: ${saved.subject} (${saved.sentiment > 0 ? '+' : ''}${saved.sentiment})`)
      return ok({ id: saved.id, subject: saved.subject, evidence: saved.evidence.length })
    }),
  ),

  // ---------- research direction groups ----------
  tool(
    'save_direction',
    'Create or update a research direction group (e.g. Natural language processing, Human-computer interaction). keywords decide which board items fall into it automatically. Give id to update. Do not change the user\'s interest rating.',
    {
      id: z.number().int().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      keywords: z.array(z.string()).optional(),
      status: z.enum(['exploring', 'leaning', 'chosen', 'dropped']).optional(),
    },
    safe(async ({ id, ...d }) => {
      const patch = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined))
      if (id) {
        const saved = update('directions', id, patch)
        if (!saved) return fail(`direction ${id} not found`)
        logActivity('ai', 'directions', `Direction updated: ${saved.name}`)
        return ok(saved)
      }
      if (!d.name) return fail('name needed')
      const color = DIRECTION_COLORS[list('directions').length % DIRECTION_COLORS.length]
      const saved = insert('directions', { keywords: [], description: '', status: 'exploring', ...patch, name: d.name, color, createdAt: new Date().toISOString() })
      logActivity('ai', 'directions', `New direction: ${saved.name}`)
      return ok(saved)
    }),
  ),

  tool(
    'tag_directions',
    'Set which direction groups board items belong to, overriding the automatic grouping (e.g. a researcher who is really NLP). mode add (default) keeps existing groups, replace sets exactly these, clear returns the item to automatic grouping.',
    {
      directionIds: z.array(z.number().int()),
      items: z.array(z.object({ type: z.enum(['topics', 'universities', 'groups', 'researchers', 'papers', 'gaps', 'venues', 'positions']), id: z.number().int() })).min(1).max(60),
      mode: z.enum(['add', 'replace', 'clear']).optional(),
    },
    safe(async ({ directionIds, items: refs, mode }) => {
      const bad = directionIds.filter((d) => !get('directions', d))
      if (bad.length) return fail(`unknown direction ids: ${bad.join(', ')}`)
      const out: string[] = []
      for (const r of refs) {
        const cur = get(r.type, r.id) as { directionIds?: number[] } | undefined
        if (!cur) {
          out.push(`${r.type} ${r.id}: not found`)
          continue
        }
        const next = mode === 'clear' ? undefined : mode === 'replace' ? directionIds : [...new Set([...(cur.directionIds ?? []), ...directionIds])]
        update(r.type, r.id, { directionIds: next } as never)
        out.push(`${r.type} ${r.id}: ${next ? next.map((x) => `A${x}`).join(',') : 'automatic'}`)
      }
      logActivity('ai', 'directions', `${refs.length} items linked to directions`)
      return ok(out)
    }),
  ),

  tool(
    'save_direction_analysis',
    `Save the evidence-based fit analysis of one direction group. scores: 0-10 per criterion (${CRITERION_KEYS.join(', ')}), each with a one-line reason; skip interest when the user rated it. evidence refs are board ids (P12, R3, U9, J2, I1, X4...) or URLs from tool results.`,
    {
      directionId: z.number().int(),
      scores: z.record(z.enum(CRITERION_KEYS as [string, ...string[]]), z.object({ score: z.number().min(0).max(10), note: z.string() })),
      summary: z.string().describe('3-6 sentences in the board language'),
      strengths: z.array(z.string()).max(6),
      risks: z.array(z.string()).max(6),
      nextSteps: z.array(z.string()).max(6),
      evidence: z.array(z.object({ ref: z.string(), note: z.string() })).min(3).max(20),
    },
    safe(async ({ directionId, ...a }) => {
      const d = get('directions', directionId)
      if (!d) return fail(`direction ${directionId} not found`)
      const PREFIX: Record<string, Coll> = { T: 'topics', U: 'universities', G: 'groups', R: 'researchers', P: 'papers', X: 'gaps', V: 'venues', J: 'positions', I: 'insights', D: 'deadlines' }
      const badRefs = a.evidence
        .map((e) => e.ref.trim())
        .filter((ref) => {
          const m = ref.match(/^\[?([A-Z])(\d+)\]?$/)
          if (m) return !PREFIX[m[1]] || !get(PREFIX[m[1]], Number(m[2]))
          return !/^https?:\/\//.test(ref) || !wasSeen(ref)
        })
      if (badRefs.length) return fail(`evidence refs not on the board / not seen in tool results: ${badRefs.join(', ')}`)
      const analysis = { ...a, overall: overallScore(a.scores, d.interest), analyzedAt: new Date().toISOString() }
      update('directions', directionId, { analysis })
      logActivity('ai', 'directions', `Direction analysis: ${d.name} - ${analysis.overall ?? '?'}/10`)
      return ok({ direction: d.name, overall: analysis.overall })
    }),
  ),


  // ---------- TRDesk: the user's task manager ----------
  tool(
    'trdesk_plans',
    "List the user's TRDesk plans with status and progress (which plan is the default PhD plan is in Settings).",
    {},
    safe(async () => ok(await trdesk.plans())),
    ro,
  ),

  tool(
    'trdesk_plan',
    'Read a TRDesk plan: tasks by date with id, type, minutes, section, done date, and day notes. Defaults to the PhD plan. Use from/to (YYYY-MM-DD) or openOnly to keep it short.',
    { plan: z.string().optional().describe('plan id or name; default = PhD plan'), from: date.optional(), to: date.optional(), openOnly: z.boolean().optional() },
    safe(async ({ plan, from, to, openOnly }) => {
      const p = await trdesk.plan(planRef(plan))
      const tasks = flatTasks(p, { from, to, open: openOnly })
      const notes = p.weeks.flatMap((w) => w.days.filter((d) => d.note).map((d) => ({ dayId: d.id, idx: d.idx, note: d.note })))
      return ok({
        id: p.id, title: p.title, description: p.description, startDate: p.startDate, archived: p.archived,
        total: tasks.length,
        tasks: tasks.slice(0, 150).map((t) => ({ id: t.id, date: t.date, type: t.type, text: t.text, minutes: t.minutes || undefined, section: t.section || undefined, optional: t.optional || undefined, done: t.doneOn ?? undefined, hasContent: t.hasContent || undefined })),
        notes,
      })
    }),
    ro,
  ),

  tool(
    'trdesk_sync',
    'Mirror the board into the TRDesk PhD plan (creates the "PhD plan" if missing): open deadlines and dated board tasks become TRDesk tasks on their dates; completion syncs both ways. Never duplicates.',
    {},
    safe(async () => ok(await syncBoard())),
  ),

  tool(
    'trdesk_add_tasks',
    'Add tasks to a TRDesk plan on given dates (they show up in the TRDesk widget on that day).',
    {
      plan: z.string().optional(),
      tasks: z
        .array(
          z.object({
            text: z.string(),
            date: date.optional().describe('default today'),
            type: z.enum(TASK_TYPES).optional().describe('L lesson, R reading, C code, P paper, W writing, Q test, X review, S other'),
            minutes: z.number().int().min(0).max(6000).optional(),
            optional: z.boolean().optional(),
            section: z.string().optional(),
            content: z.string().optional().describe('Markdown page inside the task: steps, links, sources'),
          }),
        )
        .min(1)
        .max(40),
    },
    safe(async ({ plan, tasks }) => {
      const ref = planRef(plan)
      const out: { text: string; id?: string; error?: string }[] = []
      for (const t of tasks) {
        try {
          out.push({ text: t.text, id: (await trdesk.addTask(ref, t)).id })
        } catch (e) {
          out.push({ text: t.text, error: (e as Error).message })
        }
      }
      logActivity('ai', 'today', `TRDesk: ${out.filter((o) => o.id).length} tasks added`)
      return ok(out)
    }),
  ),

  tool(
    'trdesk_update_task',
    'Change a TRDesk task: text, type, minutes, section, content, optional, or move it to another date.',
    {
      plan: z.string().optional(),
      taskId: z.string(),
      text: z.string().optional(),
      date: date.optional(),
      type: z.enum(TASK_TYPES).optional(),
      minutes: z.number().int().min(0).max(6000).optional(),
      optional: z.boolean().optional(),
      section: z.string().optional(),
      content: z.string().optional(),
    },
    safe(async ({ plan, taskId, ...b }) => ok(await trdesk.updateTask(planRef(plan), taskId, b))),
  ),

  tool(
    'trdesk_task_done',
    'Mark a TRDesk task done (default today) or not done (done=false).',
    { plan: z.string().optional(), taskId: z.string(), done: z.boolean().optional(), doneOn: date.optional() },
    safe(async ({ plan, taskId, done, doneOn }) => ok(await trdesk.setDone(planRef(plan), taskId, done === false ? null : doneOn ?? todayISO()))),
  ),

  tool(
    'trdesk_delete_task',
    'Delete a TRDesk task. Only when the user explicitly asked for it.',
    { plan: z.string().optional(), taskId: z.string() },
    safe(async ({ plan, taskId }) => ok(await trdesk.deleteTask(planRef(plan), taskId))),
  ),

  tool(
    'trdesk_day_note',
    "Write the note of a plan day (e.g. today's summary or what to remember).",
    { plan: z.string().optional(), date: date, text: z.string() },
    safe(async ({ plan, date: d, text }) => {
      const p = await trdesk.plan(planRef(plan))
      const [y, m, dd] = p.startDate.split('-').map(Number)
      const idx = Math.round((new Date(`${d}T00:00:00`).getTime() - new Date(y, m - 1, dd).getTime()) / 86400000)
      // TRDesk creates a day when its first task is added.
      const day = p.weeks.flatMap((w) => w.days).find((x) => x.idx === idx)
      if (!day) return fail(`no day for ${d} in this plan yet; add a task on that date first`)
      return ok(await trdesk.dayNote(p.id, day.id, text))
    }),
  ),

  tool(
    'trdesk_manage_plan',
    'Create, rename/edit, archive/unarchive or delete a TRDesk plan. delete only when the user explicitly asked. With action=create and setDefault=true it becomes the plan Talvis uses.',
    {
      action: z.enum(['create', 'update', 'archive', 'unarchive', 'delete', 'set_default']),
      plan: z.string().optional().describe('id or name (not for create)'),
      title: z.string().optional(),
      description: z.string().optional(),
      startDate: date.optional(),
      color: z.enum(['emerald', 'blue', 'violet', 'rose', 'orange', 'amber', 'cyan', 'pink', 'lime', 'slate']).optional(),
      setDefault: z.boolean().optional(),
    },
    safe(async ({ action, plan, title, description, startDate, color, setDefault }) => {
      if (action === 'create') {
        if (!title) return fail('title needed')
        const r = await trdesk.createPlan({ title, description, startDate: startDate ?? todayISO(), color })
        if (setDefault) setSettings({ trdeskPlan: r.id })
        logActivity('ai', 'today', `TRDesk plan created: ${title}`)
        return ok(r)
      }
      if (!plan) return fail('plan needed')
      if (action === 'set_default') {
        const p = await trdesk.plan(plan)
        setSettings({ trdeskPlan: p.id })
        return ok({ default: p.title })
      }
      if (action === 'delete') return ok(await trdesk.deletePlan(plan))
      if (action === 'archive' || action === 'unarchive') return ok(await trdesk.updatePlan(plan, { archived: action === 'archive' }))
      return ok(await trdesk.updatePlan(plan, { title, description, startDate, color }))
    }),
  ),

  tool(
    'trdesk_agenda',
    'Tasks of all active TRDesk plans between two dates (max 70 days), to see the whole workload, not only PhD.',
    { from: date, to: date },
    safe(async ({ from, to }) => ok(await trdesk.agenda(from, to))),
    ro,
  ),


  // ---------- background jobs ----------
  tool(
    'start_job',
    'Start a long research job in the background (it fills the board on its own). kinds: setup_directions (group the profile research interests into direction groups, add starter topics, then start find_universities and direction_fit), find_universities (universities matching the profile criteria; optional note), gap_analysis (topicId), scout_university (universityId, optional topicIds), verify_deadlines (optional universityId), daily_plan, venue_match (title, abstract), student_voice (universityId, or note = university name: what students say on Reddit), portal_scan (PhD positions on portals for the profile; optional note, universityId), direction_fit (explore and score research direction groups to find the best fit; optional directionId for one, otherwise all), admission_chance (estimate the admission chance at the board universities; optional universityId for one).',
    {
      kind: z.enum(['find_universities', 'gap_analysis', 'scout_university', 'verify_deadlines', 'daily_plan', 'venue_match', 'student_voice', 'portal_scan', 'direction_fit', 'admission_chance', 'setup_directions']),
      directionId: z.number().int().optional(),
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

/** TRDesk tools are left out unless the optional integration has a key. */
/** The board tools for one chat or job; every call runs as user `uid`, whatever context the SDK calls the handler from. */
export function phdServer(withTrdesk: boolean, uid: number) {
  const base: SdkMcpToolDefinition<any>[] = withTrdesk ? phdTools : phdTools.filter((t) => !t.name.startsWith('trdesk_')) // eslint-disable-line @typescript-eslint/no-explicit-any
  const tools = base.map((t) => ({ ...t, handler: (args: Parameters<typeof t.handler>[0], extra: unknown) => runAs(uid, () => t.handler(args, extra)) }))
  return createSdkMcpServer({ name: 'phd', version: '0.1.0', tools })
}


// ---------- UI metadata: which module a tool touches, and a readable label ----------

export function toolMeta(name: string, input: Record<string, unknown>): { module: ModuleKey; label: string } {
  const n = name.replace(/^mcp__phd__/, '')
  const s = (k: string) => (input[k] === undefined ? '' : String(input[k]))
  const typeModule = (): ModuleKey => (COLL_MODULE as Record<string, ModuleKey>)[s('type')] ?? 'core'
  switch (n) {
    case 'get_overview': return { module: 'core', label: 'Read board state' }
    case 'list_items': return { module: typeModule(), label: `List: ${s('type')}${input.query ? ` "${s('query')}"` : ''}` }
    case 'get_item': return { module: typeModule(), label: `Read: ${s('type')} #${s('id')}` }
    case 'save_profile': return { module: 'profile', label: 'Profile updated' }
    case 'add_topic': return { module: 'topics', label: `Topic: ${s('title')}` }
    case 'add_university': return { module: 'universities', label: `University: ${s('name')}` }
    case 'set_admission_chance': return { module: 'universities', label: `Admission chance: U${s('universityId')} - ${s('chance')}%` }
    case 'add_deadline': return { module: 'deadlines', label: `Deadline: ${s('title')} (${s('dueDate')})` }
    case 'add_task': return { module: 'today', label: `Task: ${s('title')}` }
    case 'add_group': return { module: 'groups', label: `Research group: ${s('name')}` }
    case 'add_researcher': return { module: 'researchers', label: `Saving researcher ${s('name') || s('openalexId')}` }
    case 'save_papers': return { module: 'papers', label: `${(input.items as unknown[] | undefined)?.length ?? 0} papers being saved` }
    case 'add_gap': return { module: 'gaps', label: `Research gap: ${s('title')}` }
    case 'add_venue': return { module: 'publish', label: `Venue: ${s('name')}` }
    case 'save_document': return { module: 'documents', label: `Document: ${s('title')}` }
    case 'update_item': return { module: typeModule(), label: `Update: ${s('type')} #${s('id')}` }
    case 'delete_item': return { module: typeModule(), label: `Delete: ${s('type')} #${s('id')}` }
    case 'search_papers': return { module: 'papers', label: `Paper search (${s('source') || 'openalex'}): "${s('query')}"` }
    case 'paper_details': return { module: 'papers', label: `Paper details: ${s('openalexId') || s('doi') || s('arxivId') || s('s2Id')}` }
    case 'related_papers': return { module: 'papers', label: `Citation network (${s('direction')})` }
    case 'find_institution': return { module: 'universities', label: `OpenAlex: "${s('name')}"` }
    case 'find_researchers_at': return { module: 'researchers', label: `Researchers on "${s('query')}" (${s('institutionId')})` }
    case 'search_authors': return { module: 'researchers', label: `Author search: ${s('name')}` }
    case 'researcher_works': return { module: 'researchers', label: `Researcher's papers ${s('openalexId')}` }
    case 'find_venues': return { module: 'publish', label: `Journal/conference search: "${s('query')}"` }
    case 'verify_doi': return { module: 'papers', label: `DOI check: ${s('doi')}` }
    case 'topic_trend': return { module: 'topics', label: `Trend: "${s('query')}"` }
    case 'read_pdf': return { module: input.paperId ? 'papers' : 'core', label: input.paperId ? `Reading PDF: P${s('paperId')}${input.find ? ` ("${s('find')}")` : ''}` : `Reading PDF: ${s('url').slice(0, 70)}` }
    case 'browse_page': return { module: 'core', label: `Browser: ${s('url').slice(0, 70)}` }
    case 'reddit_search': return { module: 'insights', label: `Reddit: "${s('query')}"${input.subreddit ? ` r/${s('subreddit')}` : ''}` }
    case 'reddit_thread': return { module: 'insights', label: 'Reading Reddit thread' }
    case 'find_subreddits': return { module: 'insights', label: `Subreddit search: "${s('query')}"` }
    case 'portal_search': return { module: 'positions', label: `PhD portals: "${s('query')}"` }
    case 'save_position': return { module: 'positions', label: `PhD position: ${s('title').slice(0, 60)}` }
    case 'add_insight': return { module: 'insights', label: `Student voice: ${s('subject')}` }
    case 'save_direction': return { module: 'directions', label: `Direction: ${s('name') || `A${s('id')}`}` }
    case 'tag_directions': return { module: 'directions', label: `${(input.items as unknown[] | undefined)?.length ?? 0} items being linked to directions` }
    case 'save_direction_analysis': return { module: 'directions', label: `Direction analysis: A${s('directionId')}` }
    case 'trdesk_plans': return { module: 'today', label: 'TRDesk: plans' }
    case 'trdesk_plan': return { module: 'today', label: `TRDesk: reading ${s('plan') || 'PhD plan'}` }
    case 'trdesk_sync': return { module: 'today', label: 'TRDesk: syncing the board' }
    case 'trdesk_add_tasks': return { module: 'today', label: `TRDesk: ${(input.tasks as unknown[] | undefined)?.length ?? 0} tasks being added` }
    case 'trdesk_update_task': return { module: 'today', label: `TRDesk: updating task` }
    case 'trdesk_task_done': return { module: 'today', label: `TRDesk: ${input.done === false ? 'reopening' : 'completing'} task` }
    case 'trdesk_delete_task': return { module: 'today', label: 'TRDesk: deleting task' }
    case 'trdesk_day_note': return { module: 'today', label: `TRDesk: note for ${s('date')}` }
    case 'trdesk_manage_plan': return { module: 'today', label: `TRDesk plan: ${s('action')} ${s('title') || s('plan')}` }
    case 'trdesk_agenda': return { module: 'today', label: `TRDesk agenda ${s('from')}` }
    case 'start_job': return { module: 'core', label: `Background job started: ${s('kind')}` }
    case 'WebSearch': return { module: 'core', label: `Web search: "${s('query')}"` }
    case 'WebFetch': return { module: 'core', label: `Reading page: ${s('url').slice(0, 70)}` }
    default: return { module: 'core', label: n }
  }
}

export { todayISO }
