// Shared data model used by both the server and the board UI.

export type ID = number

export type ModuleKey =
  | 'core'
  | 'today'
  | 'deadlines'
  | 'universities'
  | 'topics'
  | 'groups'
  | 'researchers'
  | 'papers'
  | 'gaps'
  | 'publish'
  | 'documents'
  | 'profile'
  | 'positions'
  | 'insights'
  | 'directions'

export interface Profile {
  name: string
  field: string
  stage: string
  targetTerm: string
  countries: string[]
  interests: string
  background: string
  languages: string
  /** Broad research directions, e.g. NLP, adaptive learning systems. */
  directions: string[]
  /** Ranking system for the university filter: QS, THE, ARWU or any. */
  rankingSystem: string
  /** Only universities in the top N (0 = no limit). */
  rankingMax: number
  /** Condition keys from shared/criteria.ts, e.g. no_language_cert. */
  conditions: string[]
  conditionsNote: string
  citizenship: string
  /** Previous degrees, institution and teaching language (matters for language test waivers). */
  education: string
  updatedAt?: string
}

export interface Topic {
  id: ID
  /** Direction groups set by the user or Talvis; when absent they are derived (shared/directions.ts). */
  directionIds?: ID[]
  title: string
  description: string
  keywords: string[]
  priority: 1 | 2 | 3
  status: 'active' | 'paused' | 'archived'
  createdAt: string
}

export type UniversityStatus =
  | 'interested'
  | 'researching'
  | 'applying'
  | 'applied'
  | 'interview'
  | 'accepted'
  | 'rejected'

export interface University {
  id: ID
  /** Direction groups set by the user or Talvis; when absent they are derived (shared/directions.ts). */
  directionIds?: ID[]
  name: string
  country: string
  countryCode: string
  city?: string
  website?: string
  openalexId?: string
  status: UniversityStatus
  notes?: string
  /** Numeric rank for sorting (lower bound of a band like 201-250). */
  rank?: number
  /** As published, e.g. "QS 2026 #85" or "THE 2026 201-250". */
  rankLabel?: string
  rankSource?: string
  langCert?: 'not_required' | 'waiver' | 'required' | 'unknown'
  langCertNote?: string
  langCertSource?: string
  /** How the university meets the profile criteria and directions. */
  fitNote?: string
  createdAt: string
}

export interface Group {
  id: ID
  /** Direction groups set by the user or Talvis; when absent they are derived (shared/directions.ts). */
  directionIds?: ID[]
  name: string
  universityId?: ID
  piName?: string
  url?: string
  description?: string
  topicIds: ID[]
}

export type ContactStatus = 'new' | 'to_contact' | 'contacted' | 'replied' | 'meeting' | 'declined'

export interface Researcher {
  id: ID
  /** Direction groups set by the user or Talvis; when absent they are derived (shared/directions.ts). */
  directionIds?: ID[]
  name: string
  universityId?: ID
  groupId?: ID
  position?: string
  openalexId?: string
  orcid?: string
  homepage?: string
  email?: string
  hIndex?: number
  worksCount?: number
  citedBy?: number
  concepts: string[]
  relevance?: number
  topicWorks?: number
  status: ContactStatus
  notes?: string
  topicIds: ID[]
}

export type PaperStatus = 'to_read' | 'reading' | 'read' | 'key'

export interface Paper {
  id: ID
  /** Direction groups set by the user or Talvis; when absent they are derived (shared/directions.ts). */
  directionIds?: ID[]
  title: string
  authors: string[]
  year?: number
  venue?: string
  doi?: string
  openalexId?: string
  s2Id?: string
  arxivId?: string
  url?: string
  pdfUrl?: string
  abstract?: string
  tldr?: string
  citedBy?: number
  status: PaperStatus
  topicIds: ID[]
  researcherIds: ID[]
  notes?: string
  addedAt: string
}

export type DeadlineKind =
  | 'application'
  | 'scholarship'
  | 'interview'
  | 'document'
  | 'conference'
  | 'journal'
  | 'other'

export interface Deadline {
  id: ID
  title: string
  universityId?: ID
  program?: string
  kind: DeadlineKind
  dueDate: string
  dueTime?: string
  timezone?: string
  sourceUrl?: string
  verified: boolean
  verifiedAt?: string
  status: 'open' | 'done' | 'missed'
  notes?: string
}

export interface Task {
  id: ID
  title: string
  notes?: string
  dueDate?: string
  priority: 1 | 2 | 3
  status: 'todo' | 'doing' | 'done'
  createdBy: 'user' | 'ai'
  module?: ModuleKey
}

export interface GapEvidence {
  paperId?: ID
  ref: string
  note: string
}

