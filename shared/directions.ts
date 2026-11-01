// Research direction groups (e.g. two sub-fields you are comparing): which board items belong to which group,
// the board filtered to one group, and the criteria used to compare groups.
import type { AppState, Direction, ID } from './types'

export const CRITERIA = [
  { key: 'personal_fit', label: 'Personal fit', hint: 'how well your experience, skills and education prepare you for this field', weight: 0.2 },
  { key: 'interest', label: 'Interest', hint: 'your own rating (1-5)', weight: 0.15 },
  { key: 'opportunities', label: 'PhD opportunities', hint: 'funded positions and programmes in your target countries', weight: 0.15 },
  { key: 'supervisors', label: 'Supervisors', hint: 'active, well-matched professors at your target universities', weight: 0.15 },
  { key: 'momentum', label: 'Field momentum', hint: 'publication trend, whether interest is growing or shrinking', weight: 0.1 },
  { key: 'novelty', label: 'Novelty potential', hint: 'open gaps and fresh angles', weight: 0.1 },
  { key: 'feasibility', label: 'Feasibility', hint: 'data, resources, finishing in 3-4 years', weight: 0.1 },
  { key: 'career', label: 'Career', hint: 'prospects in academia and industry', weight: 0.05 },
] as const

export type CriterionKey = (typeof CRITERIA)[number]['key']
export const CRITERION_KEYS = CRITERIA.map((c) => c.key) as CriterionKey[]

/** Interest 1-5 (the user's own rating) on the 0-10 scale of the other criteria. */
export const interestScore = (r?: number) => (r ? (r - 1) * 2.5 : undefined)

/** Weighted 0-10 score over the criteria that have a value; the user's interest rating wins over the AI's. */
export function overallScore(scores: Partial<Record<string, { score: number }>> | undefined, interest?: number): number | undefined {
  let sum = 0
  let w = 0
  for (const c of CRITERIA) {
    const v = c.key === 'interest' ? interestScore(interest) ?? scores?.interest?.score : scores?.[c.key]?.score
    if (v === undefined) continue
    sum += v * c.weight
    w += c.weight
  }
  return w ? Math.round((sum / w) * 10) / 10 : undefined
}

export const DIRECTION_COLORS = ['#2fd8ff', '#a594ff', '#45f0a4', '#ffb547', '#ff7ab6', '#93ecff']

// ---------- which items belong to which direction ----------

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** How many distinct keywords of the direction appear in a text. */
function scorer(d: Direction): (text: string) => number {
  const kws = d.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean)
  // Short keywords (NLP, HCI, LLM) must match as whole words.
  const tests = kws.map((k) => (k.length <= 4 ? ((t: string) => new RegExp(`\\b${esc(k)}\\b`, 'i').test(t)) : (t: string) => t.toLowerCase().includes(k)))
  return (text) => tests.filter((t) => t(text)).length
}

/** Directions whose score is close to the best one: hybrids land in both, clear cases in one. */
function dominant(scores: Map<ID, number>, ratio = 0.75): ID[] {
  const max = Math.max(0, ...scores.values())
  if (!max) return []
  return [...scores].filter(([, v]) => v >= max * ratio).map(([id]) => id)
}

const key = (coll: string, id: ID) => `${coll}:${id}`

export type Classified = (coll: string, id: ID) => ID[]

/**
 * Directions of every item. An item's own directionIds (set by the user or Talvis) always win.
 * Otherwise its own text decides (title, abstract, OpenAlex concepts, fit note): the directions with
 * the most keyword matches. Only when its text says nothing does it inherit from its topics.
 * Universities follow the researchers, groups and positions there.
 */
