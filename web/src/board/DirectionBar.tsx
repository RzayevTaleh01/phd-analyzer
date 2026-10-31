import { useMemo, type CSSProperties } from 'react'
import { Compass, Layers } from 'lucide-react'
import { classify, overallScore } from '../../../shared/directions'
import { useStore } from '../store'

/** Strip under the HUD: pick a direction group and the whole board (cards, network, panels, Talvis) follows it. */
export default function DirectionBar() {
  const { fullState, direction, setDirection, setExpanded } = useStore()
  const dirs = fullState.directions
  const counts = useMemo(() => {
    const cls = classify(fullState)
    return Object.fromEntries(
      dirs.map((d) => [
        d.id,
        fullState.topics.filter((x) => cls('topics', x.id).includes(d.id)).length +
          fullState.researchers.filter((x) => cls('researchers', x.id).includes(d.id)).length +
          fullState.papers.filter((x) => cls('papers', x.id).includes(d.id)).length +
          fullState.universities.filter((x) => cls('universities', x.id).includes(d.id)).length,
      ]),
    )
  }, [fullState, dirs])
  if (!dirs.length) return null
  return (
    <div className="dirbar">
      <span className="dirbar-label"><Layers size={11} /> İstiqamət</span>
      <button className={`dir-chip ${direction === null ? 'on' : ''}`} onClick={() => setDirection(null)}>Hamısı</button>
      {dirs.map((d) => {
        const score = overallScore(d.analysis?.scores, d.interest)
        return (
          <button
            key={d.id}
            className={`dir-chip ${direction === d.id ? 'on' : ''} ${d.status === 'dropped' ? 'dropped' : ''}`}
            style={{ '--dc': d.color } as CSSProperties}
            title={`${d.description}\n${counts[d.id]} element${score !== undefined ? ` · uyğunluq ${score}/10` : ''}`}
            onClick={() => setDirection(direction === d.id ? null : d.id)}
          >
            <i />
            {d.name}
            <span className="n">{counts[d.id]}</span>
            {score !== undefined && <span className="sc">{score}</span>}
          </button>
        )
      })}
      <span className="grow" />
      <button className="dir-chip ghost" onClick={() => setExpanded('directions')}><Compass size={11} /> Müqayisə</button>
    </div>
  )
}
