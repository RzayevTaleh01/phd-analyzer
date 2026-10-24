import { memo } from 'react'
import { useInternalNode, type EdgeProps, type InternalNode } from '@xyflow/react'

type Rect = { x: number; y: number; w: number; h: number }

function rectOf(n: InternalNode): Rect {
  return {
    x: n.internals.positionAbsolute.x,
    y: n.internals.positionAbsolute.y,
    w: n.measured.width ?? 0,
    h: n.measured.height ?? 0,
  }
}

// Ports sit on the facing sides (mid-point) so lines converge like synapses.
function ports(a: Rect, b: Rect) {
  const overlapX = a.x < b.x + b.w && b.x < a.x + a.w
  if (!overlapX) {
    const right = a.x + a.w <= b.x
    const sx = right ? a.x + a.w : a.x
    const tx = right ? b.x : b.x + b.w
    return { sx, sy: a.y + a.h / 2, tx, ty: b.y + b.h / 2, horizontal: true }
  }
  const down = a.y + a.h <= b.y
  return {
    sx: a.x + a.w / 2,
    sy: down ? a.y + a.h : a.y,
    tx: b.x + b.w / 2,
    ty: down ? b.y : b.y + b.h,
    horizontal: false,
  }
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function NeuralEdge({ id, source, target, data }: EdgeProps) {
  const sn = useInternalNode(source)
  const tn = useInternalNode(target)
  if (!sn || !tn) return null
  const p = ports(rectOf(sn), rectOf(tn))
  const d = p.horizontal
    ? `M${p.sx},${p.sy} C${(p.sx + p.tx) / 2},${p.sy} ${(p.sx + p.tx) / 2},${p.ty} ${p.tx},${p.ty}`
    : `M${p.sx},${p.sy} C${p.sx},${(p.sy + p.ty) / 2} ${p.tx},${(p.sy + p.ty) / 2} ${p.tx},${p.ty}`
  const active = Boolean((data as { active?: boolean } | undefined)?.active)
  const h = hash(id)
  const dur = active ? 1.1 + (h % 5) / 10 : 3.6 + (h % 30) / 10
  const pulses = active ? 3 : 1
  return (
    <g className={`nedge ${active ? 'active' : ''}`}>
      <path d={d} className="nedge-glow" />
      <path d={d} className="nedge-base" />
      {Array.from({ length: pulses }).map((_, i) => (
        <circle key={`${i}-${active}`} r={active ? 2.6 : 1.9} className="nedge-pulse">
          <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={d} begin={`-${((h % 40) / 10 + (i * dur) / pulses).toFixed(2)}s`} />
        </circle>
      ))}
      <circle cx={p.sx} cy={p.sy} r={3} className="nedge-term" />
      <circle cx={p.tx} cy={p.ty} r={3} className="nedge-term" />
    </g>
  )
}

export default memo(NeuralEdge)
