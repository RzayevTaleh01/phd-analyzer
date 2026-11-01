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
    key: 'profile', idx: 'M-01', title: 'Profil', desc: 'İstiqamətlər, ölkələr, reytinq, şərtlər - axtarış buna görə gedir',
    icon: Fingerprint, accent: '#93ecff', Summary: S.ProfileSummary, count: () => '', action: 'Redaktə',
  },
  {
    key: 'directions', idx: 'M-14', title: 'İstiqamətlər', desc: 'NLP, Adaptive learning və s.: hansı sənə daha uyğundur - sübutla müqayisə',
    icon: Compass, accent: '#ffb547', Summary: S.DirectionsSummary, count: (s) => s.directions.length, action: 'Müqayisə et',
  },
  {
    key: 'universities', idx: 'M-02', title: 'Universitetlər', desc: 'Seçdiyin universitetlər və müraciət statusu',
    icon: Landmark, accent: '#2fd8ff', Summary: S.UniversitiesSummary, count: (s) => s.universities.length, action: 'Universitet əlavə et', wide: true,
  },
  {
    key: 'positions', idx: 'M-12', title: 'PhD elanları', desc: 'PhDPortal, FindAPhD, EURAXESS, DAAD, jobs.ac.uk və digər portallardan real elanlar',
    icon: BriefcaseBusiness, accent: '#45f0a4', Summary: S.PositionsSummary,
    count: (s) => s.positions.filter((p) => p.status !== 'dismissed').length, action: 'Elan tap',
  },
  {
    key: 'insights', idx: 'M-13', title: 'Tələbə səsi', desc: 'Reddit-də o universitetdə oxuyanlar nə deyir: rəhbərlik, təqaüd, iş yükü, həyat',
    icon: MessagesSquare, accent: '#a594ff', Summary: S.InsightsSummary, count: (s) => s.insights.length, action: 'Reddit analizi',
  },
  {
    key: 'deadlines', idx: 'M-03', title: 'Deadline-lar', desc: 'Universitet, təqaüd və konfrans deadline-ları (mənbə ilə)',
    icon: CalendarClock, accent: '#ffb547', Summary: S.DeadlinesSummary,
    count: (s) => s.deadlines.filter((d) => d.status === 'open' && daysUntil(d.dueDate) >= 0).length, action: 'Mənbədən yoxla',
  },
  {
    key: 'today', idx: 'M-04', title: 'Bugün', desc: 'Bu gün PhD üçün etməli olduqların',
    icon: ListChecks, accent: '#45f0a4', Summary: S.TodaySummary,
    count: (s) => s.tasks.filter((t) => t.status !== 'done' && (!t.dueDate || t.dueDate <= todayISO())).length, action: 'AI plan qur',
  },
  {
    key: 'documents', idx: 'M-05', title: 'Sənədlər', desc: 'SOP, CV, research proposal, professorlara email-lər',
    icon: FileStack, accent: '#93ecff', Summary: S.DocumentsSummary, count: (s) => s.docs.length, action: 'Yeni sənəd',
  },
  {
    key: 'topics', idx: 'M-06', title: 'Mövzular', desc: 'Araşdırdığın mövzular və açar sözlər',
    icon: Lightbulb, accent: '#2fd8ff', Summary: S.TopicsSummary, count: (s) => s.topics.length, action: 'Mövzu əlavə et',
  },
  {
    key: 'groups', idx: 'M-07', title: 'Tədqiqat qrupları', desc: 'Mövzuna uyğun laboratoriyalar və qruplar',
    icon: Network, accent: '#2fd8ff', Summary: S.GroupsSummary, count: (s) => s.groups.length, action: 'Qrup tap',
  },
  {
    key: 'researchers', idx: 'M-08', title: 'Tədqiqatçılar', desc: 'Seçdiyin universitetlərdə mövzunu araşdıranlar',
    icon: UsersRound, accent: '#2fd8ff', Summary: S.ResearchersSummary, count: (s) => s.researchers.length, action: 'Kəşf et',
  },
  {
    key: 'papers', idx: 'M-09', title: 'Məqalələr', desc: 'Real məqalələr: OpenAlex, Semantic Scholar, arXiv',
    icon: Library, accent: '#2fd8ff', Summary: S.PapersSummary, count: (s) => s.papers.length, action: 'Məqalə axtar',
  },
  {
    key: 'gaps', idx: 'M-10', title: 'Research gap', desc: 'Ədəbiyyatdakı boşluqlar, sübut məqalələri ilə',
    icon: Radar, accent: '#a594ff', Summary: S.GapsSummary, count: (s) => s.gaps.length, action: 'Gap analizi',
  },
  {
    key: 'publish', idx: 'M-11', title: 'Nəşr', desc: 'Məqaləni hara göndərə bilərsən: real jurnal və konfranslar',
    icon: Rocket, accent: '#45f0a4', Summary: S.PublishSummary, count: (s) => s.venues.length, action: 'Jurnal tap',
  },
]

export const MODULE_BY_KEY = Object.fromEntries(MODULES.map((m) => [m.key, m])) as Record<ModuleDef['key'], ModuleDef>
