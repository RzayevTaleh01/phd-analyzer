import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, ChevronsDownUp, ChevronsUpDown, Plus } from 'lucide-react'
import { byAdmitChance } from '../../../shared/criteria'
import { classify, overallScore } from '../../../shared/directions'
import type { ModuleKey, Task } from '../../../shared/types'
import { items } from '../api'
import { daysUntil, todayISO } from '../lib/util'
import { MODULES } from '../modules/registry'
import { useStore } from '../store'
import { askTalvis, useNarrow } from '../ui/kit'
import ChatCore from './ChatCore'
import ModuleCard from './ModuleCard'

type CardKey = Exclude<ModuleKey, 'core'>

const longDate = (d = new Date()) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

function useNextDeadline() {
  const { state } = useStore()
  const next = state.deadlines
    .filter((d) => d.status === 'open' && daysUntil(d.dueDate) >= 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
  const n = next ? daysUntil(next.dueDate) : null
  const uni = next?.universityId ? state.universities.find((u) => u.id === next.universityId)?.name : undefined
  return { next, n, where: uni ?? next?.title }
}

function Stats() {
  const { state } = useStore()
  const { next, n, where } = useNextDeadline()
  const today = todayISO()
  const open = state.tasks.filter((t) => t.status !== 'done' && (!t.dueDate || t.dueDate <= today)).length
  const positions = state.positions.filter((p) => p.status !== 'dismissed').length
  return (
    <div className="stats">
      <div className="stat">
        <div className="v" style={{ color: next ? '#b45309' : undefined }}>{next ? `T-${n} days` : 'None'}</div>
        <div className="k">{next ? `Next deadline · ${where}` : 'No open deadline'}</div>
      </div>
      <div className="stat"><div className="v">{open} {open === 1 ? 'task' : 'tasks'}</div><div className="k">To do today</div></div>
      <div className="stat"><div className="v">{state.papers.length}</div><div className="k">Papers in your library</div></div>
      <div className="stat"><div className="v">{positions}</div><div className="k">Open PhD positions</div></div>
    </div>
  )
}

/** Direction filter: the whole board follows the picked direction. */
function DirectionFilter() {
  const { fullState, direction, setDirection, setView } = useStore()
  const dirs = fullState.directions
  const counts = useMemo(() => {
    const cls = classify(fullState)
    const n = (id: number) => (['topics', 'researchers', 'papers', 'universities'] as const)
      .reduce((sum, c) => sum + fullState[c].filter((x) => cls(c, x.id).includes(id)).length, 0)
    return Object.fromEntries(dirs.map((d) => [d.id, n(d.id)]))
  }, [fullState, dirs])
  if (!dirs.length) return null
  return (
    <div className="dir-filter">
      <span className="eyebrow muted">Direction</span>
      <button className={`dchip all ${direction === null ? 'on' : ''}`} onClick={() => setDirection(null)}>All</button>
      {dirs.map((d) => {
        const sc = overallScore(d.analysis?.scores, d.interest)
        return (
          <button key={d.id} className={`dchip ${direction === d.id ? 'on' : ''} ${d.status === 'dropped' ? 'dropped' : ''}`} onClick={() => setDirection(direction === d.id ? null : d.id)} title={d.description}>
            <i style={{ background: d.color }} />{d.name}
            <span className="n">{counts[d.id]}</span>
            {sc !== undefined && <span className="sc">{sc}</span>}
          </button>
        )
      })}
      <span className="grow" />
      <button className="btn sm" onClick={() => setView('directions')}>Compare directions <ArrowRight size={15} /></button>
    </div>
  )
}

const JOBS: { kind: string; label: string; note: string }[] = [
  { kind: 'find_universities', label: 'Find universities', note: 'Matching your criteria and directions' },
  { kind: 'direction_fit', label: 'Compare directions', note: '8 criteria, with evidence' },
  { kind: 'admission_chance', label: 'Estimate admission chances', note: 'For every university on your list' },
  { kind: 'portal_scan', label: 'Find PhD positions', note: 'DAAD, EURAXESS, FindAPhD and more' },
  { kind: 'verify_deadlines', label: 'Verify deadlines', note: 'From official admission pages' },
  { kind: 'daily_plan', label: 'Plan my day', note: 'From deadlines, tasks and papers' },
]

/** The gold "Run a research job" button: background jobs that need no extra input. */
function JobMenu() {
  const { startJob, claude } = useStore()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div className="menu-wrap" ref={box}>
      <button className="btn primary" aria-expanded={open} onClick={() => setOpen(!open)}><Plus size={16} strokeWidth={2.4} />Run a research job</button>
      {open && (
        <div className="menu" role="menu">
          {claude !== 'connected' && <div className="menu-note">Sign in from the Talvis panel to run jobs.</div>}
          {JOBS.map((j) => (
            <button key={j.kind} role="menuitem" disabled={claude !== 'connected'} onClick={() => { setOpen(false); startJob(j.kind) }}>
              <b>{j.label}</b><span>{j.note}</span>
            </button>
          ))}
          <button role="menuitem" onClick={() => { setOpen(false); askTalvis('Which research job should I run next, and why?') }}>
            <b>Ask Talvis what to run</b><span>It reads the board and suggests one</span>
          </button>
        </div>
      )}
    </div>
  )
}

