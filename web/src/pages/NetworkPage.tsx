import '@xyflow/react/dist/style.css'
import { memo, useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  Background, BackgroundVariant, Controls, Handle, Position, ReactFlow, ReactFlowProvider, useInternalNode, useReactFlow,
  type Edge, type EdgeProps, type Node, type NodeProps,
} from '@xyflow/react'
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force'
import {
  ArrowRight, ArrowUp, CalendarClock, ChevronRight, Fingerprint, Landmark, Library, Lightbulb, Network, Radar, Rocket, Search as SearchIcon, UserRound, X,
  type LucideIcon,
} from 'lucide-react'
import type { AppState, ModuleKey } from '../../../shared/types'
import { daysUntil, statusLabel } from '../lib/util'
import { useStore, type ViewMode } from '../store'
import { PageHead } from '../ui/kit'

type Kind = 'me' | 'topic' | 'university' | 'group' | 'researcher' | 'paper' | 'gap' | 'venue' | 'deadline'
type Layout = 'clusters' | 'force' | 'radial'

const KIND: Record<Kind, { color: string; icon: LucideIcon; module: ModuleKey; page?: ViewMode; label: string; plural: string }> = {
  me: { color: '#1c1917', icon: Fingerprint, module: 'profile', label: 'You', plural: 'You' },
  topic: { color: '#2563eb', icon: Lightbulb, module: 'topics', label: 'Topic', plural: 'Topics' },
  university: { color: '#1c1917', icon: Landmark, module: 'universities', page: 'universities', label: 'University', plural: 'Universities' },
  group: { color: '#0e7490', icon: Network, module: 'groups', label: 'Group', plural: 'Research groups' },
  researcher: { color: '#b45309', icon: UserRound, module: 'researchers', label: 'Researcher', plural: 'Researchers' },
  paper: { color: '#2563eb', icon: Library, module: 'papers', page: 'library', label: 'Paper', plural: 'Papers' },
  gap: { color: '#6d28d9', icon: Radar, module: 'gaps', page: 'library', label: 'Research gap', plural: 'Research gaps' },
  venue: { color: '#15803d', icon: Rocket, module: 'publish', label: 'Journal', plural: 'Journals' },
  deadline: { color: '#b91c1c', icon: CalendarClock, module: 'deadlines', label: 'Deadline', plural: 'Deadlines' },
}
const KINDS: Kind[] = (Object.keys(KIND) as Kind[]).filter((k) => k !== 'me')
const SOFT: Record<string, string> = { '#1c1917': '#f5f5f4', '#2563eb': '#dbeafe', '#0e7490': '#cffafe', '#b45309': '#fef3c7', '#6d28d9': '#ede9fe', '#15803d': '#dcfce7', '#b91c1c': '#fee2e2' }
const LS = 'talvis-graph-shown'

interface GNode extends SimulationNodeDatum { id: string; kind: Kind; label: string; ref: number }
interface Data { kind: Kind; label: string; ref: number; badge?: string; sel?: boolean; near?: boolean; dim?: boolean; [k: string]: unknown }

function savedShown(): Kind[] {
  try {
    const v = JSON.parse(localStorage.getItem(LS) || '[]')
    return Array.isArray(v) ? v.filter((k): k is Kind => KINDS.includes(k)) : []
  } catch {
    return []
  }
}

/** Ids and links of everything the graph shows; the layout only reruns when this changes. */
function graphKey(s: AppState): string {
  return [
    s.profile.name,
    s.topics.map((t) => `${t.id}:${t.title}`).join(','),
    s.universities.map((u) => `${u.id}:${u.name}:${u.admitChance}`).join(','),
    s.groups.map((g) => `${g.id}:${g.universityId}:${g.topicIds.join('.')}`).join(','),
    s.researchers.map((r) => `${r.id}:${r.groupId}:${r.universityId}:${r.topicIds.join('.')}`).join(','),
    s.papers.map((p) => `${p.id}:${p.researcherIds.join('.')}:${p.topicIds.join('.')}`).join(','),
    s.gaps.map((g) => `${g.id}:${g.topicId}:${g.evidence.map((e) => e.paperId).join('.')}`).join(','),
    s.venues.map((v) => v.id).join(','),
    s.deadlines.filter((d) => d.status === 'open').map((d) => `${d.id}:${d.universityId}`).join(','),
  ].join('|')
}

