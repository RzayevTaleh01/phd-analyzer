import { memo, useEffect, useRef, type CSSProperties } from 'react'
import { ChevronDown, Maximize2 } from 'lucide-react'
import { MODULE_BY_KEY, type ModuleDef } from '../modules/registry'
import { useStore } from '../store'

export function Corners() {
  return (
    <>
      <span className="corner tl" />
      <span className="corner tr" />
      <span className="corner bl" />
      <span className="corner br" />
    </>
  )
}

// Open cards keep the height their summaries were designed for.
const OPEN_H: Partial<Record<ModuleDef['key'], number>> = { today: 420 }

interface CardProps { moduleKey: ModuleDef['key']; open: boolean; onToggle: (k: ModuleDef['key']) => void }

function ModuleCard({ moduleKey, open, onToggle }: CardProps) {
  const def: ModuleDef = MODULE_BY_KEY[moduleKey]
  const ref = useRef<HTMLDivElement>(null)
  const { state, live, setExpanded } = useStore()
  const Icon = def.icon
  const count = def.count(state)
  const job = state.jobs.find((j) => j.module === def.key && j.status === 'running')
  const isLive = Boolean(live[def.key]) || Boolean(job)

  // Bring a card into view when it opens, e.g. because Talvis started working on it.
  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [open])

  return (
    <div
      ref={ref}
      className={`mod ${isLive ? 'live' : ''} ${open ? '' : 'closed'}`}
      style={{ '--accent': def.accent, height: open ? OPEN_H[def.key] ?? 236 : undefined } as CSSProperties}
    >
      <Corners />
      <div className="mod-head" onClick={() => onToggle(def.key)} title={open ? 'Bağla' : 'Aç'}>
        <span className="mod-idx">{def.idx}</span>
        <span className="mod-icon"><Icon size={14} /></span>
        <span className="mod-title">{def.title}</span>
        <span className="grow" />
        {count !== '' && <span className="mod-count">{count}</span>}
        <button className="mod-btn" title="Genişləndir" onClick={(e) => { e.stopPropagation(); setExpanded(def.key) }}>
          <Maximize2 size={13} />
        </button>
        <span className="mod-chev"><ChevronDown size={14} /></span>
      </div>
      {job && <div className="ticker-bar" />}
      {open && (
        <>
          <div className="mod-body">
            <def.Summary s={state} />
          </div>
          <div className="mod-foot">
            {job ? (
              <span className="mod-job ellip">{job.progress}</span>
            ) : (
              <span className="ellip">{def.desc}</span>
            )}
            <button className="btn sm ghost act" onClick={() => setExpanded(def.key)}>{def.action}</button>
          </div>
        </>
      )}
    </div>
  )
}

export default memo(ModuleCard)
