import { useMemo, useState } from 'react'
import { ArrowUpRight, Search as SearchIcon } from 'lucide-react'
import { classify } from '../../../shared/directions'
import type { Gap, ModuleKey, Paper, PaperStatus } from '../../../shared/types'
import { items } from '../api'
import { statusLabel } from '../lib/util'
import { useStore } from '../store'
import { PageHead, Pill, useFocus, type Tone } from '../ui/kit'

const STATUS: { key: PaperStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All papers' },
  { key: 'to_read', label: 'Unread' },
  { key: 'reading', label: 'Reading' },
  { key: 'read', label: 'Read' },
  { key: 'key', label: 'Key papers' },
]
const NEXT: Record<PaperStatus, PaperStatus> = { to_read: 'reading', reading: 'read', read: 'key', key: 'to_read' }
const P_TONE: Record<PaperStatus, Tone> = { to_read: 'a', reading: 'b', read: 'g', key: 'v' }
const G_TONE: Record<Gap['status'], Tone> = { selected: 'g', shortlisted: 'g', candidate: 'a', discarded: 'n' }
type Source = 'openalex' | 's2' | 'arxiv' | 'other'
const SOURCES: [Source, string][] = [['openalex', 'OpenAlex'], ['s2', 'Semantic Scholar'], ['arxiv', 'arXiv'], ['other', 'Other']]
const sourceOf = (p: Paper): Source => (p.openalexId ? 'openalex' : p.s2Id ? 's2' : p.arxivId ? 'arxiv' : 'other')
const linkOf = (p: Paper) => p.url || (p.doi ? `https://doi.org/${p.doi}` : p.arxivId ? `https://arxiv.org/abs/${p.arxivId}` : undefined)