export interface Gap {
  id: ID
  /** Direction groups set by the user or Talvis; when absent they are derived (shared/directions.ts). */
  directionIds?: ID[]
  topicId?: ID
  title: string
  description: string
  evidence: GapEvidence[]
  novelty: number
  feasibility: number
  methods?: string
  status: 'candidate' | 'shortlisted' | 'selected' | 'discarded'
  createdAt: string
}

export interface Venue {
  id: ID
  /** Direction groups set by the user or Talvis; when absent they are derived (shared/directions.ts). */
  directionIds?: ID[]
  name: string
  type: 'journal' | 'conference' | 'repository' | 'other'
  openalexId?: string
  issn?: string
  publisher?: string
  isOa?: boolean
  inDoaj?: boolean
  apcUsd?: number
  hIndex?: number
  worksCount?: number
  homepage?: string
  fit?: number
  reason?: string
  status: 'suggested' | 'shortlisted' | 'submitted' | 'rejected' | 'accepted'
}

export interface Doc {
  id: ID
  title: string
  kind: 'sop' | 'cv' | 'proposal' | 'email' | 'cover_letter' | 'note'
  content: string
  status: 'draft' | 'review' | 'final'
  universityId?: ID
  updatedAt: string
}

export type PositionStatus = 'found' | 'shortlisted' | 'applying' | 'applied' | 'dismissed'

/** A PhD position, program or studentship found on a portal (PhDPortal, FindAPhD, EURAXESS, ...). */
export interface Position {
  id: ID
  /** Direction groups set by the user or Talvis; when absent they are derived (shared/directions.ts). */
  directionIds?: ID[]
  title: string
  universityId?: ID
  university?: string
  country?: string
  /** Portal key from server/research/portals.ts, or "web" for any other page. */
  portal: string
  url: string
  field?: string
  supervisor?: string
  funding?: string
  /** Application deadline as published (YYYY-MM-DD when the date is exact). */
  deadline?: string
  summary?: string
  status: PositionStatus
  foundAt: string
}

export interface InsightTheme {
  theme: string
  tone: 'positive' | 'negative' | 'mixed'
  note: string
}

export interface InsightEvidence {
  url: string
  title?: string
  /** Short quote or paraphrase of what the post/comment says. */
  quote: string
  subreddit?: string
  date?: string
  score?: number
}

/** What students say about a university or program (Reddit and other public forums), with evidence links. */
export interface Insight {
  id: ID
  universityId?: ID
  subject: string
  source: 'reddit' | 'web' | 'mixed'
  summary: string
  /** -2 very negative ... +2 very positive. */
  sentiment: number
  themes: InsightTheme[]
  evidence: InsightEvidence[]
  postsAnalyzed: number
  /** Honest limits: sample size, how old the posts are, self-selection. */
  caveats?: string
  createdAt: string
}

export interface DirectionAnalysis {
  /** criterion key (shared/directions.ts CRITERIA) -> 0-10 score with the reason */
  scores: Partial<Record<string, { score: number; note: string }>>
  overall?: number
  summary: string
  strengths: string[]
  risks: string[]
  nextSteps: string[]
  /** Board ids (P12, R3, U9, J2, I1...) or URLs from tool results. */
  evidence: { ref: string; note: string }[]
  analyzedAt: string
}

/** A main research direction group (e.g. NLP, Adaptive learning) the user is weighing. */
export interface Direction {
  id: ID
  name: string
  description: string
  /** Words that put an item into this group (topics, paper titles, researcher concepts, fit notes). */
  keywords: string[]
  color: string
  status: 'exploring' | 'leaning' | 'chosen' | 'dropped'
  /** The user's own interest, 1-5. */
  interest?: number
  analysis?: DirectionAnalysis
  createdAt: string
}

export interface Activity {
  id: ID
  at: string
  source: 'ai' | 'user' | 'system'
  module: ModuleKey
  text: string
}

export interface Job {
  id: string
  kind: string
  title: string
  module: ModuleKey
  status: 'running' | 'done' | 'error'
  progress: string
  startedAt: string
  finishedAt?: string
}

export interface AppState {
  profile: Profile
  topics: Topic[]
  universities: University[]
  groups: Group[]
  researchers: Researcher[]
  papers: Paper[]
  deadlines: Deadline[]
  tasks: Task[]
  gaps: Gap[]
  venues: Venue[]
  docs: Doc[]
  positions: Position[]
  insights: Insight[]
  directions: Direction[]
  activity: Activity[]
  jobs: Job[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  tools?: { id?: string; name: string; label: string; module?: ModuleKey; status: 'running' | 'done' | 'error' }[]
  at: string
}