function buildGraph(s: AppState, layout: Layout) {
  const nodes: GNode[] = [{ id: 'me', kind: 'me', label: s.profile.name || 'You', ref: 0 }]
  const links: { source: string; target: string }[] = []
  const add = (id: string, kind: Kind, label: string, ref: number) => nodes.push({ id, kind, label, ref })
  const link = (a: string, b: string) => links.push({ source: a, target: b })
  s.topics.forEach((t) => { add(`t${t.id}`, 'topic', t.title, t.id); link('me', `t${t.id}`) })
  s.universities.forEach((u) => { add(`u${u.id}`, 'university', u.name, u.id); link('me', `u${u.id}`) })
  s.groups.forEach((g) => {
    add(`g${g.id}`, 'group', g.name, g.id)
    if (g.universityId) link(`g${g.id}`, `u${g.universityId}`)
    g.topicIds.forEach((t) => link(`g${g.id}`, `t${t}`))
  })
  s.researchers.forEach((r) => {
    add(`r${r.id}`, 'researcher', r.name, r.id)
    if (r.groupId) link(`r${r.id}`, `g${r.groupId}`)
    else if (r.universityId) link(`r${r.id}`, `u${r.universityId}`)
    r.topicIds.forEach((t) => link(`r${r.id}`, `t${t}`))
  })
  s.papers.forEach((p) => {
    add(`p${p.id}`, 'paper', p.title, p.id)
    p.researcherIds.forEach((r) => link(`p${p.id}`, `r${r}`))
    if (!p.researcherIds.length) p.topicIds.forEach((t) => link(`p${p.id}`, `t${t}`))
  })
  s.gaps.forEach((g) => {
    add(`x${g.id}`, 'gap', g.title, g.id)
    if (g.topicId) link(`x${g.id}`, `t${g.topicId}`)
    g.evidence.forEach((e) => e.paperId && link(`x${g.id}`, `p${e.paperId}`))
  })
  s.venues.forEach((v) => { add(`v${v.id}`, 'venue', v.name, v.id); link('me', `v${v.id}`) })
  s.deadlines.filter((d) => d.status === 'open').forEach((d) => {
    add(`d${d.id}`, 'deadline', d.title, d.id)
    link(`d${d.id}`, d.universityId ? `u${d.universityId}` : 'me')
  })
  const ids = new Set(nodes.map((n) => n.id))
  const valid = links.filter((l) => ids.has(l.source) && ids.has(l.target))

  if (layout === 'radial') {
    const RING: Partial<Record<Kind, number>> = { topic: 230, university: 380, deadline: 500, group: 520, gap: 600, researcher: 700, venue: 780, paper: 900 }
    KINDS.forEach((k, ki) => {
      const ring = nodes.filter((n) => n.kind === k)
      ring.forEach((n, i) => {
        const a = (i / Math.max(1, ring.length)) * Math.PI * 2 + ki * 0.37
        n.x = Math.cos(a) * (RING[k] ?? 600)
        n.y = Math.sin(a) * (RING[k] ?? 600)
      })
    })
    nodes[0].x = 0
    nodes[0].y = 0
  } else {
    // Clusters pull each kind toward its own spot on a circle; force lets the links decide.
    const anchor = (k: Kind) => {
      const i = KINDS.indexOf(k)
      const a = (i / KINDS.length) * Math.PI * 2
      return k === 'me' ? { x: 0, y: 0 } : { x: Math.cos(a) * 620, y: Math.sin(a) * 620 }
    }
    const simLinks = valid.map((l) => ({ ...l }))
    const sim = forceSimulation(nodes)
      .force('link', forceLink<GNode, { source: string; target: string }>(simLinks).id((d) => d.id)
        .distance((l) => ((l.source as unknown as GNode).kind === 'paper' ? 70 : 160)).strength(layout === 'clusters' ? 0.15 : 0.6))
      .force('charge', forceManyBody().strength(-650))
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide<GNode>().radius((d) => (d.kind === 'paper' ? 22 : d.kind === 'me' ? 90 : 70)))
    if (layout === 'clusters') {
      sim.force('x', forceX<GNode>((d) => anchor(d.kind).x).strength(0.25)).force('y', forceY<GNode>((d) => anchor(d.kind).y).strength(0.25))
    }
    sim.stop()
    for (let i = 0; i < 300; i++) sim.tick()
  }
  return { nodes, links: valid }
}

