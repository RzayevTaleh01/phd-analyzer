import { memo, useMemo, useState, type CSSProperties } from 'react'
import {
  Background, BackgroundVariant, Controls, Handle, Position, ReactFlow, useInternalNode,
  type Edge, type EdgeProps, type Node, type NodeProps,
} from '@xyflow/react'
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationNodeDatum } from 'd3-force'
import { CalendarClock, Fingerprint, Landmark, Library, Lightbulb, Network, Radar, Rocket, UserRound, type LucideIcon } from 'lucide-react'
import type { AppState, ModuleKey } from '../../../shared/types'
import { useStore } from '../store'

type Kind = 'me' | 'topic' | 'university' | 'group' | 'researcher' | 'paper' | 'gap' | 'venue' | 'deadline'

const KIND: Record<Kind, { r: number; color: string; icon: LucideIcon; module: ModuleKey; label: string }> = {
  me: { r: 34, color: '#c9f6ff', icon: Fingerprint, module: 'profile', label: 'Sən' },
  topic: { r: 26, color: '#2fd8ff', icon: Lightbulb, module: 'topics', label: 'Mövzu' },
  university: { r: 24, color: '#5aa9ff', icon: Landmark, module: 'universities', label: 'Universitet' },
  group: { r: 16, color: '#7fd0ff', icon: Network, module: 'groups', label: 'Qrup' },
  researcher: { r: 15, color: '#93ecff', icon: UserRound, module: 'researchers', label: 'Tədqiqatçı' },
  paper: { r: 10, color: '#6f93a8', icon: Library, module: 'papers', label: 'Məqalə' },
  gap: { r: 15, color: '#a594ff', icon: Radar, module: 'gaps', label: 'Gap' },
  venue: { r: 13, color: '#45f0a4', icon: Rocket, module: 'publish', label: 'Jurnal' },
  deadline: { r: 11, color: '#ffb547', icon: CalendarClock, module: 'deadlines', label: 'Deadline' },
}

interface GNode extends SimulationNodeDatum { id: string; kind: Kind; label: string }

function buildGraph(s: AppState) {
  const nodes: GNode[] = [{ id: 'me', kind: 'me', label: s.profile.name || 'Sən' }]
  const links: { source: string; target: string }[] = []
  const add = (id: string, kind: Kind, label: string) => nodes.push({ id, kind, label })
  const link = (a: string, b: string) => links.push({ source: a, target: b })
  const has = (id: string) => nodes.some((n) => n.id === id)

  s.topics.forEach((t) => { add(`t${t.id}`, 'topic', t.title); link('me', `t${t.id}`) })
  s.universities.forEach((u) => { add(`u${u.id}`, 'university', u.name); link('me', `u${u.id}`) })
  s.groups.forEach((g) => {
    add(`g${g.id}`, 'group', g.name)
    if (g.universityId) link(`g${g.id}`, `u${g.universityId}`)
    g.topicIds.forEach((t) => link(`g${g.id}`, `t${t}`))
  })
  s.researchers.forEach((r) => {
    add(`r${r.id}`, 'researcher', r.name)
    if (r.groupId) link(`r${r.id}`, `g${r.groupId}`)
    else if (r.universityId) link(`r${r.id}`, `u${r.universityId}`)
    r.topicIds.forEach((t) => link(`r${r.id}`, `t${t}`))
  })
  s.papers.forEach((p) => {
    add(`p${p.id}`, 'paper', p.title)
    p.researcherIds.forEach((r) => link(`p${p.id}`, `r${r}`))
    if (p.researcherIds.length === 0) p.topicIds.forEach((t) => link(`p${p.id}`, `t${t}`))
  })
  s.gaps.forEach((g) => {
    add(`x${g.id}`, 'gap', g.title)
    if (g.topicId) link(`x${g.id}`, `t${g.topicId}`)
    g.evidence.forEach((e) => e.paperId && link(`x${g.id}`, `p${e.paperId}`))
  })
  s.venues.forEach((v) => { add(`v${v.id}`, 'venue', v.name); link('me', `v${v.id}`) })
  s.deadlines.filter((d) => d.status === 'open').forEach((d) => {
    add(`d${d.id}`, 'deadline', d.title)
    link(`d${d.id}`, d.universityId ? `u${d.universityId}` : 'me')
  })
  const valid = links.filter((l) => has(l.source) && has(l.target))
  // d3 mutates link endpoints into node objects, so simulate on a copy.
  const simLinks = valid.map((l) => ({ ...l }))

  const sim = forceSimulation(nodes)
    .force('link', forceLink<GNode, { source: string; target: string }>(simLinks).id((d) => d.id).distance((l) => {
      const a = (l.source as unknown as GNode).kind
      return a === 'paper' ? 60 : a === 'deadline' ? 70 : 150
    }).strength(0.6))
    .force('charge', forceManyBody().strength(-700))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide<GNode>().radius((d) => KIND[d.kind].r + (d.kind === 'paper' ? 10 : 48)))
    .stop()
  for (let i = 0; i < 320; i++) sim.tick()

  const rfNodes: Node[] = nodes.map((n) => {
    const r = KIND[n.kind].r
    return { id: n.id, type: 'neuron', position: { x: (n.x ?? 0) - r, y: (n.y ?? 0) - r }, data: { kind: n.kind, label: n.label }, width: r * 2, height: r * 2 }
  })
  const rfEdges: Edge[] = valid.map((l, i) => ({ id: `e${i}`, source: l.source, target: l.target, type: 'synapse', selectable: false, focusable: false }))
  return { rfNodes, rfEdges }
}

