import { useMemo, useState } from 'react'
import { ArrowUpRight, Sparkles, Wrench } from 'lucide-react'
import { admitBand, byAdmitChance, CONDITION_BY_KEY, LANG_CERT_LABEL, rankingLabel } from '../../../shared/criteria'
import { classify } from '../../../shared/directions'
import type { University, UniversityStatus } from '../../../shared/types'
import { items } from '../api'
import { daysUntil, fmtShort } from '../lib/util'
import { JobButton, StatusSelect } from '../panels/ui'
import { useStore } from '../store'
import { askTalvis, PageHead, Pill, useFocus, type Tone } from '../ui/kit'

const STATUSES: UniversityStatus[] = ['interested', 'researching', 'applying', 'applied', 'interview', 'accepted', 'rejected']
const LANG_TONE: Record<string, Tone> = { not_required: 'g', waiver: 'a', required: 'r', unknown: 'n' }
const BAND_TONE: Record<string, Tone> = { green: 'g', cyan: 'b', amber: 'a', red: 'r' }
const barColor = (c: number) => (c >= 60 ? '#16a34a' : c >= 40 ? '#d97706' : '#dc2626')

export default function UniversitiesPage() {
  const { state, fullState, setExpanded } = useStore()
  const p = fullState.profile
  const unis = useMemo(() => [...state.universities].sort(byAdmitChance), [state.universities])
  const [selId, setSelId] = useState<number | null>(null)
  useFocus('universities', setSelId)
  const sel = unis.find((u) => u.id === selId) ?? unis[0]

  const dirColor = useMemo(() => {
    const cls = classify(fullState)
    return (id: number) => fullState.directions.find((d) => d.id === cls('universities', id)[0])?.color ?? '#d6d3d1'
  }, [fullState])
  const nextDeadline = (u: University) => state.deadlines
    .filter((d) => d.universityId === u.id && d.status === 'open' && daysUntil(d.dueDate) >= 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
  const researchers = (u: University) => state.researchers.filter((r) => r.universityId === u.id).length
  const setStatus = (u: University, status: UniversityStatus) => items.patch<University>('universities', u.id, { status })

  return (
    <div className="page">
      <PageHead idx="02" title="Universities">
        <button className="btn" onClick={() => askTalvis('Which of my universities should I prioritise, and why?')}>Ask Talvis about this list</button>
        <button className="btn" onClick={() => setExpanded('universities')} title="Search OpenAlex, add by hand, verify, delete"><Wrench size={15} />All tools</button>
        <JobButton kind="find_universities" module="universities" label="Find universities" disabled={!(p.directions.length || state.topics.length || fullState.directions.length)} />
      </PageHead>

      <main className="page-main">
        <h1 className="page-h1">{unis.length} {unis.length === 1 ? 'university' : 'universities'}, sorted by admission chance</h1>
        <p className="page-lead">Talvis estimates each chance from eligibility, competition, supervisor fit, funding and your record. Rankings and language rules link to the official source.</p>

        <div className="criteria-row">
          <span className="eyebrow muted">Your criteria</span>
          <Pill tone="b">{rankingLabel(p.rankingSystem, p.rankingMax)}</Pill>
          <Pill>{p.countries.length ? p.countries.join(' · ') : 'Any country'}</Pill>
          {p.conditions.map((k) => <Pill key={k} tone="g" title={CONDITION_BY_KEY[k]?.label}>{CONDITION_BY_KEY[k]?.short ?? k}</Pill>)}
          <button className="link-btn" onClick={() => setExpanded('profile')}>Edit in Profile</button>
        </div>

        {unis.length === 0 ? (
          <div className="empty-card">
            <b>No universities yet</b>
            <p>Talvis can search for universities that match your directions, countries, ranking limit and conditions, or you can add them by hand.</p>
            <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
              <JobButton kind="find_universities" module="universities" label="Find universities" disabled={!(p.directions.length || state.topics.length)} />
              <button className="btn" onClick={() => setExpanded('universities')}>Add by hand</button>
            </div>
          </div>
        ) : (
          <div className="split-row">
            <div className="table-card">
              <table className="dtable">
                <thead>
                  <tr><th>University</th><th>Admission chance</th><th>Ranking</th><th>Language certificate</th><th>Status</th><th>Researchers</th><th>Deadline</th></tr>
                </thead>
                <tbody>
                  {unis.map((u) => {
                    const dl = nextDeadline(u)
                    const n = dl ? daysUntil(dl.dueDate) : null
                    const lc = u.langCert ?? 'unknown'
                    const band = u.admitChance !== undefined ? admitBand(u.admitChance) : null
                    return (
                      <tr key={u.id} className={sel?.id === u.id ? 'sel' : ''} onClick={() => setSelId(u.id)}>
                        <td>
                          <div className="uni-cell">
                            <i style={{ background: dirColor(u.id) }} />
                            <div>
                              <button className="cell-link" onClick={(e) => { e.stopPropagation(); setSelId(u.id) }}>{u.name}</button>
                              <div className="sub">{[u.city, u.country].filter(Boolean).join(', ')}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          {u.admitChance !== undefined && band ? (
                            <div className="chance">
                              <span className="mini-bar wide"><i style={{ width: `${u.admitChance}%`, background: barColor(u.admitChance) }} /></span>
                              <b>{u.admitChance}%</b>
                              <span className="sub">{band.label}</span>
                            </div>
                          ) : <span className="sub">not estimated</span>}
                        </td>
                        <td>{u.rankLabel ? (u.rankSource ? <a href={u.rankSource} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{u.rankLabel}</a> : u.rankLabel) : <span className="sub">-</span>}</td>
                        <td><Pill tone={LANG_TONE[lc]} title={u.langCertNote}>{LANG_CERT_LABEL[lc] ?? lc}</Pill></td>
                        <td onClick={(e) => e.stopPropagation()}><StatusSelect value={u.status} options={STATUSES} onChange={(v) => setStatus(u, v)} /></td>
                        <td>{researchers(u) ? `${researchers(u)} matching` : <span className="sub">none yet</span>}</td>
                        <td style={{ fontWeight: 600, color: n !== null && n <= 14 ? '#b91c1c' : undefined }}>{dl ? fmtShort(dl.dueDate) : <span className="sub">-</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {sel && <Detail u={sel} researchers={researchers(sel)} deadline={nextDeadline(sel)?.dueDate} />}
          </div>
        )}
      </main>
    </div>
  )
}

function Detail({ u, researchers, deadline }: { u: University; researchers: number; deadline?: string }) {
  const { fullState, setExpanded } = useStore()
  const band = u.admitChance !== undefined ? admitBand(u.admitChance) : null
  const canScout = Boolean(fullState.topics.length || fullState.profile.directions.length)
  const why = [
    u.admitNote && { k: 'Admission estimate', d: u.admitNote, src: u.admitSource },
    u.fitNote && { k: 'Fit with your criteria', d: u.fitNote },
    u.langCertNote && { k: 'Language certificate', d: u.langCertNote, src: u.langCertSource },
    deadline && { k: 'Next deadline', d: `${fmtShort(deadline)} · ${daysUntil(deadline)} days left` },
    { k: 'Researchers', d: researchers ? `${researchers} researchers on your board work here.` : 'No researchers scouted here yet.' },
  ].filter(Boolean) as { k: string; d: string; src?: string }[]
  return (
    <aside className="card detail" aria-label={`Selected: ${u.name}`}>
      <div className="detail-top">
        <div className="eyebrow">Selected</div>
        <h2>{u.name}</h2>
        <div className="sub">{[u.city, u.country, u.rankLabel].filter(Boolean).join(' · ')}</div>
        {band ? (
          <div className="big-row"><span className="big">{u.admitChance}%</span><Pill tone={BAND_TONE[band.tone]}>{band.label} chance</Pill></div>
        ) : (
          <div style={{ marginTop: 14 }}>
            <JobButton kind="admission_chance" module="universities" label="Estimate admission chance" className="btn" />
          </div>
        )}
      </div>
      <div className="detail-body">
        <div className="eyebrow muted">Why this estimate</div>
        {why.map((w) => (
          <div key={w.k} className="why">
            <b>{w.k}</b>
            <p>{w.d}</p>
            {w.src && <a href={w.src} target="_blank" rel="noreferrer">Source <ArrowUpRight size={13} /></a>}
          </div>
        ))}
      </div>
      <div className="detail-actions">
        <JobButton kind="scout_university" module="researchers" params={{ universityId: u.id }} label="Scout researchers" className="btn" disabled={!canScout} />
        <JobButton kind="student_voice" module="insights" params={{ universityId: u.id }} label="Student voice" className="btn" />
        <JobButton kind="verify_deadlines" module="deadlines" params={{ universityId: u.id }} label="Verify deadline" className="btn" />
        {u.website && <a className="btn" href={u.website} target="_blank" rel="noreferrer">Official page <ArrowUpRight size={15} /></a>}
        <button className="btn ghost" onClick={() => askTalvis(`What should I do next for ${u.name}?`)}><Sparkles size={15} />Ask Talvis</button>
        <button className="btn ghost" onClick={() => setExpanded('researchers')}>See researchers</button>
      </div>
    </aside>
  )
}