const Pin = memo(function Pin({ data }: NodeProps) {
  const d = data as Data
  const k = KIND[d.kind]
  const I = k.icon
  const icon = d.kind === 'paper'
  return (
    <div
      className={`gnode k-${d.kind} ${icon ? 'icon-only' : ''} ${d.sel ? 'sel' : ''} ${d.dim ? 'dim' : ''}`}
      style={{ '--kc': k.color, '--ks': SOFT[k.color] ?? '#f5f5f4' } as CSSProperties}
      title={`${k.label}: ${d.label}`}
    >
      <Handle type="target" position={Position.Left} className="ghost" isConnectable={false} />
      <Handle type="source" position={Position.Right} className="ghost" isConnectable={false} />
      <span className="gi"><I size={d.kind === 'me' ? 15 : 13} /></span>
      {!icon && <span className="gl">{d.label.length > 30 ? `${d.label.slice(0, 29)}…` : d.label}</span>}
      {d.badge && <span className="gb">{d.badge}</span>}
    </div>
  )
})

const Line = memo(function Line({ source, target, data }: EdgeProps) {
  const a = useInternalNode(source)
  const b = useInternalNode(target)
  if (!a || !b) return null
  const ax = a.internals.positionAbsolute.x + (a.measured.width ?? 0) / 2
  const ay = a.internals.positionAbsolute.y + (a.measured.height ?? 0) / 2
  const bx = b.internals.positionAbsolute.x + (b.measured.width ?? 0) / 2
  const by = b.internals.positionAbsolute.y + (b.measured.height ?? 0) / 2
  const hot = (data as { hot?: boolean } | undefined)?.hot
  return <path d={`M${ax},${ay} L${bx},${by}`} className={`gedge ${hot ? 'hot' : ''}`} />
})

const nodeTypes = { pin: Pin }
const edgeTypes = { line: Line }

