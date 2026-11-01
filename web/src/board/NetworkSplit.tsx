import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import ModulePanel from '../panels/ModulePanel'
import ChatCore from './ChatCore'
import Graph from './Graph'

// `fixed` says which side keeps the dragged width; the other side takes the rest.
const SIDES = {
  chat: { key: 'talvis-dock-width', min: 320, def: 440 },
  board: { key: 'talvis-cards-width', min: 300, def: 380 },
}

function savedWidth(fixed: keyof typeof SIDES): number {
  try {
    return Number(localStorage.getItem(SIDES[fixed].key)) || SIDES[fixed].def
  } catch {
    return SIDES[fixed].def
  }
}

/** A board on the left with the Talvis chat docked on the right, split by a draggable divider. */
export function DockSplit({ children, fixed = 'chat' }: { children: ReactNode; fixed?: keyof typeof SIDES }) {
  const [width, setWidth] = useState(() => savedWidth(fixed))
  const dragging = useRef(false)
  const { key, min } = SIDES[fixed]

  useEffect(() => {
    try {
      localStorage.setItem(key, String(width))
    } catch {
      // storage unavailable: the width just won't persist
    }
  }, [key, width])

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    const max = Math.max(min, Math.min(820, window.innerWidth - 300))
    const left = e.currentTarget.parentElement?.getBoundingClientRect().left ?? 0
    const w = fixed === 'chat' ? window.innerWidth - e.clientX : e.clientX - left
    setWidth(Math.max(min, Math.min(max, w)))
  }
  const onUp = () => {
    dragging.current = false
  }

  return (
    <div className={`net-split fixed-${fixed}`}>
      <div className="net-graph" style={fixed === 'board' ? { width } : undefined}>{children}</div>
      <div
        className="net-splitter" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        title={fixed === 'chat' ? 'Drag to resize the chat' : 'Drag to resize the cards'}
      />
      <aside className="net-chat" style={fixed === 'chat' ? { width } : undefined}>
        <ChatCore docked />
      </aside>
    </div>
  )
}

/** Network view: knowledge graph on the left, the chat docked on the right. */
export default function NetworkSplit() {
  return (
    <DockSplit>
      <ReactFlowProvider>
        <Graph />
      </ReactFlowProvider>
      <ModulePanel />
    </DockSplit>
  )
}