export function classify(s: AppState): Classified {
  const m = s.directions.map((d) => ({ id: d.id, score: scorer(d) }))
  const scoreText = (...parts: (string | undefined)[]) => {
    const text = parts.filter(Boolean).join(' \n ')
    return new Map(m.map((x) => [x.id, text ? x.score(text) : 0]))
  }
  const byText = (...parts: (string | undefined)[]) => dominant(scoreText(...parts))
  const out = new Map<string, ID[]>()
  const set = (coll: string, id: ID, dirs: ID[]) => out.set(key(coll, id), dirs)
  const get = (coll: string, id?: ID) => (id === undefined ? [] : out.get(key(coll, id)) ?? [])
  /** Votes of several classified items (e.g. a paper's topics, a university's researchers). */
  const vote = (lists: ID[][], ratio = 0.5) => {
    const c = new Map<ID, number>()
    for (const l of lists) for (const id of l) c.set(id, (c.get(id) ?? 0) + 1)
    return dominant(c, ratio)
  }
  const own = (explicit: ID[] | undefined, text: ID[], fallback: () => ID[]) => explicit ?? (text.length ? text : fallback())

  for (const t of s.topics) set('topics', t.id, t.directionIds ?? byText(t.title, t.description, t.keywords.join(', ')))
  const fromTopics = (ids: ID[]) => vote(ids.map((id) => get('topics', id)))
  for (const p of s.papers) set('papers', p.id, own(p.directionIds, byText(p.title, p.venue, p.abstract), () => fromTopics(p.topicIds)))
  for (const r of s.researchers) set('researchers', r.id, own(r.directionIds, byText(r.concepts.join(', '), r.position, r.notes), () => fromTopics(r.topicIds)))
  for (const g of s.groups) set('groups', g.id, own(g.directionIds, byText(g.name, g.description), () => fromTopics(g.topicIds)))
  for (const g of s.gaps) set('gaps', g.id, own(g.directionIds, byText(g.title, g.description), () => get('topics', g.topicId)))
  for (const v of s.venues) set('venues', v.id, v.directionIds ?? byText(v.name, v.reason))
  for (const p of s.positions) set('positions', p.id, p.directionIds ?? byText(p.title, p.field, p.summary))
  for (const u of s.universities) {
    const people = [
      ...s.researchers.filter((r) => r.universityId === u.id).map((r) => get('researchers', r.id)),
      ...s.groups.filter((g) => g.universityId === u.id).map((g) => get('groups', g.id)),
      ...s.positions.filter((p) => p.universityId === u.id).map((p) => get('positions', p.id)),
    ]
    // A university belongs to every direction with a real presence there (a third of the strongest one).
    set('universities', u.id, own(u.directionIds, people.length ? vote(people, 0.34) : [], () => byText(u.fitNote, u.notes)))
  }
  for (const i of s.insights) set('insights', i.id, i.universityId ? get('universities', i.universityId) : byText(i.subject, i.summary))
  for (const d of s.deadlines) set('deadlines', d.id, d.universityId ? get('universities', d.universityId) : byText(d.title, d.program, d.notes))
  return (coll, id) => out.get(key(coll, id)) ?? []
}

const RESEARCH_COLLS = ['topics', 'papers', 'researchers', 'groups', 'gaps', 'venues', 'positions', 'universities', 'insights'] as const

/** The board as seen inside one direction. Tasks, documents and unassigned deadlines stay visible. */
export function filterState(s: AppState, directionId: ID): AppState {
  const dirs = classify(s)
  const out = { ...s } as AppState
  for (const c of RESEARCH_COLLS) (out as unknown as Record<string, { id: ID }[]>)[c] = (s[c] as { id: ID }[]).filter((x) => dirs(c, x.id).includes(directionId))
  out.deadlines = s.deadlines.filter((d) => {
    const ds = dirs('deadlines', d.id)
    return ds.length === 0 || ds.includes(directionId)
  })
  return out
}

/** How many items of each kind a direction has. */
export function directionCounts(s: AppState, dirs = classify(s)) {
  return Object.fromEntries(
    s.directions.map((d) => [
      d.id,
      Object.fromEntries(RESEARCH_COLLS.map((c) => [c, (s[c] as { id: ID }[]).filter((x) => dirs(c, x.id).includes(d.id)).length])) as Record<(typeof RESEARCH_COLLS)[number], number>,
    ]),
  ) as Record<ID, Record<(typeof RESEARCH_COLLS)[number], number>>
}
