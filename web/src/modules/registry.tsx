import {
  BriefcaseBusiness, CalendarClock, Compass, Fingerprint, FileStack, Landmark, Library, Lightbulb, ListChecks, MessagesSquare, Network, Radar, Rocket,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { admitBand, byAdmitChance, CONDITION_BY_KEY, rankingLabel } from '../../../shared/criteria'
import { overallScore } from '../../../shared/directions'
import type { AppState, ModuleKey } from '../../../shared/types'
import type { ViewMode } from '../store'
import type { Tone } from '../ui/kit'
import { daysUntil, statusLabel, todayISO } from '../lib/util'

/** One line on a module card: a label and a coloured pill. */
export interface Row { a: string; b: string; tone: Tone; title?: string }

export interface ModuleDef {
  key: Exclude<ModuleKey, 'core'>
  title: string
  desc: string
  icon: LucideIcon
  accent: string
  rows: (s: AppState) => Row[]
  empty: string
  count: (s: AppState) => number | string
  action: string
  /** Modules with a page of their own open it; the rest open the panel. */
  page?: ViewMode
  /** The expanded panel takes the full board width. */
  wide?: boolean
}

const uniName = (s: AppState, id?: number) => s.universities.find((u) => u.id === id)?.name
const short = (t: string, n = 26) => (t.length > n ? `${t.slice(0, n - 1)}…` : t)
const days = (n: number) => (n === 0 ? 'today' : n === 1 ? '1 day' : `${n} days`)
const dueTone = (n: number): Tone => (n <= 14 ? 'r' : n <= 30 ? 'a' : 'n')
const bandTone = (c: number): Tone => ({ green: 'g', cyan: 'b', amber: 'a', red: 'r' } as Record<string, Tone>)[admitBand(c).tone] ?? 'n'
const STATUS_TONE: Record<string, Tone> = {
  done: 'g', doing: 'a', todo: 'n', to_read: 'a', reading: 'b', read: 'g', key: 'g',
  selected: 'g', shortlisted: 'g', candidate: 'a', discarded: 'n', final: 'g', review: 'b', draft: 'a',
  accepted: 'g', submitted: 'b', suggested: 'n', rejected: 'r', applying: 'a', applied: 'b', found: 'n',
}

export const MODULES: ModuleDef[] = [
  {
    key: 'profile', title: 'Profile', desc: 'Interests, countries, ranking and conditions', icon: Fingerprint, accent: '#0e7490',
    action: 'Edit', count: () => '', empty: 'Your profile is empty. Add your interests and target countries.',
    rows: (s) => {
      const p = s.profile
      if (!p.directions.length && !p.countries.length && !p.conditions.length) return []
      return [
        { a: p.directions.join(', ') || 'No interests yet', b: `${p.directions.length} interests`, tone: 'n' },
        { a: p.countries.join(', ') || 'Anywhere', b: rankingLabel(p.rankingSystem, p.rankingMax), tone: 'b' },
        { a: p.conditions.map((k) => CONDITION_BY_KEY[k]?.short ?? k).join(' · ') || 'No conditions', b: `${p.conditions.length} rules`, tone: 'g' },
      ]
    },
  },
  {
    key: 'universities', title: 'Universities', desc: 'Your list, status and admission chance', icon: Landmark, accent: '#1d4ed8', page: 'universities',
    action: 'Add university', count: (s) => s.universities.length, empty: 'No universities yet. Talvis can find ones that match your criteria.',
    rows: (s) => [...s.universities].sort(byAdmitChance).slice(0, 3).map((u) => (
      u.admitChance !== undefined ? { a: u.name, b: `${u.admitChance}%`, tone: bandTone(u.admitChance) } : { a: u.name, b: statusLabel(u.status), tone: 'n' }
    )),
    wide: true,
  },
  {
    key: 'deadlines', title: 'Deadlines', desc: 'Read from official pages, with source', icon: CalendarClock, accent: '#b45309',
    action: 'Verify from source', empty: 'No open deadlines.',
    count: (s) => s.deadlines.filter((d) => d.status === 'open' && daysUntil(d.dueDate) >= 0).length,
    rows: (s) => s.deadlines.filter((d) => d.status === 'open' && daysUntil(d.dueDate) >= 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 3).map((d) => {
      const n = daysUntil(d.dueDate)
      const uni = uniName(s, d.universityId)
      return { a: uni ? `${uni} · ${d.title}` : d.title, b: days(n), tone: dueTone(n), title: d.verified ? 'Verified on the official page' : 'Not verified yet' }
    }),
  },
  {
    key: 'today', title: 'Today', desc: 'Built from deadlines, tasks and unread papers', icon: ListChecks, accent: '#15803d',
    action: 'Build AI plan', empty: 'Nothing planned for today.',
    count: (s) => s.tasks.filter((t) => t.status !== 'done' && (!t.dueDate || t.dueDate <= todayISO())).length,
    rows: (s) => {
      const today = todayISO()
      return s.tasks.filter((t) => !t.dueDate || t.dueDate <= today)
        .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || a.priority - b.priority)
        .slice(0, 3).map((t) => ({ a: t.title, b: statusLabel(t.status).toLowerCase(), tone: STATUS_TONE[t.status] ?? 'n' }))
    },
  },
  {
    key: 'directions', title: 'Directions', desc: 'Which fits you best, compared with evidence', icon: Compass, accent: '#b45309', page: 'directions',
    action: 'Compare', count: (s) => s.directions.length, empty: 'No directions yet. Type your interests and Talvis groups them.',
    rows: (s) => s.directions.map((d) => ({ d, sc: overallScore(d.analysis?.scores, d.interest) }))
      .sort((x, y) => (y.sc ?? -1) - (x.sc ?? -1)).slice(0, 3)
      .map(({ d, sc }) => ({ a: d.name, b: sc !== undefined ? String(sc) : 'not compared', tone: sc === undefined ? 'n' : sc >= 7.5 ? 'g' : sc >= 6 ? 'a' : 'n' })),
  },
  {
    key: 'positions', title: 'PhD positions', desc: 'DAAD, FindAPhD, EURAXESS, jobs.ac.uk…', icon: BriefcaseBusiness, accent: '#15803d',
    action: 'Find positions', empty: 'No positions found yet.',
    count: (s) => s.positions.filter((p) => p.status !== 'dismissed').length,
    rows: (s) => s.positions.filter((p) => p.status !== 'dismissed').slice(0, 3).map((p) => {
      const n = p.deadline && /^\d{4}-\d{2}-\d{2}$/.test(p.deadline) ? daysUntil(p.deadline) : undefined
      if (n !== undefined && n >= 0) return { a: p.title, b: days(n), tone: dueTone(n) }
      return p.funding ? { a: p.title, b: 'funded', tone: 'g', title: p.funding } : { a: p.title, b: statusLabel(p.status).toLowerCase(), tone: 'n' }
    }),
  },
  {
    key: 'researchers', title: 'Researchers', desc: 'People publishing on your topic', icon: UsersRound, accent: '#1d4ed8',
    action: 'Scout', count: (s) => s.researchers.length, empty: 'No researchers yet. Scout a university to find them.',
    rows: (s) => [...s.researchers].sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0) || (b.hIndex ?? 0) - (a.hIndex ?? 0)).slice(0, 3).map((r) => {
      const uni = uniName(s, r.universityId)
      return { a: uni ? `${r.name} · ${short(uni, 18)}` : r.name, b: r.hIndex !== undefined ? `h ${r.hIndex}` : statusLabel(r.status), tone: 'b' }
    }),
  },
  {
    key: 'papers', title: 'Papers', desc: 'OpenAlex, Semantic Scholar, arXiv', icon: Library, accent: '#1d4ed8', page: 'library',
    action: 'Search papers', count: (s) => s.papers.length, empty: 'Your library is empty.',
    rows: (s) => [...s.papers].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 3)
      .map((p) => ({ a: p.title, b: p.status === 'to_read' ? 'unread' : statusLabel(p.status).toLowerCase(), tone: STATUS_TONE[p.status] ?? 'n' })),
  },
  {
    key: 'gaps', title: 'Research gaps', desc: 'Gaps with evidence papers, tested against counter-evidence', icon: Radar, accent: '#6d28d9', page: 'library',
    action: 'Gap analysis', count: (s) => s.gaps.length, empty: 'No research gaps yet.',
    rows: (s) => s.gaps.filter((g) => g.status !== 'discarded').slice(0, 3)
      .map((g) => ({ a: g.title, b: statusLabel(g.status).toLowerCase(), tone: STATUS_TONE[g.status] ?? 'n' })),
  },
  {
    key: 'topics', title: 'Topics', desc: 'Topics and keywords you follow', icon: Lightbulb, accent: '#1d4ed8',
    action: 'Add topic', count: (s) => s.topics.length, empty: 'No topics yet.',
    rows: (s) => [...s.topics].sort((a, b) => a.priority - b.priority).slice(0, 3)
      .map((t) => ({ a: t.title, b: `P${t.priority}`, tone: t.priority === 1 ? 'r' : t.priority === 2 ? 'a' : 'n' })),
  },
  {
    key: 'groups', title: 'Research groups', desc: 'Labs matching your topics', icon: Network, accent: '#0e7490',
    action: 'Find groups', count: (s) => s.groups.length, empty: 'No research groups yet.',
    rows: (s) => s.groups.slice(0, 3).map((g) => ({ a: g.name, b: short(uniName(s, g.universityId) ?? 'group', 16), tone: 'n' })),
  },
  {
    key: 'insights', title: 'Student voice', desc: 'What students say on Reddit, with quotes', icon: MessagesSquare, accent: '#6d28d9',
    action: 'Reddit analysis', count: (s) => s.insights.length, empty: 'No student analysis yet.',
    rows: (s) => s.insights.slice(0, 3).map((i) => {
      const t = i.themes[0]
      const tone: Tone = i.sentiment > 0.3 ? 'g' : i.sentiment < -0.3 ? 'r' : 'a'
      return { a: t ? `${uniName(s, i.universityId) ?? i.subject} · ${t.theme}` : uniName(s, i.universityId) ?? i.subject, b: i.sentiment > 0.3 ? 'positive' : i.sentiment < -0.3 ? 'negative' : 'mixed', tone }
    }),
  },
  {
    key: 'documents', title: 'Documents', desc: 'SOP, CV, proposal, emails to professors', icon: FileStack, accent: '#0e7490',
    action: 'New document', count: (s) => s.docs.length, empty: 'No documents yet.',
    rows: (s) => [...s.docs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3)
      .map((d) => ({ a: d.title, b: statusLabel(d.status).toLowerCase(), tone: STATUS_TONE[d.status] ?? 'n' })),
  },
  {
    key: 'publish', title: 'Publish', desc: 'Real journals and conferences, predatory warnings', icon: Rocket, accent: '#15803d',
    action: 'Find journal', count: (s) => s.venues.length, empty: 'No journals or conferences yet.',
    rows: (s) => [...s.venues].sort((a, b) => (b.fit ?? 0) - (a.fit ?? 0)).slice(0, 3).map((v) => (
      v.isOa && !v.inDoaj && v.apcUsd ? { a: v.name, b: 'check', tone: 'r', title: 'Open access with APC but not in DOAJ' }
        : { a: v.name, b: v.hIndex !== undefined ? `h ${v.hIndex}` : statusLabel(v.status).toLowerCase(), tone: STATUS_TONE[v.status] ?? 'g' }
    )),
  },
]

export const MODULE_BY_KEY = Object.fromEntries(MODULES.map((m) => [m.key, m])) as Record<ModuleDef['key'], ModuleDef>
export const moduleNo = (k: ModuleDef['key']) => String(MODULES.findIndex((m) => m.key === k) + 1).padStart(2, '0')
