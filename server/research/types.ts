// Normalized search results shared by every research source.
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
  institutionId?: string
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
  type?: string
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
