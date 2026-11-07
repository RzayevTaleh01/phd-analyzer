import { memo, useEffect, useRef } from 'react'
import { Maximize2 } from 'lucide-react'
import type { AppState, Job } from '../../../shared/types'
import { MODULE_BY_KEY, moduleNo, type ModuleDef } from '../modules/registry'
import { useStore } from '../store'

interface CardProps {
  moduleKey: ModuleDef['key']
  s: AppState
  job?: Job
  live: boolean
  open: boolean
  onToggle: (k: ModuleDef['key']) => void
}

/** A module on the board: number, title, count, the three most relevant rows, and its main action. */
function ModuleCard({ moduleKey, s, job, live, open, onToggle }: CardProps) {
  const def = MODULE_BY_KEY[moduleKey]
  const ref = useRef<HTMLElement>(null)
  const { setExpanded, setView } = useStore()
  const count = def.count(s)
  const rows = open ? def.rows(s) : []
  const openFull = () => (def.page ? setView(def.page) : setExpanded(def.key))

  // Bring a card into view when Talvis starts working on it (not on first render).
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (live) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [live])

  return (
    <article ref={ref} className={`card mcard ${live ? 'live' : ''} ${open ? '' : 'closed'}`}>
      <div className="mcard-head">
        <button className="mcard-toggle" onClick={() => onToggle(def.key)} aria-expanded={open} title={open ? 'Collapse' : 'Expand'}>
          <span className="mono-idx">{moduleNo(def.key)}</span>
          <h2>{def.title}</h2>
        </button>
        {count !== '' && <span className="mcard-count">{count}</span>}
        <button className="icon-ghost" aria-label={`Open ${def.title} full screen`} title="Open full screen" onClick={openFull}>
          <Maximize2 size={15} />
        </button>
      </div>
      {open && (
        <>
          {job && (
            <div className="mcard-live"><span className="dot-gold" />{job.progress || job.title}</div>
          )}
          {rows.length ? (
            <ul className="mcard-rows">
              {rows.map((r, i) => (
                <li key={i} title={r.title}>
                  <span className="a">{r.a}</span>
                  <span className={`pill t-${r.tone}`}>{r.b}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mcard-empty">{def.empty}</div>
          )}
          <div className="mcard-foot">
            <span>{def.desc}</span>
            <button className="btn sm" onClick={() => setExpanded(def.key)}>{def.action}</button>
          </div>
        </>
      )}
    </article>
  )
}

export default memo(ModuleCard)