export default function LibraryPage() {
  const { state, fullState, setExpanded } = useStore()
  const [status, setStatus] = useState<PaperStatus | 'all'>('all')
  const [source, setSource] = useState<Source | null>(null)
  const [dir, setDir] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [hl, setHl] = useState<string | null>(null)
  useFocus('papers', (id) => { setStatus('all'); setSource(null); setDir(null); setQ(''); setHl(`p${id}`); window.setTimeout(() => document.getElementById(`p${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80) })
  useFocus('gaps', (id) => { setHl(`g${id}`); window.setTimeout(() => document.getElementById(`g${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80) })

  const cls = useMemo(() => classify(fullState), [fullState])
  const papers = useMemo(() => {
    const t = q.trim().toLowerCase()
    return [...state.papers]
      .filter((p) => status === 'all' || p.status === status)
      .filter((p) => !source || sourceOf(p) === source)
      .filter((p) => !dir || cls('papers', p.id).includes(dir))
      .filter((p) => !t || [p.title, p.venue, p.abstract, ...p.authors].some((x) => x?.toLowerCase().includes(t)))
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
  }, [state.papers, status, source, dir, q, cls])
  const count = (f: (p: Paper) => boolean) => state.papers.filter(f).length
  const gaps = [...state.gaps].sort((a, b) => Number(a.status === 'discarded') - Number(b.status === 'discarded') || b.novelty - a.novelty)
  const tabs: [ModuleKey, string, number][] = [
    ['topics', 'Topics', state.topics.length],
    ['researchers', 'Researchers', state.researchers.length],
    ['groups', 'Groups', state.groups.length],
    ['publish', 'Publish', state.venues.length],
  ]

  return (
    <div className="page">
      <PageHead title="Library">
        <nav className="page-tabs" aria-label="Library sections">
          <button className="on">Papers {state.papers.length}</button>
          {tabs.map(([k, label, n]) => <button key={k} onClick={() => setExpanded(k)}>{label} {n}</button>)}
        </nav>
        <span className="grow" />
        <button className="btn primary" onClick={() => setExpanded('papers')}><SearchIcon size={15} />Search papers</button>
      </PageHead>

      <main className="page-main lib">
        <nav className="lib-filters" aria-label="Filters">
          <div className="eyebrow muted">Status</div>
          {STATUS.map((s) => (
            <button key={s.key} className={status === s.key ? 'on' : ''} onClick={() => setStatus(s.key)}>
              {s.label}<span>{s.key === 'all' ? state.papers.length : count((p) => p.status === s.key)}</span>
            </button>
          ))}
          <div className="eyebrow muted">Source</div>
          {SOURCES.map(([k, label]) => {
            const n = count((p) => sourceOf(p) === k)
            if (!n) return null
            return <button key={k} className={source === k ? 'on' : ''} onClick={() => setSource(source === k ? null : k)}>{label}<span>{n}</span></button>
          })}
          {fullState.directions.length > 0 && <div className="eyebrow muted">Direction</div>}
          {fullState.directions.map((d) => (
            <button key={d.id} className={dir === d.id ? 'on' : ''} onClick={() => setDir(dir === d.id ? null : d.id)}>
              <span className="row" style={{ gap: 8 }}><i className="ddot" style={{ background: d.color }} />{d.name}</span>
              <span>{count((p) => cls('papers', p.id).includes(d.id))}</span>
            </button>
          ))}
        </nav>

        <section className="lib-list" aria-label="Papers">
          <label className="search-strong">
            <SearchIcon size={18} aria-hidden="true" />
            <span className="sr-only">Search your library</span>
            <input value={q} placeholder="Search titles, authors, venues in your library" onChange={(e) => setQ(e.target.value)} />
            <span className="sub">{papers.length} of {state.papers.length}</span>
          </label>
          {papers.length === 0 && <div className="mcard-empty" style={{ padding: '24px 4px' }}>{state.papers.length ? 'No paper matches these filters.' : 'Your library is empty. Search OpenAlex, Semantic Scholar and arXiv to add papers.'}</div>}
          {papers.map((p) => {
            const link = linkOf(p)
            return (
              <article key={p.id} id={`p${p.id}`} className={`paper ${hl === `p${p.id}` ? 'hl-row' : ''}`}>
                <div className="grow">
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <button className={`pill t-${P_TONE[p.status]}`} title="Change status" onClick={() => items.patch<Paper>('papers', p.id, { status: NEXT[p.status] })}>
                      {p.status === 'to_read' ? 'unread' : statusLabel(p.status).toLowerCase()}
                    </button>
                    <span className="sub">{[p.venue, p.year].filter(Boolean).join(' · ')}</span>
                  </div>
                  <h3>{p.title}</h3>
                  {p.authors.length > 0 && <div className="sub">{p.authors.slice(0, 4).join(', ')}{p.authors.length > 4 ? ' et al.' : ''}</div>}
                  {(p.notes || p.tldr) && <p>{p.notes ? `Your note: ${p.notes}` : p.tldr}</p>}
                </div>
                <div className="paper-side">
                  {p.citedBy !== undefined && <span className="sub"><b>{p.citedBy}</b> citations</span>}
                  {link && <a className="btn sm" href={link} target="_blank" rel="noreferrer">Open <ArrowUpRight size={14} /></a>}
                </div>
              </article>
            )
          })}
        </section>

        <aside className="card lib-gaps" aria-label="Research gaps">
          <div className="lib-gaps-head">
            <span className="mono-idx">09</span>
            <h2>Research gaps</h2>
            <span className="grow" />
            <button className="btn sm" onClick={() => setExpanded('gaps')}>Run gap analysis</button>
          </div>
          {gaps.length === 0 && <div className="mcard-empty" style={{ padding: 20 }}>No gaps yet. Pick a topic and Talvis looks for open questions with evidence.</div>}
          {gaps.map((g) => (
            <div key={g.id} id={`g${g.id}`} className={`gap ${hl === `g${g.id}` ? 'hl-row' : ''} ${g.status === 'discarded' ? 'dropped' : ''}`}>
              <div className="row" style={{ gap: 8 }}>
                <Pill tone={G_TONE[g.status]}>{statusLabel(g.status)}</Pill>
                <span className="sub">{g.evidence.length} evidence {g.evidence.length === 1 ? 'paper' : 'papers'}</span>
              </div>
              <b>{g.title}</b>
              <p>{g.description}</p>
              <div className="sub">Novelty {g.novelty}/5 · Feasibility {g.feasibility}/5</div>
            </div>
          ))}
          <div className="lib-gaps-foot">Each gap was searched for counter-evidence across OpenAlex, Semantic Scholar and arXiv before it was saved.</div>
        </aside>
      </main>
    </div>
  )
}
