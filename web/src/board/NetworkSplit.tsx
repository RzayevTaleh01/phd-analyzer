import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import ModulePanel from '../panels/ModulePanel'
import ChatCore from './ChatCore'
import Graph from './Graph'

const LS_KEY = 'talvis-dock-width'
const MIN = 320

function savedWidth(): number {
  try {
    return Number(localStorage.getItem(LS_KEY)) || 440
  } catch {
    return 440
  }
}

/** Network view: knowledge graph on the left, the chat docked on the right. */
export default function NetworkSplit() {
  const [width, setWidth] = useState(savedWidth)
  const dragging = useRef(false)

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, String(width))
    } catch {
      // storage unavailable: the width just won't persist
    }
  }, [width])

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    const max = Math.max(MIN, Math.min(820, window.innerWidth - 300))
    setWidth(Math.max(MIN, Math.min(max, window.innerWidth - e.clientX)))
  }
  const onUp = () => {
    dragging.current = false
  }

  return (
    <div className="net-split">
      <div className="net-graph">
        <ReactFlowProvider>
          <Graph />
        </ReactFlowProvider>
        <ModulePanel />
      </div>
      <div className="net-splitter" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} title="Sürüşdür: çatın enini dəyiş" />
      <aside className="net-chat" style={{ width }}>
        <ChatCore docked />
      </aside>
    </div>
  )
}
