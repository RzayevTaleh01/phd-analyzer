import { useEffect, useState } from 'react'
import { BookmarkPlus, ChevronDown, ChevronRight, ExternalLink, MessageSquareText, Search } from 'lucide-react'
import type { Insight, Position } from '../../../shared/types'
import { api, items, type PortalInfo, type PortalResult, type RedditPost } from '../api'
import { dayLabel, daysUntil, fmtDate, urgency } from '../lib/util'
import { useStore } from '../store'
import { AskTalvis, DeleteBtn, Ext, JobButton, JobLog, Spinner, StatusSelect } from './ui'

const POS_STATUS = ['found', 'shortlisted', 'applying', 'applied', 'dismissed'] as const

// ---------------- PhD positions ----------------

export function PositionsPanel() {
  const { state, toast } = useStore()
  const prof = state.profile
  const [portals, setPortals] = useState<PortalInfo[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [q, setQ] = useState(prof.directions[0] ?? '')
  const [country, setCountry] = useState('')
  const [res, setRes] = useState<PortalResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [showDismissed, setShowDismissed] = useState(false)

  useEffect(() => void api<PortalInfo[]>('/portals').then((p) => {
    setPortals(p)
    setPicked(p.filter((x) => x.direct).map((x) => x.key))
  }), [])

  const search = () => {
    if (!q.trim()) return
    setBusy(true)
    api<PortalResult[]>(`/portals/search?q=${encodeURIComponent(q)}&portals=${picked.join(',')}${country ? `&country=${encodeURIComponent(country)}` : ''}`)
      .then(setRes)
      .catch((e) => toast(String(e)))
      .finally(() => setBusy(false))
  }
  const savedUrls = new Set(state.positions.map((p) => p.url))
  const save = (l: PortalResult['listings'][number]) =>
    api('/positions', { body: { title: l.title, url: l.url, university: l.university, summary: l.snippet, funding: l.funding } })
      .then(() => toast('Position saved'))
      .catch((e) => toast(String(e)))
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))

  const shown = state.positions
    .filter((p) => showDismissed || p.status !== 'dismissed')
    .sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'))
  const uniName = (p: Position) => (p.universityId ? state.universities.find((u) => u.id === p.universityId)?.name : undefined) ?? p.university

  return (
    <>
      <JobLog module="positions" />
      <div className="toolbar">
        <JobButton kind="portal_scan" module="positions" label="AI: find positions matching my profile across all portals" disabled={!(prof.directions.length || state.topics.length)} />
        <span className="faint" style={{ fontSize: 12 }}>Talvis browses the portals, opens and reads each listing, and records funding and deadline from it.</span>
      </div>

      <div className="section-label">Search portals</div>
      <div className="row" style={{ gap: 4, flexWrap: 'wrap', margin: '8px 0' }}>
        {portals.map((p) => (
          <button key={p.key} className={`qchip ${picked.includes(p.key) ? 'on' : ''}`} title={p.note} onClick={() => toggle(p.key)}>
            {p.name}{p.direct ? '' : ' ↗'}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <input className="input" style={{ maxWidth: 320 }} value={q} placeholder="Field (in English), e.g. natural language processing" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
        <input className="input" style={{ maxWidth: 160 }} value={country} placeholder="Country (optional)" onChange={(e) => setCountry(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
        <button className="btn" disabled={busy || !picked.length} onClick={search}>{busy ? <Spinner /> : <Search size={13} />} Search</button>
      </div>
      <p className="faint" style={{ fontSize: 11.5, lineHeight: 1.5, marginTop: -6 }}>
        Portals marked ↗ (PhDPortal, FindAPhD, EURAXESS...) block automated search: you get a link to open them in your own browser, while Talvis finds them through web search.
      </p>

      {res && (
        <div className="hits" style={{ marginBottom: 18 }}>
          {res.map((r) => (
            <div key={r.portal} className="hit">
              <div className="row" style={{ gap: 8 }}>
                <b style={{ fontSize: 13 }}>{r.name}</b>
                {r.mode === 'direct' ? <span className="chip cyan">{r.listings.length} results</span> : <span className="chip">open in browser</span>}
                {r.error && <span className="chip amber" title={r.error}>{r.error.slice(0, 50)}</span>}
                <span className="grow" />
                <Ext href={r.searchUrl}><span className="row" style={{ gap: 4 }}>Open on portal <ExternalLink size={11} /></span></Ext>
              </div>
              {r.listings.map((l) => (
                <div key={l.url} className="row" style={{ gap: 8, marginTop: 8, alignItems: 'flex-start' }}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <a href={l.url} target="_blank" rel="noreferrer" className="hit-title" style={{ fontSize: 12.5 }}>{l.title}</a>
                    <div className="hit-meta">
                      {l.university && <span>{l.university}{l.city ? `, ${l.city}` : ''}</span>}
                      {l.deadline && <span className="chip amber">{l.deadline.slice(0, 70)}</span>}
                      {l.funding && <span className="chip green">{l.funding.slice(0, 60)}</span>}
                    </div>
                    {l.snippet && <div className="faint" style={{ fontSize: 11.5, marginTop: 3, lineHeight: 1.45 }}>{l.snippet.slice(0, 220)}</div>}
                  </div>
                  <button className="btn sm" disabled={savedUrls.has(l.url)} onClick={() => save(l)}><BookmarkPlus size={12} /> {savedUrls.has(l.url) ? 'Saved' : 'Save'}</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="row" style={{ margin: '6px 0 10px' }}>
        <div className="section-label grow">Saved positions ({shown.length})</div>
        <label className="faint row" style={{ gap: 5, fontSize: 11.5, marginLeft: 10 }}>
          <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} /> show dismissed
        </label>
      </div>
      {shown.length === 0 ? (
        <div className="muted-box">No positions yet. Search above or press the "AI: find positions..." button: Talvis finds real positions based on the directions and countries in your profile and writes them here.</div>
      ) : (
        <table className="table">
          <thead><tr><th>Position</th><th>University</th><th>Funding</th><th>Deadline</th><th>Status</th><th /></tr></thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id}>
                <td style={{ maxWidth: 360 }}>
                  <a href={p.url} target="_blank" rel="noreferrer"><b>{p.title}</b></a>
                  <div className="faint" style={{ fontSize: 11, marginTop: 3 }}>{p.portal}{p.field ? ` · ${p.field}` : ''}{p.supervisor ? ` · ${p.supervisor}` : ''}</div>
                  {p.summary && <div className="dim" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.45 }}>{p.summary}</div>}
                </td>
                <td style={{ maxWidth: 200 }}>{uniName(p) ?? <span className="faint">-</span>}{p.country && <div className="faint" style={{ fontSize: 11 }}>{p.country}</div>}</td>
                <td style={{ maxWidth: 180, fontSize: 12 }}>{p.funding ?? <span className="faint">-</span>}</td>
                <td>
                  {p.deadline && /^\d{4}-\d{2}-\d{2}$/.test(p.deadline) ? (
                    <span className={`chip ${urgency(daysUntil(p.deadline))}`} title={dayLabel(daysUntil(p.deadline))}>{fmtDate(p.deadline)}</span>
                  ) : (
                    <span className="faint">{p.deadline ?? '-'}</span>
                  )}
                </td>
                <td><StatusSelect value={p.status} options={POS_STATUS} onChange={(v) => items.patch<Position>('positions', p.id, { status: v })} /></td>
                <td>
                  <div className="row" style={{ gap: 4 }}>
                    <AskTalvis label="Fit" text={`[J${p.id}] Open this position, read the requirements and funding, and tell me how well it fits my profile and what I need to prepare.`} />
                    <DeleteBtn coll="positions" id={p.id} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

// ---------------- Student voice (Reddit) ----------------

const TONE_CHIP = { positive: 'green', negative: 'red', mixed: 'amber' } as const

function sentimentLabel(n: number) {
  return n >= 2 ? 'very positive' : n === 1 ? 'positive' : n === 0 ? 'mixed' : n === -1 ? 'negative' : 'very negative'
}

function InsightCard({ i }: { i: Insight }) {
  const [open, setOpen] = useState(false)
  const { state } = useStore()
  const uni = i.universityId ? state.universities.find((u) => u.id === i.universityId) : undefined
  return (
    <div className="hit">
      <div className="row" style={{ gap: 8 }}>
        <button className="mod-btn" onClick={() => setOpen(!open)}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
        <b style={{ fontSize: 13.5 }}>{uni?.name ?? i.subject}</b>
        <span className={`chip ${i.sentiment > 0 ? 'green' : i.sentiment < 0 ? 'red' : 'amber'}`}>{sentimentLabel(i.sentiment)} ({i.sentiment > 0 ? '+' : ''}{i.sentiment})</span>
        <span className="chip">{i.source}</span>
        <span className="faint mono" style={{ fontSize: 11 }}>{i.postsAnalyzed} posts/comments · {i.createdAt.slice(0, 10)}</span>
        <span className="grow" />
        <AskTalvis label="Ask" text={`[I${i.id}] Based on student opinions about ${i.subject}: `} />
        <DeleteBtn coll="insights" id={i.id} />
      </div>
      <p className="dim" style={{ fontSize: 12.5, lineHeight: 1.55, margin: '8px 0' }}>{i.summary}</p>
      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
        {i.themes.map((t) => <span key={t.theme} className={`chip ${TONE_CHIP[t.tone]}`} title={t.note}>{t.theme}</span>)}
      </div>
      {open && (
        <>
          <div className="section-label" style={{ margin: '12px 0 6px' }}>Themes</div>
          {i.themes.map((t) => (
            <div key={t.theme} style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 4 }}>
              <span className={`chip ${TONE_CHIP[t.tone]}`}>{t.theme}</span> {t.note}
            </div>
          ))}
          <div className="section-label" style={{ margin: '12px 0 6px' }}>Evidence ({i.evidence.length})</div>
          {i.evidence.map((e) => (
            <div key={e.url} style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 6 }}>
              <span className="dim">"{e.quote}"</span>{' '}
              <a href={e.url} target="_blank" rel="noreferrer" className="faint" style={{ fontSize: 11 }}>
                {e.subreddit ? `r/${e.subreddit}` : 'source'}{e.date ? ` · ${e.date}` : ''}{e.score !== undefined ? ` · ${e.score}↑` : ''}
              </a>
            </div>
          ))}
          {i.caveats && <div className="muted-box" style={{ marginTop: 8, fontSize: 11.5 }}>Caveats: {i.caveats}</div>}
        </>
      )}
    </div>
  )
}

export function InsightsPanel() {
  const { state, toast } = useStore()
  const [uniId, setUniId] = useState<number | ''>(state.universities[0]?.id ?? '')
  const [q, setQ] = useState('')
  const [sub, setSub] = useState('')
  const [posts, setPosts] = useState<RedditPost[] | null>(null)
  const [via, setVia] = useState('')
  const [busy, setBusy] = useState(false)
  const search = () => {
    if (!q.trim()) return
    setBusy(true)
    api<{ posts: RedditPost[]; via: string }>(`/reddit/search?q=${encodeURIComponent(q)}${sub ? `&sub=${encodeURIComponent(sub)}` : ''}&limit=25`)
      .then((r) => {
        setPosts(r.posts)
        setVia(r.via)
      })
      .catch((e) => toast(String(e)))
      .finally(() => setBusy(false))
  }
  const withInsight = new Set(state.insights.map((i) => i.universityId).filter(Boolean))

  return (
    <>
      <JobLog module="insights" />
      <div className="toolbar">
        <select className="select" style={{ width: 'auto', maxWidth: 320 }} value={uniId} onChange={(e) => setUniId(e.target.value ? Number(e.target.value) : '')}>
          {state.universities.length === 0 && <option value="">Add a university first</option>}
          {state.universities.map((u) => <option key={u.id} value={u.id}>{u.name}{withInsight.has(u.id) ? ' ✓' : ''}</option>)}
        </select>
        <JobButton kind="student_voice" module="insights" params={{ universityId: uniId }} label="AI: what do students say on Reddit?" disabled={!uniId} />
      </div>
      <p className="faint" style={{ fontSize: 11.5, lineHeight: 1.5, marginTop: -6 }}>
        Talvis searches the university's own subreddit and r/PhD, r/gradadmissions, r/AskAcademia, reads the threads, and writes up findings on supervision, pay/stipend, workload and the international student experience, with evidence links.
      </p>

      <div className="section-label">Analyses ({state.insights.length})</div>
      <div className="hits" style={{ margin: '10px 0 18px' }}>
        {state.insights.length === 0 && <div className="muted-box">No analyses yet. Pick a university and press "AI: what do students say on Reddit?".</div>}
        {[...state.insights].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((i) => <InsightCard key={i.id} i={i} />)}
      </div>

      <div className="section-label">Search Reddit yourself</div>
      <div className="toolbar" style={{ marginTop: 8 }}>
        <input className="input" style={{ maxWidth: 320 }} value={q} placeholder={'e.g. "University of Tartu" PhD'} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
        <input className="input" style={{ maxWidth: 160 }} value={sub} placeholder="subreddit (optional)" onChange={(e) => setSub(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
        <button className="btn" disabled={busy} onClick={search}>{busy ? <Spinner /> : <Search size={13} />} Search</button>
        {['PhD', 'gradadmissions', 'AskAcademia'].map((s) => <button key={s} className={`qchip ${sub === s ? 'on' : ''}`} onClick={() => setSub(sub === s ? '' : s)}>r/{s}</button>)}
      </div>
      {posts && (
        <div className="hits">
          <div className="faint" style={{ fontSize: 11 }}>{posts.length} posts · {via === 'rss' ? 'open RSS (no scores; add a Reddit key in Settings for more data)' : 'Reddit API'}</div>
          {posts.length === 0 && <div className="empty">Nothing found.</div>}
          {posts.map((p) => (
              <div key={p.id} className="hit">
                <a href={p.url} target="_blank" rel="noreferrer" className="hit-title" style={{ fontSize: 12.5 }}>{p.title}</a>
                <div className="hit-meta">
                  <span className="chip cyan">r/{p.subreddit}</span>
                  <span className="mono">{p.created}</span>
                  {p.score !== undefined && <span className="mono">{p.score}↑</span>}
                  {p.comments !== undefined && <span className="row mono" style={{ gap: 3 }}><MessageSquareText size={11} />{p.comments}</span>}
                </div>
                {p.text && <div className="faint" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.45 }}>{p.text.slice(0, 260)}</div>}
              </div>
          ))}
        </div>
      )}
    </>
  )
}
