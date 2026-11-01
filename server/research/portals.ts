// PhD position / program portals.
// "direct" portals are searched here (their robots.txt allows the search page); the rest are found through
// a web search restricted to the portal (site:...), because they block automated search pages
// (robots.txt rules or a Cloudflare check). Single listing pages can then be read with readPage.
import { noteUrls } from '../db'
import { htmlToPage, readPage } from '../browser/read'
import { robotsAllowed } from '../browser/robots'
import { fetchData } from './http'

export interface PortalListing {
  portal: string
  title: string
  url: string
  snippet?: string
  university?: string
  city?: string
  deadline?: string
  funding?: string
}

export interface PortalResult {
  portal: string
  name: string
  searchUrl: string
  mode: 'direct' | 'websearch'
  listings: PortalListing[]
  /** For websearch portals: the query to run with WebSearch. */
  webQuery?: string
  error?: string
}

interface PortalDef {
  name: string
  domain: string
  /** Page a human opens to search the portal. */
  searchUrl: (q: string) => string
  /** Searched here: returns listings, or throws. Undefined = websearch only. */
  direct?: (q: string, limit: number) => Promise<PortalListing[]>
  note: string
}

const enc = encodeURIComponent

/** Listings from a rendered search page: links whose URL looks like a detail page, with the text around them. */
async function listingsFromPage(portal: string, url: string, detail: RegExp, limit: number, mode: 'auto' | 'browser' = 'auto'): Promise<PortalListing[]> {
  if (!(await robotsAllowed(url))) throw new Error('robots.txt does not allow this search page')
  const page = await readPage(url, { mode, scroll: true })
  if (page.blocked) throw new Error(`the site blocks access: ${page.blocked}`)
  const seen = new Set<string>()
  const found: { title: string; url: string; at: number }[] = []
  for (const l of page.links) {
    const href = l.href.replace(/[?#].*$/, '')
    if (!detail.test(href) || seen.has(href) || l.text.length < 8) continue
    seen.add(href)
    found.push({ title: l.text, url: href, at: page.text.indexOf(l.text) })
    if (found.length >= limit) break
  }
  // A listing's snippet is the text after its title, up to the next listing's title.
  const starts = found.map((f) => f.at).filter((a) => a >= 0).sort((a, b) => a - b)
  return found.map((f) => {
    if (f.at < 0) return { portal, title: f.title, url: f.url }
    const from = f.at + f.title.length
    const next = starts.find((a) => a > f.at) ?? from + 320
    const snippet = page.text.slice(from, Math.min(next, from + 320)).replace(/\bSave\b\s*$/, '').replace(/\s+/g, ' ').trim()
    return { portal, title: f.title, url: f.url, snippet: snippet || undefined }
  })
}

interface DaadCourse { id: number; courseName: string; academy: string; city: string; languages: string[] | null; tuitionFees: string | null; applicationDeadline: string | null; financialSupport: boolean; beginning: string | null; programmeDuration: string | null; link: string; courseType: number }

export const PORTALS: Record<string, PortalDef> = {
  daad: {
    name: 'DAAD (Germany)',
    domain: 'daad.de',
    searchUrl: (q) => `https://www2.daad.de/deutschland/studienangebote/international-programmes/en/result/?q=${enc(q)}&degree%5B%5D=3&degree%5B%5D=4`,
    direct: async (q, limit) => {
      const j = await fetchData<{ courses: DaadCourse[] }>(
        `https://www2.daad.de/deutschland/studienangebote/international-programmes/api/solr/en/search.json?q=${enc(q)}&degree%5B%5D=3&degree%5B%5D=4&limit=${limit}`,
        { cacheMs: 24 * 3600_000 },
      )
      return j.courses.map((c) => ({
        portal: 'daad',
        title: c.courseName,
        url: `https://www2.daad.de${c.link}`,
        university: c.academy,
        city: c.city,
        deadline: c.applicationDeadline ? htmlToPage(c.applicationDeadline, 'https://www2.daad.de').text.replace(/\s+/g, ' ') : undefined,
        funding: [c.financialSupport ? 'funding available' : '', c.tuitionFees ?? ''].filter(Boolean).join('; ') || undefined,
        snippet: [c.courseType === 4 ? 'Research school' : 'PhD programme', c.languages?.join('/'), c.beginning, c.programmeDuration].filter(Boolean).join(' · '),
      }))
    },
    note: 'International PhD programmes and research schools in Germany (official DAAD database)',
  },
  jobsacuk: {
    name: 'jobs.ac.uk',
    domain: 'jobs.ac.uk',
    searchUrl: (q) => `https://www.jobs.ac.uk/search/?keywords=${enc(q)}&jobTypeFacet%5B0%5D=phds`,
    direct: async (q, limit) => {
      const detail = /jobs\.ac\.uk\/job\/[A-Z0-9]+\//
      const phds = await listingsFromPage('jobsacuk', `https://www.jobs.ac.uk/search/?keywords=${enc(q)}&jobTypeFacet%5B0%5D=phds`, detail, limit)
      // The PhD filter is strict; with few hits, also take jobs that mention PhD.
      if (phds.length >= 3) return phds
      const more = await listingsFromPage('jobsacuk', `https://www.jobs.ac.uk/search/?keywords=${enc(`${q} phd`)}`, detail, limit)
      return [...phds, ...more.filter((m) => !phds.some((x) => x.url === m.url))].slice(0, limit)
    },
    note: 'United Kingdom: PhD studentships',
  },
  academicpositions: {
    name: 'AcademicPositions',
    domain: 'academicpositions.com',
    searchUrl: (q) => `https://academicpositions.com/jobs/position/phd?search=${enc(q)}`,
    direct: (q, limit) => listingsFromPage('academicpositions', `https://academicpositions.com/jobs/position/phd?search=${enc(q)}`, /academicpositions\.com\/ad\//, limit, 'browser'),
    note: 'Europe: paid PhD positions (Scandinavia, Netherlands, Belgium, Switzerland)',
  },
  euraxess: {
    name: 'EURAXESS',
    domain: 'euraxess.ec.europa.eu',
    searchUrl: (q) => `https://euraxess.ec.europa.eu/jobs/search?keywords=${enc(q)}`,
    note: 'Official EU portal for research positions (R1 = PhD candidate); robots.txt blocks automated search',
  },
  phdportal: {
    name: 'PhDPortal',
    domain: 'phdportal.com',
    searchUrl: (q) => `https://www.phdportal.com/search/phd/?kw-what=${enc(q)}`,
    note: 'Studyportals: PhD programmes worldwide; robots.txt blocks automated search',
  },
  findaphd: {
    name: 'FindAPhD',
    domain: 'findaphd.com',
    searchUrl: (q) => `https://www.findaphd.com/phds/?Keywords=${enc(q)}`,
    note: 'The largest PhD listing database (UK, Europe); has a Cloudflare check',
  },
  scholarshipportal: {
    name: 'ScholarshipPortal',
    domain: 'scholarshipportal.com',
    searchUrl: (q) => `https://www.scholarshipportal.com/scholarships?q=${enc(q)}`,
    note: 'Scholarships (Studyportals)',
  },
  nature: {
    name: 'Nature Careers',
    domain: 'nature.com/naturecareers',
    searchUrl: (q) => `https://www.nature.com/naturecareers/jobs/phd?keywords=${enc(q)}`,
    note: 'PhD positions in science',
  },
}

export type PortalKey = keyof typeof PORTALS
export const PORTAL_KEYS = Object.keys(PORTALS)

export async function searchPortals(o: { query: string; portals?: string[]; country?: string; limit?: number }): Promise<PortalResult[]> {
  const keys = (o.portals?.length ? o.portals : PORTAL_KEYS).filter((k) => PORTALS[k])
  const q = o.query.trim()
  const withCountry = o.country ? `${q} ${o.country}` : q
  const results = await Promise.all(
    keys.map(async (k): Promise<PortalResult> => {
      const p = PORTALS[k]
      const base = { portal: k, name: p.name, searchUrl: p.searchUrl(q) }
      const webQuery = `site:${p.domain} PhD ${withCountry}`
      if (!p.direct) return { ...base, mode: 'websearch', listings: [], webQuery }
      try {
        let listings = await p.direct(q, o.limit ?? 15)
        if (o.country) {
          const c = o.country.toLowerCase()
          const narrowed = listings.filter((l) => JSON.stringify(l).toLowerCase().includes(c))
          if (narrowed.length) listings = narrowed
        }
        return { ...base, mode: 'direct', listings }
      } catch (e) {
        // Direct search failed (blocked, layout changed): fall back to a site-restricted web search.
        return { ...base, mode: 'websearch', listings: [], webQuery, error: (e as Error).message }
      }
    }),
  )
  noteUrls(results.flatMap((r) => r.listings.map((l) => l.url)))
  return results
}

/** Which portal a URL belongs to ("web" when none). */
export function portalOf(url: string): string {
  const host = url.toLowerCase()
  return PORTAL_KEYS.find((k) => host.includes(PORTALS[k].domain.split('/')[0])) ?? 'web'
}
