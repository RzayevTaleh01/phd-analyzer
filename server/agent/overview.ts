// Compact text snapshot of the whole board, given to Claude every turn.
import { CONDITION_BY_KEY } from '../../shared/criteria'
import { getProfile, list } from '../db'

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

  L.push('', `## TOPICS (${topics.length})`)
  for (const t of topics)
    L.push(`[T${t.id}] ${t.title} | P${t.priority} ${t.status} | keywords: ${t.keywords.join(', ')} | papers: ${papers.filter((x) => x.topicIds.includes(t.id)).length}, gaps: ${gaps.filter((g) => g.topicId === t.id).length}`)

  L.push('', `## UNIVERSITIES (${unis.length})`)
  for (const u of unis)
    L.push(
      `[U${u.id}] ${u.name} (${u.countryCode || u.country || '?'}) | status: ${u.status} | rank: ${u.rankLabel ?? '?'} | language test: ${u.langCert ?? 'unknown'}${u.langCertNote ? ` (${u.langCertNote.slice(0, 100)})` : ''} | openalex: ${u.openalexId ?? '-'} | researchers: ${researchers.filter((r) => r.universityId === u.id).length}${u.fitNote ? ` | fit: ${u.fitNote.slice(0, 140)}` : ''}${u.notes ? ` | notes: ${u.notes.slice(0, 120)}` : ''}`,
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
    L.push(`[R${r.id}] ${r.name} | ${uniName(r.universityId)} | h${r.hIndex ?? '?'} | topic works: ${r.topicWorks ?? '?'} | relevance ${r.relevance ?? '?'} | contact: ${r.status} | openalex: ${r.openalexId ?? '-'}`)

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

  return L.join('\n')
}