function Graph() {
  const { state, fullState, direction, setDirection, setExpanded, setView, chat, send, thinking } = useStore()
  const rf = useReactFlow()
  const [layout, setLayout] = useState<Layout>('clusters')
  const [depth, setDepth] = useState<1 | 2 | 3 | 0>(2)
  const [shown, setShown] = useState<Kind[]>(savedShown)
  const [sel, setSel] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [ask, setAsk] = useState('')

  useEffect(() => {
    try {
      localStorage.setItem(LS, JSON.stringify(shown))
    } catch {
      // storage unavailable: the filter just won't persist
    }
  }, [shown])

  const shape = useMemo(() => graphKey(state), [state])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const g = useMemo(() => buildGraph(state, layout), [shape, layout])

  const adj = useMemo(() => {
    const m = new Map<string, Set<string>>()
    g.links.forEach((l) => {
      if (!m.has(l.source)) m.set(l.source, new Set())
      if (!m.has(l.target)) m.set(l.target, new Set())
      m.get(l.source)!.add(l.target)
      m.get(l.target)!.add(l.source)
    })
    return m
  }, [g])

  const counts = useMemo(() => {
    const c = {} as Record<Kind, number>
    g.nodes.forEach((n) => { c[n.kind] = (c[n.kind] ?? 0) + 1 })
    return c
  }, [g])

  // Kinds picked in the filter, then (with a selection) everything within `depth` steps of it.
  const visible = useMemo(() => {
    const byKind = new Set(g.nodes.filter((n) => n.kind === 'me' || !shown.length || shown.includes(n.kind)).map((n) => n.id))
    if (!sel || !depth || !byKind.has(sel)) return byKind
    const out = new Set([sel])
    let frontier = [sel]
    for (let d = 0; d < depth; d++) {
      const next: string[] = []
      frontier.forEach((id) => adj.get(id)?.forEach((n) => { if (byKind.has(n) && !out.has(n)) { out.add(n); next.push(n) } }))
      frontier = next
    }
    return out
  }, [g, shown, sel, depth, adj])

  const near = sel ? adj.get(sel) ?? new Set<string>() : null
  const uniById = useMemo(() => new Map(state.universities.map((u) => [u.id, u])), [state.universities])
  const nodes: Node[] = useMemo(() => g.nodes.filter((n) => visible.has(n.id)).map((n) => {
    const u = n.kind === 'university' ? uniById.get(n.ref) : undefined
    return {
      id: n.id, type: 'pin', position: { x: n.x ?? 0, y: n.y ?? 0 }, draggable: false,
      data: { kind: n.kind, label: n.label, ref: n.ref, badge: u?.admitChance !== undefined ? `${u.admitChance}%` : undefined, sel: n.id === sel, dim: Boolean(near && n.id !== sel && !near.has(n.id)) } satisfies Data,
    }
  }), [g, visible, sel, near, uniById])
  const edges: Edge[] = useMemo(() => g.links.filter((l) => visible.has(l.source) && visible.has(l.target)).map((l, i) => ({
    id: `e${i}`, source: l.source, target: l.target, type: 'line', selectable: false, focusable: false, data: { hot: sel === l.source || sel === l.target },
  })), [g, visible, sel])

  useEffect(() => {
    const t = window.setTimeout(() => rf.fitView({ padding: 0.15, duration: 300 }), 60)
    return () => window.clearTimeout(t)
  }, [rf, g, shown, depth, sel === null]) // eslint-disable-line react-hooks/exhaustive-deps

  const selNode = g.nodes.find((n) => n.id === sel)
  const matches = q.trim().length >= 2 ? g.nodes.filter((n) => n.label.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : []
  const pick = (id: string) => {
    setSel(id)
    setQ('')
    window.setTimeout(() => rf.fitView({ nodes: [{ id }], duration: 400, maxZoom: 1.1, padding: 1.2 }), 80)
  }
  const open = (n: GNode) => (KIND[n.kind].page ? setView(KIND[n.kind].page!) : setExpanded(KIND[n.kind].module))
  const lastAnswer = [...chat].reverse().find((m) => m.role === 'assistant' && m.text)?.text.replace(/[*_#>`[\]]/g, '').slice(0, 260)

  return (
    <div className="page net-page">
      <PageHead title="Network" sub="How your universities, people, papers and positions connect">
        <div className="search net-search">
          <label className="search-box">
            <SearchIcon size={16} aria-hidden="true" />
            <span className="sr-only">Find a node</span>
            <input value={q} placeholder="Find a university, person or paper" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && matches[0] && pick(matches[0].id)} />
          </label>
          {matches.length > 0 && (
            <div className="search-pop">
              {matches.map((n) => (
                <button key={n.id} onClick={() => pick(n.id)}><span className="eyebrow">{KIND[n.kind].label}</span><span className="lbl">{n.label}</span></button>
              ))}
            </div>
          )}
        </div>
      </PageHead>

      <main className="net-main">
        <aside className="card net-filters" aria-label="Graph filters">
          <div>
            <div className="eyebrow muted">Show</div>
            {KINDS.map((k) => {
              const I = KIND[k].icon
              const on = !shown.length || shown.includes(k)
              return (
                <label key={k} className={`tog ${on ? '' : 'off'}`}>
                  <input type="checkbox" checked={on} onChange={() => setShown((s) => {
                    const cur = s.length ? s : KINDS
                    const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]
                    return next.length === KINDS.length ? [] : next
                  })} />
                  <span className="sw" style={{ color: KIND[k].color, background: SOFT[KIND[k].color] }}><I size={13} /></span>
                  <span className="grow">{KIND[k].plural}</span>
                  <span className="sub">{counts[k] ?? 0}</span>
                </label>
              )
            })}
          </div>
          {fullState.directions.length > 0 && (
            <div>
              <div className="eyebrow muted">Direction</div>
              <label className={`tog ${direction === null ? 'on' : ''}`}><input type="radio" name="gdir" checked={direction === null} onChange={() => setDirection(null)} /><i className="ddot" style={{ background: '#1c1917' }} /><span className="grow">All directions</span></label>
              {fullState.directions.map((d) => (
                <label key={d.id} className={`tog ${direction === d.id ? 'on' : ''}`}><input type="radio" name="gdir" checked={direction === d.id} onChange={() => setDirection(d.id)} /><i className="ddot" style={{ background: d.color }} /><span className="grow">{d.name}</span></label>
              ))}
            </div>
          )}
          <div>
            <div className="eyebrow muted">Layout</div>
            <div className="seg">
              {(['clusters', 'force', 'radial'] as Layout[]).map((l) => <button key={l} className={layout === l ? 'on' : ''} onClick={() => setLayout(l)}>{l[0].toUpperCase() + l.slice(1)}</button>)}
            </div>
          </div>
          <div>
            <div className="eyebrow muted">Connection depth</div>
            <div className="seg">
              {([1, 2, 3, 0] as const).map((d) => <button key={d} className={depth === d ? 'on' : ''} onClick={() => setDepth(d)}>{d || 'All'}</button>)}
            </div>
            <p className="sub" style={{ margin: '8px 0 0', lineHeight: 1.5 }}>How many steps away from the selected node to show.</p>
          </div>
        </aside>

        <section className="card net-graph-card" aria-label="Network graph">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodeOrigin={[0.5, 0.5]}
            minZoom={0.1}
            maxZoom={2.5}
            nodesConnectable={false}
            nodesDraggable={false}
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_, n) => setSel(n.id === sel ? null : n.id)}
            onPaneClick={() => setSel(null)}
            onNodeDoubleClick={(_, n) => { const gn = g.nodes.find((x) => x.id === n.id); if (gn) open(gn) }}
          >
            <Background id="dots" variant={BackgroundVariant.Dots} gap={22} size={1.3} color="#e7e5e4" />
            <Controls position="bottom-left" showInteractive={false} />
          </ReactFlow>
          <div className="graph-count">{nodes.length} of {g.nodes.length} nodes{selNode && depth ? ` · depth ${depth} from ${selNode.label.slice(0, 24)}` : ''}</div>
          <div className="graph-hint">Drag to move · scroll to zoom · click a node to focus</div>
        </section>

        <aside className="card net-inspector" aria-label="Selected node">
          {selNode ? (
            <Inspector n={selNode} adj={adj.get(selNode.id)} all={g.nodes} onPick={pick} onOpen={() => open(selNode)} onClose={() => setSel(null)} />
          ) : (
            <div className="insp-empty">
              <div className="eyebrow">Network</div>
              <h2>Click a node to see how it connects</h2>
              <p>Universities link to their researchers and deadlines, researchers to their papers, papers to the research gaps they support.</p>
              <div className="insp-stats">
                {(['university', 'researcher', 'paper', 'gap'] as Kind[]).map((k) => <div key={k}><b>{counts[k] ?? 0}</b><span>{KIND[k].plural}</span></div>)}
              </div>
            </div>
          )}
          <div className="insp-talvis">
            {lastAnswer && <p><b>Talvis:</b> {lastAnswer}{lastAnswer.length >= 260 ? '…' : ''}</p>}
            <div className="chat-input" style={{ margin: 0 }}>
              <textarea rows={1} value={ask} aria-label="Ask Talvis" placeholder={selNode ? `Ask about ${selNode.label.slice(0, 28)}…` : 'Ask about this network…'} onChange={(e) => setAsk(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && ask.trim() && !thinking) {
                    e.preventDefault()
                    send(selNode ? `About the ${KIND[selNode.kind].label.toLowerCase()} "${selNode.label}": ${ask.trim()}` : ask.trim())
                    setAsk('')
                  }
                }} />
              <button className="send-btn" aria-label="Send" disabled={!ask.trim() || thinking} onClick={() => {
                send(selNode ? `About the ${KIND[selNode.kind].label.toLowerCase()} "${selNode.label}": ${ask.trim()}` : ask.trim())
                setAsk('')
              }}><ArrowUp size={18} /></button>
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}

