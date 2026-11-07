import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useStore } from '../store'

/** Pill colours used across the board: green good, amber attention, red urgent, blue info, neutral. */
export type Tone = 'g' | 'a' | 'r' | 'b' | 'n' | 'v'

export function Pill({ tone = 'n', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return <span className={`pill t-${tone}`} title={title}>{children}</span>
}

/** Opens Talvis with an optional prefilled message: the board's chat rail, or the chat drawer on other pages. */
export function askTalvis(text = '') {
  window.dispatchEvent(new CustomEvent('talvis:ask', { detail: text }))
}

export type Sheet = 'accounts' | 'settings'
/** Opens a navbar configuration panel: Claude accounts or settings. */
export function openSheet(sheet: Sheet) {
  window.dispatchEvent(new CustomEvent('sheet:open', { detail: sheet }))
}

/** Something a search result or another page asked a page to select (e.g. one university). */
let pendingFocus: { coll: string; id: number } | null = null
export function focusItem(coll: string, id: number) {
  pendingFocus = { coll, id }
  window.dispatchEvent(new CustomEvent('board:focus', { detail: pendingFocus }))
}
/** The id a page should select on open, if one was asked for. Read once. */
export function useFocus(coll: string, onFocus: (id: number) => void) {
  useEffect(() => {
    if (pendingFocus?.coll === coll) {
      onFocus(pendingFocus.id)
      pendingFocus = null
    }
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ coll: string; id: number }>).detail
      if (d.coll === coll) {
        onFocus(d.id)
        pendingFocus = null
      }
    }
    window.addEventListener('board:focus', h)
    return () => window.removeEventListener('board:focus', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coll])
}

export function useNarrow(px = 760) {
  const q = `(max-width: ${px}px)`
  const [narrow, setNarrow] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const h = () => setNarrow(m.matches)
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [q])
  return narrow
}

/** Page header: back to the board, the module number and title, and the page's actions on the right. */
export function PageHead({ idx, title, sub, children }: { idx?: string; title: string; sub?: ReactNode; children?: ReactNode }) {
  const { setView, direction, fullState, setDirection } = useStore()
  const dir = fullState.directions.find((d) => d.id === direction)
  return (
    <div className="page-head">
      <div className="page-head-in">
        <button className="crumb" onClick={() => setView('modules')}><ArrowLeft size={16} />Board</button>
        <span className="crumb-sep">/</span>
        {idx && <span className="eyebrow">{idx}</span>}
        <span className="page-name">{title}</span>
        {sub && <span className="page-sub">{sub}</span>}
        {dir && (
          <button className="pill t-n filter-pill" onClick={() => setDirection(null)} title="Show all directions">
            <i style={{ background: dir.color }} />{dir.name} ×
          </button>
        )}
        <span className="grow" />
        {children}
      </div>
    </div>
  )
}