function useCards() {
  const { state, live } = useStore()
  const [closed, setClosed] = useState<Set<CardKey>>(new Set())
  const wasActive = useRef<Set<CardKey>>(new Set())
  const jobs = useMemo(() => Object.fromEntries(state.jobs.filter((j) => j.status === 'running').map((j) => [j.module, j])), [state.jobs])
  const active = useMemo(() => [...new Set([...Object.keys(live), ...Object.keys(jobs)])].filter((k) => k !== 'core').sort().join(','), [live, jobs])

  // A card Talvis starts working on opens again.
  useEffect(() => {
    const now = new Set((active ? active.split(',') : []) as CardKey[])
    const started = [...now].filter((k) => !wasActive.current.has(k))
    wasActive.current = now
    if (!started.length) return
    setClosed((c) => (started.some((k) => c.has(k)) ? new Set([...c].filter((k) => !started.includes(k))) : c))
  }, [active])

  const toggle = useCallback((k: CardKey) => setClosed((c) => {
    const next = new Set(c)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    return next
  }), [])
  const allClosed = closed.size === MODULES.length
  const toggleAll = () => setClosed(allClosed ? new Set() : new Set(MODULES.map((m) => m.key)))
  return { closed, toggle, allClosed, toggleAll, jobs, active: new Set(active.split(',')) }
}

/** Phone layout from the design: the next deadline, today's plan and the admission shortlist come first. */
function PhoneToday() {
  const { state, setView } = useStore()
  const { next, n, where } = useNextDeadline()
  const today = todayISO()
  const tasks = state.tasks.filter((t) => !t.dueDate || t.dueDate <= today)
  const done = tasks.filter((t) => t.status === 'done').length
  const unis = [...state.universities].filter((u) => u.admitChance !== undefined).sort(byAdmitChance).slice(0, 3)
  const toggle = (t: Task) => items.patch<Task>('tasks', t.id, { status: t.status === 'done' ? 'todo' : 'done' })
  return (
    <div className="phone-today">
      <div>
        <div className="overview-date">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h1 className="phone-h1">Today</h1>
      </div>
      <button className="gold-card" onClick={() => setView('universities')}>
        <span className="eyebrow" style={{ color: '#422006' }}>Next deadline</span>
        <b>{next ? `${n} days` : 'None'}</b>
        <span>{next ? `${where}${next.verified ? ' · verified on official page' : ''}` : 'No open deadline'}</span>
      </button>
      <section className="card phone-card" aria-label="Today's plan">
        <div className="phone-card-head"><span className="mono-idx">04</span><b>Today's plan</b><span className="grow" /><span className="muted-s">{done} of {tasks.length} done</span></div>
        {tasks.length === 0 && <div className="mcard-empty">Nothing planned for today.</div>}
        {tasks.slice(0, 6).map((t) => (
          <label key={t.id} className={`phone-task ${t.status === 'done' ? 'done' : ''}`}>
            <input type="checkbox" checked={t.status === 'done'} onChange={() => toggle(t)} />
            <span className="grow">{t.title}</span>
            {t.module && <span className="muted-s">{t.module.toUpperCase()}</span>}
          </label>
        ))}
      </section>
      {unis.length > 0 && (
        <section className="card phone-card" aria-label="Admission chance">
          <div className="phone-card-head"><span className="mono-idx">02</span><b>Admission chance</b></div>
          {unis.map((u) => (
            <div key={u.id} className="phone-uni">
              <span className="grow ellip">{u.name}</span>
              <span className="mini-bar"><i style={{ width: `${u.admitChance}%`, background: u.admitChance! >= 60 ? '#16a34a' : u.admitChance! >= 40 ? '#d97706' : '#dc2626' }} /></span>
              <b>{u.admitChance}%</b>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

export default function Board() {
  const { state } = useStore()
  const narrow = useNarrow()
  const { closed, toggle, allClosed, toggleAll, jobs, active } = useCards()

  return (
    <div className="board-scroll" id="board-scroll">
      <main className="board-main">
        {narrow ? (
          <PhoneToday />
        ) : (
          <>
            <div className="greet">
              <div>
                <div className="overview-date"><i />{longDate()}</div>
                <h1>Your PhD board, <span className="hl">all in one place</span></h1>
                <p>Talvis keeps your directions, universities, supervisors, papers and deadlines together. Every item links back to a real source.</p>
              </div>
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <button className="btn" onClick={toggleAll}>
                  {allClosed ? <ChevronsUpDown size={16} /> : <ChevronsDownUp size={16} />}{allClosed ? 'Expand all' : 'Collapse all'}
                </button>
                <JobMenu />
              </div>
            </div>
            <Stats />
          </>
        )}
        <DirectionFilter />
        <div className="board-row" id="board-cards">
          <section aria-label="Modules" className="board-grid">
            {MODULES.map((m) => (
              <ModuleCard key={m.key} moduleKey={m.key} s={state} job={jobs[m.key]} live={active.has(m.key)} open={!closed.has(m.key)} onToggle={toggle} />
            ))}
          </section>
          {!narrow && (
            <aside className="board-rail" aria-label="Talvis chat">
              <ChatCore rail />
            </aside>
          )}
        </div>
      </main>
    </div>
  )
}
