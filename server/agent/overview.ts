// Compact text snapshot of the whole board, given to Claude every turn.
import { CONDITION_BY_KEY } from '../../shared/criteria'
import { classify, CRITERIA, directionCounts, overallScore } from '../../shared/directions'
import { getProfile, getState, list } from '../db'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function days(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date()
  return Math.round((new Date(y, m - 1, d).getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) / 86400000)
}

export function buildOverview(): string {
  const p = getProfile()
  const topics = list('topics')
  const unis = list('universities')
  const groups = list('groups')
  const researchers = list('researchers')
  const papers = list('papers')
  const deadlines = list('deadlines')
  const tasks = list('tasks')
  const gaps = list('gaps')
  const venues = list('venues')
  const docs = list('docs')
  const positions = list('positions')
  const insights = list('insights')
  const today = todayISO()
  const uniName = (id?: number) => (id ? unis.find((u) => u.id === id)?.name ?? `U${id}` : '-')
  const L: string[] = []

  L.push(`TODAY: ${today} (${WEEKDAYS[new Date().getDay()]})`)
  L.push('')
  L.push('## PROFILE')
  if (!p.name && !p.field && !p.interests && !p.directions.length) L.push('(empty - ask the user about their field, stage, target countries and interests, then save_profile)')
  else {
    L.push(`name: ${p.name || '-'} | field: ${p.field || '-'} | stage: ${p.stage || '-'} | target intake: ${p.targetTerm || '-'}`)
    L.push(`citizenship: ${p.citizenship || '-'} | languages: ${p.languages || '-'}`)
    if (p.education) L.push(`education: ${p.education}`)
    L.push(`interests: ${p.interests || '-'}`)
    if (p.background) L.push(`background: ${p.background}`)
  }
  L.push('', '## UNIVERSITY SEARCH CRITERIA (hard filters unless the user says otherwise)')
  L.push(`research directions: ${p.directions.join('; ') || '-'}`)
  L.push(`target countries: ${p.countries.join(', ') || 'any'}`)
  L.push(`ranking: ${p.rankingMax ? `${p.rankingSystem && p.rankingSystem !== 'any' ? p.rankingSystem : 'any major ranking (QS/THE/ARWU)'} top ${p.rankingMax}` : 'no limit'}`)
  const conds = p.conditions.map((k) => CONDITION_BY_KEY[k]).filter(Boolean)
  L.push(`conditions: ${conds.length ? conds.map((c) => `[${c.key}] ${c.check}`).join(' ') : '-'}`)
  if (p.conditionsNote) L.push(`extra conditions: ${p.conditionsNote}`)

  const st = getState([])
  const cls = classify(st)
  const dirs = st.directions
  const dTag = (coll: string, id: number) => {
    const ids = cls(coll, id)
    return ids.length ? ` | dir: ${ids.map((x) => `A${x}`).join(',')}` : ''
  }
  const counts = directionCounts(st, cls)
  L.push('', `## RESEARCH DIRECTION GROUPS (${dirs.length}; the user is weighing them to choose one; A-ids)`)
  for (const d of dirs) {
    const c = counts[d.id]
    const sc = d.analysis ? ` | analysis ${d.analysis.analyzedAt.slice(0, 10)}: overall ${overallScore(d.analysis.scores, d.interest) ?? '?'}/10 (${CRITERIA.map((k) => `${k.key} ${k.key === 'interest' && d.interest ? `${d.interest}/5 user` : d.analysis!.scores[k.key]?.score ?? '-'}`).join(', ')})` : ' | not analysed yet'
    L.push(`[A${d.id}] ${d.name} | ${d.status} | user interest ${d.interest ? `${d.interest}/5` : 'not rated'} | keywords: ${d.keywords.slice(0, 12).join(', ')} | items: topics ${c.topics}, papers ${c.papers}, researchers ${c.researchers}, universities ${c.universities}, positions ${c.positions}, gaps ${c.gaps}${sc}`)
  }

  L.push('', `## TOPICS (${topics.length})`)
  for (const t of topics)
    L.push(`[T${t.id}]${dTag('topics', t.id)} | ${t.title} | P${t.priority} ${t.status} | keywords: ${t.keywords.join(', ')} | papers: ${papers.filter((x) => x.topicIds.includes(t.id)).length}, gaps: ${gaps.filter((g) => g.topicId === t.id).length}`)

  L.push('', `## UNIVERSITIES (${unis.length})`)
  for (const u of unis)
    L.push(
      `[U${u.id}] ${u.name} (${u.countryCode || u.country || '?'})${dTag('universities', u.id)} | status: ${u.status} | rank: ${u.rankLabel ?? '?'} | admission chance: ${u.admitChance !== undefined ? `${u.admitChance}% (estimate ${u.admitAt?.slice(0, 10) ?? ''})` : 'not estimated'} | language test: ${u.langCert ?? 'unknown'}${u.langCertNote ? ` (${u.langCertNote.slice(0, 100)})` : ''} | openalex: ${u.openalexId ?? '-'} | researchers: ${researchers.filter((r) => r.universityId === u.id).length}${u.fitNote ? ` | fit: ${u.fitNote.slice(0, 140)}` : ''}${u.notes ? ` | notes: ${u.notes.slice(0, 120)}` : ''}`,
    )

  const open = deadlines.filter((d) => d.status === 'open').sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  L.push('', `## OPEN DEADLINES (${open.length})`)
  for (const d of open)
    L.push(`[D${d.id}] ${d.dueDate} (${days(d.dueDate)} days) | ${d.title} | ${d.kind} | ${uniName(d.universityId)}${d.program ? ` / ${d.program}` : ''} | ${d.verified ? `verified ${d.verifiedAt?.slice(0, 10) ?? ''}` : 'NOT verified'}${d.sourceUrl ? ` | ${d.sourceUrl}` : ''}`)

  const active = tasks.filter((t) => t.status !== 'done')
  L.push('', `## OPEN TASKS (${active.length}; done today: ${tasks.filter((t) => t.status === 'done' && t.dueDate === today).length})`)
  for (const t of active.sort((a, b) => (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9')).slice(0, 30))
    L.push(`[K${t.id}] ${t.status} P${t.priority} | due ${t.dueDate ?? '-'} | ${t.title}`)

  L.push('', `## RESEARCHERS (${researchers.length})`)
  for (const r of [...researchers].sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0)).slice(0, 40))
    L.push(`[R${r.id}] ${r.name}${dTag('researchers', r.id)} | ${uniName(r.universityId)} | h${r.hIndex ?? '?'} | topic works: ${r.topicWorks ?? '?'} | relevance ${r.relevance ?? '?'} | contact: ${r.status} | openalex: ${r.openalexId ?? '-'}`)

  L.push('', `## GROUPS (${groups.length})`)
  for (const g of groups) L.push(`[G${g.id}] ${g.name} | ${uniName(g.universityId)} | PI: ${g.piName ?? '-'}${g.url ? ` | ${g.url}` : ''}`)

  const cnt = (s: string) => papers.filter((x) => x.status === s).length
  L.push('', `## PAPERS (${papers.length}: to_read ${cnt('to_read')}, reading ${cnt('reading')}, read ${cnt('read')}, key ${cnt('key')})`)
  const shown = [...papers].sort((a, b) => Number(b.status === 'key') - Number(a.status === 'key') || (b.citedBy ?? 0) - (a.citedBy ?? 0)).slice(0, 40)
  for (const x of shown) L.push(`[P${x.id}] ${x.title} (${x.year ?? '?'}, ${x.venue ?? '?'}) | cites ${x.citedBy ?? 0} | ${x.status}${x.doi ? ` | doi:${x.doi}` : ''}`)
  if (papers.length > shown.length) L.push(`(+${papers.length - shown.length} more: use list_items type=papers)`)

  L.push('', `## RESEARCH GAPS (${gaps.length})`)
  for (const g of gaps) L.push(`[X${g.id}] ${g.title} | T${g.topicId ?? '-'} | novelty ${g.novelty}/5 feasibility ${g.feasibility}/5 | ${g.status} | evidence: ${g.evidence.map((e) => (e.paperId ? `P${e.paperId}` : e.ref)).join(', ')}`)

  L.push('', `## VENUES (${venues.length})`)
  for (const v of venues) L.push(`[V${v.id}] ${v.name} | ${v.type} | h${v.hIndex ?? '?'} | OA ${v.isOa ? 'yes' : 'no'} | DOAJ ${v.inDoaj ? 'yes' : 'no'} | APC ${v.apcUsd ?? '?'} | fit ${v.fit ?? '?'} | ${v.status}`)

  L.push('', `## DOCUMENTS (${docs.length})`)
  for (const d of docs) L.push(`[S${d.id}] ${d.title} | ${d.kind} | ${d.status} | ${d.content.length} chars${d.universityId ? ` | ${uniName(d.universityId)}` : ''}`)

  const openPos = positions.filter((x) => x.status !== 'dismissed')
  L.push('', `## PHD POSITIONS (${openPos.length} open of ${positions.length})`)
  for (const x of openPos.slice(0, 30))
    L.push(`[J${x.id}] ${x.title.slice(0, 110)} | ${x.universityId ? uniName(x.universityId) : x.university ?? '?'}${x.country ? ` (${x.country})` : ''} | ${x.portal} | ${x.status}${x.deadline ? ` | deadline ${x.deadline} (${days(x.deadline)} days)` : ''}${x.funding ? ` | ${x.funding.slice(0, 60)}` : ''} | ${x.url}`)

  L.push('', `## STUDENT VOICE (${insights.length})`)
  for (const i of insights)
    L.push(`[I${i.id}] ${i.subject}${i.universityId ? ` (U${i.universityId})` : ''} | ${i.source} | sentiment ${i.sentiment > 0 ? '+' : ''}${i.sentiment} | ${i.postsAnalyzed} posts | ${i.createdAt.slice(0, 10)} | themes: ${i.themes.map((t) => `${t.theme} (${t.tone})`).join(', ').slice(0, 220)}`)

  return L.join('\n')
}
