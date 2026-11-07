import type { AppState } from '../../shared/types'

export type Coll = 'topics' | 'universities' | 'groups' | 'researchers' | 'papers' | 'deadlines' | 'tasks' | 'gaps' | 'venues' | 'docs' | 'positions' | 'insights' | 'directions'

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  // The session ended (signed out elsewhere, password changed): back to the sign-in page.
  if (res.status === 401 && !path.startsWith('/auth')) window.location.reload()
  const text = await res.text()
  const data = text ? JSON.parse(text) : undefined
  if (!res.ok) throw new Error((data as { error?: string })?.error ?? `HTTP ${res.status}`)
  return data as T
}

export const items = {
  create: <T>(c: Coll, data: Partial<T>) => api<T>(`/items/${c}`, { body: data }),
  patch: <T>(c: Coll, id: number, data: Partial<T>) => api<T>(`/items/${c}/${id}`, { method: 'PATCH', body: data }),
  remove: (c: Coll, id: number) => api(`/items/${c}/${id}`, { method: 'DELETE' }),
  get: <T>(c: Coll, id: number) => api<T>(`/items/${c}/${id}`),
}

export const emptyState: AppState = {
  profile: {
    name: '', field: '', stage: '', targetTerm: '', countries: [], interests: '', background: '', languages: '',
    directions: [], rankingSystem: 'QS', rankingMax: 0, conditions: [], conditionsNote: '', citizenship: '', education: '',
  },
  topics: [],
  universities: [],
  groups: [],
  researchers: [],
  papers: [],
  deadlines: [],
  tasks: [],
  gaps: [],
  venues: [],
  docs: [],
  positions: [],
  insights: [],
  directions: [],
  activity: [],
  jobs: [],
}

// Research result shapes returned by the server.
export interface WorkHit {
  source: 'openalex' | 's2' | 'arxiv'
  openalexId?: string
  s2Id?: string
  arxivId?: string
  doi?: string
  title: string
  year?: number
  venue?: string
  authors: string[]
  authorIds?: string[]
  citedBy?: number
  abstract?: string
  tldr?: string
  url?: string
  pdfUrl?: string
  isOa?: boolean
}

export interface AuthorHit {
  openalexId: string
  name: string
  orcid?: string
  institution?: string
  isCurrent?: boolean
  hIndex?: number
  worksCount?: number
  citedBy?: number
  topics: string[]
  topicWorks?: number
}

export interface InstitutionHit {
  openalexId: string
  name: string
  countryCode?: string
  city?: string
  homepage?: string
  worksCount?: number
}

export interface VenueHit {
  openalexId: string
  name: string
  type?: string
  issn?: string
  publisher?: string
  isOa?: boolean
  inDoaj?: boolean
  apcUsd?: number
  hIndex?: number
  meanCitedness?: number
  worksCount?: number
  homepage?: string
  matchingWorks?: number
}

export interface Settings {
  model: string
  chatEffort: string
  jobEffort: string
  openalexKey: string
  s2Key: string
  mailto: string
  browser: string
  browserVisible: boolean
  redditClientId: string
  redditSecret: string
  trdeskUrl: string
  trdeskKey: string
  trdeskPlan: string
  language: string
}

export interface PortalInfo {
  key: string
  name: string
  note: string
  direct: boolean
}

export interface PortalResult {
  portal: string
  name: string
  searchUrl: string
  mode: 'direct' | 'websearch'
  listings: { portal: string; title: string; url: string; snippet?: string; university?: string; city?: string; deadline?: string; funding?: string }[]
  webQuery?: string
  error?: string
}

export interface RedditPost {
  id: string
  subreddit: string
  title: string
  author?: string
  url: string
  created?: string
  score?: number
  comments?: number
  text?: string
}
