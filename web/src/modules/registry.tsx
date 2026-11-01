import type { FC } from 'react'
import {
  BriefcaseBusiness, CalendarClock, Compass, Fingerprint, FileStack, Landmark, Library, Lightbulb, ListChecks, MessagesSquare, Network, Radar, Rocket,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import type { AppState, ModuleKey } from '../../../shared/types'
import { daysUntil, todayISO } from '../lib/util'
import * as S from './summaries'

export interface ModuleDef {
  key: Exclude<ModuleKey, 'core'>
  idx: string
  title: string
  desc: string
  icon: LucideIcon
  accent: string
  Summary: FC<{ s: AppState }>
  count: (s: AppState) => number | string
  action: string
  /** The expanded panel takes the full board width. */
  wide?: boolean
}

export const MODULES: ModuleDef[] = [
  {
    key: 'profile', idx: 'M-01', title: 'Profile', desc: 'Research interests, countries, ranking, conditions - searches are based on these',
    icon: Fingerprint, accent: '#93ecff', Summary: S.ProfileSummary, count: () => '', action: 'Edit',
  },
  {
    key: 'directions', idx: 'M-14', title: 'Directions', desc: 'e.g. NLP, HCI, adaptive learning: which fits you best, compared with evidence',
    icon: Compass, accent: '#ffb547', Summary: S.DirectionsSummary, count: (s) => s.directions.length, action: 'Compare',
  },
  {
    key: 'universities', idx: 'M-02', title: 'Universities', desc: 'Your chosen universities and application status',
    icon: Landmark, accent: '#2fd8ff', Summary: S.UniversitiesSummary, count: (s) => s.universities.length, action: 'Add university', wide: true,
  },
  {
    key: 'positions', idx: 'M-12', title: 'PhD positions', desc: 'Real positions from PhDPortal, FindAPhD, EURAXESS, DAAD, jobs.ac.uk and other portals',
    icon: BriefcaseBusiness, accent: '#45f0a4', Summary: S.PositionsSummary,
    count: (s) => s.positions.filter((p) => p.status !== 'dismissed').length, action: 'Find positions',
  },
  {
    key: 'insights', idx: 'M-13', title: 'Student voice', desc: 'What students at a university say on Reddit: supervision, stipend, workload, life',
    icon: MessagesSquare, accent: '#a594ff', Summary: S.InsightsSummary, count: (s) => s.insights.length, action: 'Reddit analysis',
  },
  {
    key: 'deadlines', idx: 'M-03', title: 'Deadlines', desc: 'University, scholarship and conference deadlines (with source)',
    icon: CalendarClock, accent: '#ffb547', Summary: S.DeadlinesSummary,
    count: (s) => s.deadlines.filter((d) => d.status === 'open' && daysUntil(d.dueDate) >= 0).length, action: 'Verify from source',
  },
  {
    key: 'today', idx: 'M-04', title: 'Today', desc: 'What you need to do for your PhD today',
    icon: ListChecks, accent: '#45f0a4', Summary: S.TodaySummary,
    count: (s) => s.tasks.filter((t) => t.status !== 'done' && (!t.dueDate || t.dueDate <= todayISO())).length, action: 'Build AI plan',
  },
  {
    key: 'documents', idx: 'M-05', title: 'Documents', desc: 'SOP, CV, research proposal, emails to professors',
    icon: FileStack, accent: '#93ecff', Summary: S.DocumentsSummary, count: (s) => s.docs.length, action: 'New document',
  },
  {
    key: 'topics', idx: 'M-06', title: 'Topics', desc: 'Topics you are researching and keywords',
    icon: Lightbulb, accent: '#2fd8ff', Summary: S.TopicsSummary, count: (s) => s.topics.length, action: 'Add topic',
  },
  {
    key: 'groups', idx: 'M-07', title: 'Research groups', desc: 'Labs and groups matching your topics',
    icon: Network, accent: '#2fd8ff', Summary: S.GroupsSummary, count: (s) => s.groups.length, action: 'Find groups',
  },
  {
    key: 'researchers', idx: 'M-08', title: 'Researchers', desc: 'People working on your topics at your chosen universities',
    icon: UsersRound, accent: '#2fd8ff', Summary: S.ResearchersSummary, count: (s) => s.researchers.length, action: 'Scout',
  },
  {
    key: 'papers', idx: 'M-09', title: 'Papers', desc: 'Real papers: OpenAlex, Semantic Scholar, arXiv',
    icon: Library, accent: '#2fd8ff', Summary: S.PapersSummary, count: (s) => s.papers.length, action: 'Search papers',
  },
  {
    key: 'gaps', idx: 'M-10', title: 'Research gaps', desc: 'Gaps in the literature, with evidence papers',
    icon: Radar, accent: '#a594ff', Summary: S.GapsSummary, count: (s) => s.gaps.length, action: 'Gap analysis',
  },
  {
    key: 'publish', idx: 'M-11', title: 'Publish', desc: 'Where you can submit your paper: real journals and conferences',
    icon: Rocket, accent: '#45f0a4', Summary: S.PublishSummary, count: (s) => s.venues.length, action: 'Find journal',
  },
]

export const MODULE_BY_KEY = Object.fromEntries(MODULES.map((m) => [m.key, m])) as Record<ModuleDef['key'], ModuleDef>
