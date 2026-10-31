import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ModuleKey } from '../../../shared/types'
import { MODULES } from '../modules/registry'
import { useStore } from '../store'
import ModuleCard from './ModuleCard'

type CardKey = Exclude<ModuleKey, 'core'>

/** Modules view: the module cards stacked in a column, collapsed until needed. */
export default function Board() {
  const { state, live, thinking } = useStore()
  // Cards Talvis touched during the current turn (or a running job) open on their own;
  // a manual toggle overrides that until Talvis starts on the card again.
  const [auto, setAuto] = useState<Set<CardKey>>(new Set())
  const [manual, setManual] = useState<Partial<Record<CardKey, boolean>>>({})
  const wasThinking = useRef(thinking)
  const wasActive = useRef<Set<CardKey>>(new Set())

  useEffect(() => {
    if (thinking && !wasThinking.current) setAuto(new Set(wasActive.current))
    wasThinking.current = thinking
  }, [thinking])

  const active = useMemo(() => {
    const keys = new Set(Object.keys(live) as ModuleKey[])
    state.jobs.forEach((j) => j.status === 'running' && keys.add(j.module))
    keys.delete('core')
    return [...keys].sort().join(',')
  }, [live, state.jobs])

  useEffect(() => {
    const now = new Set((active ? active.split(',') : []) as CardKey[])
    const started = [...now].filter((k) => !wasActive.current.has(k))
    wasActive.current = now
    if (started.length === 0) return
    setAuto((a) => new Set([...a, ...started]))
    setManual((m) => {
      const next = { ...m }
      started.forEach((k) => delete next[k])
      return next
    })
  }, [active])

  const toggle = useCallback((k: CardKey) => setManual((m) => ({ ...m, [k]: !(m[k] ?? auto.has(k)) })), [auto])

  useEffect(() => {
    const closeAll = () => {
      setAuto(new Set())
      setManual({})
    }
    window.addEventListener('board:reset', closeAll)
    return () => window.removeEventListener('board:reset', closeAll)
  }, [])

  return (
    <div className="cards">
      {MODULES.map((m) => (
        <ModuleCard key={m.key} moduleKey={m.key} open={manual[m.key] ?? auto.has(m.key)} onToggle={toggle} />
      ))}
    </div>
  )
}