function Inspector({ n, adj, all, onPick, onOpen, onClose }: { n: GNode; adj?: Set<string>; all: GNode[]; onPick: (id: string) => void; onOpen: () => void; onClose: () => void }) {
  const { state } = useStore()
  const k = KIND[n.kind]
  const I = k.icon
  const neighbours = all.filter((x) => adj?.has(x.id))
  const facts: { v: string; l: string; tone: string }[] = []
  if (n.kind === 'university') {
    const u = state.universities.find((x) => x.id === n.ref)
    const dl = state.deadlines.filter((d) => d.universityId === n.ref && d.status === 'open' && daysUntil(d.dueDate) >= 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
    if (u?.admitChance !== undefined) facts.push({ v: `${u.admitChance}%`, l: 'admission chance', tone: 'g' })
    if (dl) facts.push({ v: `${daysUntil(dl.dueDate)} days`, l: 'to deadline', tone: 'r' })
    if (u) facts.push({ v: statusLabel(u.status), l: 'status', tone: 'n' })
  } else if (n.kind === 'researcher') {
    const r = state.researchers.find((x) => x.id === n.ref)
    if (r?.hIndex !== undefined) facts.push({ v: `h ${r.hIndex}`, l: 'h-index', tone: 'n' })
    if (r) facts.push({ v: statusLabel(r.status), l: 'contact', tone: 'n' })
  } else if (n.kind === 'paper') {
    const p = state.papers.find((x) => x.id === n.ref)
    if (p?.year) facts.push({ v: String(p.year), l: p.venue ?? 'year', tone: 'n' })
    if (p?.citedBy !== undefined) facts.push({ v: String(p.citedBy), l: 'citations', tone: 'n' })
  } else if (n.kind === 'deadline') {
    const d = state.deadlines.find((x) => x.id === n.ref)
    if (d) facts.push({ v: `${daysUntil(d.dueDate)} days`, l: d.verified ? 'verified' : 'not verified', tone: 'r' })
  }
  return (
    <>
      <div className="insp-head">
        <div className="row" style={{ gap: 12 }}>
          <span className="insp-icon" style={{ background: n.kind === 'university' || n.kind === 'me' ? '#1c1917' : SOFT[k.color], color: n.kind === 'university' || n.kind === 'me' ? '#f5b82e' : k.color }}><I size={20} /></span>
          <div className="grow">
            <div className="eyebrow">{k.label}</div>
            <h2>{n.label}</h2>
          </div>
          <button className="icon-ghost" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
        {facts.length > 0 && (
          <div className="insp-facts">
            {facts.slice(0, 2).map((f) => <div key={f.l} className={`t-${f.tone}`}><b>{f.v}</b><span>{f.l}</span></div>)}
          </div>
        )}
      </div>
      <div className="insp-body">
        <div className="eyebrow muted">Connections · {neighbours.length}</div>
        {neighbours.length === 0 && <p className="sub">No connections yet.</p>}
        {neighbours.slice(0, 40).map((x) => (
          <button key={x.id} className="conn" onClick={() => onPick(x.id)}>
            <i style={{ background: KIND[x.kind].color }} />
            <span className="grow ellip">{x.label}</span>
            <span className="sub">{KIND[x.kind].label}</span>
            <ChevronRight size={14} color="#a8a29e" />
          </button>
        ))}
        {n.kind !== 'me' && (
          <button className="btn" style={{ marginTop: 14 }} onClick={onOpen}>Open in {k.page === 'library' ? 'Library' : KIND[n.kind].plural} <ArrowRight size={15} /></button>
        )}
      </div>
    </>
  )
}

export default function NetworkPage() {
  return (
    <ReactFlowProvider>
      <Graph />
    </ReactFlowProvider>
  )
}