const Neuron = memo(function Neuron({ data }: NodeProps) {
  const { kind, label } = data as { kind: Kind; label: string }
  const k = KIND[kind]
  const I = k.icon
  return (
    <div className="neuron" style={{ width: k.r * 2, height: k.r * 2, '--accent': k.color } as CSSProperties} title={`${k.label}: ${label}`}>
      <Handle type="target" position={Position.Left} className="ghost" isConnectable={false} />
      <Handle type="source" position={Position.Right} className="ghost" isConnectable={false} />
      <I size={Math.max(9, k.r * 0.8)} />
      {kind !== 'paper' && <span className="neuron-label">{label}</span>}
    </div>
  )
})

const Synapse = memo(function Synapse({ id, source, target }: EdgeProps) {
  const a = useInternalNode(source)
  const b = useInternalNode(target)
  if (!a || !b) return null
  const ax = a.internals.positionAbsolute.x + (a.measured.width ?? 0) / 2
  const ay = a.internals.positionAbsolute.y + (a.measured.height ?? 0) / 2
  const bx = b.internals.positionAbsolute.x + (b.measured.width ?? 0) / 2
  const by = b.internals.positionAbsolute.y + (b.measured.height ?? 0) / 2
  const d = `M${ax},${ay} L${bx},${by}`
  const dur = 3 + (id.length % 7) * 0.6
  return (
    <g className="nedge">
      <path d={d} className="nedge-base" />
      <circle r={1.6} className="nedge-pulse">
        <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={d} begin={`-${(Number(id.slice(1)) % 9) * 0.4}s`} />
      </circle>
    </g>
  )
})

const nodeTypes = { neuron: Neuron }
const edgeTypes = { synapse: Synapse }

export default function Graph() {
  const { state, setExpanded } = useStore()
  const { rfNodes, rfEdges } = useMemo(() => buildGraph(state), [state])
  return (
    <>
      <ReactFlow
        key={`${rfNodes.length}:${rfEdges.length}`}
        defaultNodes={rfNodes}
        defaultEdges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.15}
        maxZoom={2.5}
        nodesConnectable={false}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        onNodeDoubleClick={(_, n) => setExpanded(KIND[(n.data as { kind: Kind }).kind].module)}
      >
        <Background id="dots" variant={BackgroundVariant.Dots} gap={26} size={1.1} color="rgba(64,200,255,0.16)" />
        <Controls position="bottom-right" showInteractive={false} />
      </ReactFlow>
      <Legend />
    </>
  )
}

function Legend() {
  const [open, setOpen] = useState(() => window.innerWidth > 1400)
  return (
    <div className="graph-legend">
      <button className="legend-toggle" onClick={() => setOpen(!open)}>{open ? 'Legendanı gizlət' : 'Legenda'}</button>
      {open && (
        <>
          {(Object.keys(KIND) as Kind[]).map((k) => (
            <div key={k}><span className="sw" style={{ borderColor: KIND[k].color }} />{KIND[k].label}</div>
          ))}
          <div className="faint" style={{ fontSize: 10, marginTop: 4 }}>2x klik: modulu aç</div>
        </>
      )}
    </div>
  )
}
