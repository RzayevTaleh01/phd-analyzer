import { useMemo, useState } from 'react'
import { Plus, Star } from 'lucide-react'
import { CRITERIA, directionCounts, interestScore, overallScore } from '../../../shared/directions'
import type { Direction } from '../../../shared/types'
import { items } from '../api'
import { JobButton } from '../panels/ui'
import { useStore } from '../store'
import { PageHead } from '../ui/kit'

const RANK = ['Best fit', '2nd', '3rd', '4th', '5th', '6th']

function Stars({ d }: { d: Direction }) {
  return (
    <span className="stars" title="Your own interest (1-5). Weighted 15% in the comparison.">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = Boolean(d.interest && n <= d.interest)
        return (
          <button key={n} aria-label={`Interest ${n} of 5`} onClick={() => items.patch<Direction>('directions', d.id, { interest: d.interest === n ? undefined : n } as Partial<Direction>)}>
            <Star size={15} fill={on ? '#a16207' : 'none'} color={on ? '#a16207' : '#a8a29e'} />
          </button>
        )
      })}
    </span>
  )
}

export default function DirectionsPage() {
  const { fullState, setExpanded, setDirection, setView } = useStore()
  const counts = useMemo(() => directionCounts(fullState), [fullState])
  const dirs = useMemo(
    () => fullState.directions
      .map((d) => ({ d, score: overallScore(d.analysis?.scores, d.interest) }))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
    [fullState.directions],
  )
  const show = (id: number) => { setDirection(id); setView('modules') }

  return (
    <div className="page">
      <PageHead idx="05" title="Directions">
        <button className="btn" onClick={() => setExpanded('directions')}><Plus size={15} />Add direction</button>
        <JobButton kind="direction_fit" module="directions" label="Re-run comparison" disabled={!dirs.length} />
      </PageHead>

      <main className="page-main">
        <h1 className="page-h1">Which direction fits you best?</h1>
        <p className="page-lead">
          {dirs.length
            ? `Your interests grouped into ${dirs.length} direction${dirs.length === 1 ? '' : 's'}, compared on ${CRITERIA.length} weighted criteria. Every score has evidence you can open.`
            : 'Type your research interests in your profile and Talvis groups them into directions you can compare.'}
        </p>

        {dirs.length === 0 ? (
          <div className="empty-card">
            <b>No directions yet</b>
            <p>Talvis groups your interests into 2 to 5 research directions and adds starter topics for each.</p>
            <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
              <JobButton kind="setup_directions" module="directions" label="Group my interests" disabled={!fullState.profile.directions.length} />
              <button className="btn" onClick={() => setExpanded('profile')}>Edit my interests</button>
            </div>
          </div>
        ) : (
          <>
            <div className="dir-cards">
              {dirs.map(({ d, score }, i) => {
                const c = counts[d.id]
                const best = i === 0 && score !== undefined
                return (
                  <article key={d.id} className={`card dcard ${best ? 'best' : ''} ${d.status === 'dropped' ? 'dropped' : ''}`}>
                    <div className="row" style={{ gap: 10 }}>
                      <i className="ddot" style={{ background: d.color }} />
                      <span className="eyebrow muted">{d.status === 'dropped' ? 'Dropped' : RANK[i] ?? `${i + 1}th`}</span>
                      <span className="grow" />
                      <span className="sub">Your interest</span>
                      <Stars d={d} />
                    </div>
                    <h2>{d.name}</h2>
                    <div className="dscore"><b>{score ?? '–'}</b><span>/ 10 overall fit</span></div>
                    <Summary text={d.analysis?.summary || d.description || 'Not compared yet. Re-run the comparison to score this direction.'} />
                    {d.keywords.length > 0 && (
                      <div className="tags">{d.keywords.slice(0, 5).map((k) => <span key={k}>{k}</span>)}</div>
                    )}
                    <div className="dcounts">
                      <div><b>{c?.universities ?? 0}</b>universities</div>
                      <div><b>{c?.positions ?? 0}</b>positions</div>
                      <div><b>{c?.papers ?? 0}</b>papers</div>
                    </div>
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn sm" onClick={() => show(d.id)}>Show on board</button>
                      <JobButton kind="direction_fit" module="directions" params={{ directionId: d.id }} label="Research this one" className="btn sm ghost" />
                    </div>
                  </article>
                )
              })}
            </div>

            <section className="matrix card" aria-label="Criteria">
              <div className="matrix-in" style={{ gridTemplateColumns: `240px repeat(${dirs.length}, minmax(180px, 1fr))` }}>
                <div className="mh eyebrow muted">Criterion · weight</div>
                {dirs.map(({ d }) => <div key={d.id} className="mh name"><i style={{ background: d.color }} />{d.name}</div>)}
                {CRITERIA.map((cr) => (
                  <Row key={cr.key} label={cr.label} hint={cr.hint} weight={cr.weight} cells={dirs.map(({ d }) => {
                    const s = cr.key === 'interest' ? interestScore(d.interest) ?? d.analysis?.scores?.interest?.score : d.analysis?.scores?.[cr.key]?.score
                    const note = cr.key === 'interest' && d.interest ? `You rated ${d.interest}/5` : d.analysis?.scores?.[cr.key]?.note
                    return { id: d.id, v: s, note, color: d.color }
                  })} />
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

/** Long analysis text: four lines, the rest on click. */
function Summary({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return <p className={open ? 'open' : ''} title={open ? undefined : 'Click to read all'} onClick={() => setOpen(!open)}>{text}</p>
}

function Row({ label, hint, weight, cells }: { label: string; hint: string; weight: number; cells: { id: number; v?: number; note?: string; color: string }[] }) {
  return (
    <>
      <div className="mlabel" title={hint}><b>{label}</b><span>{Math.round(weight * 100)}% of the total</span></div>
      {cells.map((c) => (
        <div key={c.id} className="mcell">
          {c.v !== undefined ? (
            <div className="row" style={{ gap: 10 }}>
              <span className="mini-bar grow"><i style={{ width: `${c.v * 10}%`, background: c.color }} /></span>
              <b>{Math.round(c.v * 10) / 10}</b>
            </div>
          ) : <span className="sub">not scored</span>}
          {c.note && <div className="note" title={c.note}>{c.note}</div>}
        </div>
      ))}
    </>
  )
}
