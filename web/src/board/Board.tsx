import { useEffect, useMemo, useRef } from 'react'
import {
  Background, BackgroundVariant, Controls, MiniMap, ReactFlow, useNodesState, useReactFlow,
  type Edge, type Node,
} from '@xyflow/react'
import type { ModuleKey } from '../../../shared/types'
import { MODULES } from '../modules/registry'
import { useStore } from '../store'
import CoreNode from './CoreNode'
import ModuleNode from './ModuleNode'
import NeuralEdge from './NeuralEdge'
import { activeEdgeIds, CORE_BOX, DEFAULT_LAYOUT, LINKS, type Box } from './layout'

const nodeTypes = { module: ModuleNode, core: CoreNode }
const edgeTypes = { neural: NeuralEdge }
const LS_KEY = 'phd-board-layout-v1'

function loadSaved(): Partial<Record<ModuleKey, Box>> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}')
  } catch {
    return {}
  }
}

function buildNodes(saved: Partial<Record<ModuleKey, Box>>): Node[] {
  const c = saved.core ?? CORE_BOX
  const nodes: Node[] = [
    { id: 'core', type: 'core', position: { x: c.x, y: c.y }, width: c.w, height: c.h, dragHandle: '.core-head', data: {}, zIndex: 2 },
  ]
  for (const m of MODULES) {
    const b = saved[m.key] ?? DEFAULT_LAYOUT[m.key]
    nodes.push({ id: m.key, type: 'module', position: { x: b.x, y: b.y }, width: b.w, height: b.h, dragHandle: '.mod-head', data: { key: m.key } })
  }
  return nodes
}

export default function Board() {
  const [nodes, setNodes, onNodesChange] = useNodesState(buildNodes(loadSaved()))
  const { live, thinking } = useStore()
  const { fitView } = useReactFlow()
  const saveTimer = useRef(0)

  const edges = useMemo<Edge[]>(() => {
    const act = activeEdgeIds(Object.keys(live) as ModuleKey[])
    return LINKS.map(([s, t]) => {
      const id = `${s}->${t}`
      return { id, source: s, target: t, type: 'neural', data: { active: act.has(id) || (thinking && t === 'core') }, selectable: false, focusable: false }
    })
  }, [live, thinking])

  useEffect(() => {
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      const out: Record<string, Box> = {}
      for (const n of nodes) out[n.id] = { x: n.position.x, y: n.position.y, w: n.width ?? n.measured?.width ?? 300, h: n.height ?? n.measured?.height ?? 236 }
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(out))
      } catch {
        // storage unavailable: layout just won't persist
      }
    }, 400)
  }, [nodes])

  useEffect(() => {
    const reset = () => {
      try {
        localStorage.removeItem(LS_KEY)
      } catch {
        // ignore
      }
      setNodes(buildNodes({}))
      window.setTimeout(() => fitView({ padding: 0.04, duration: 500 }), 50)
    }
    const fit = () => fitView({ padding: 0.04, duration: 500 })
    window.addEventListener('board:reset', reset)
    window.addEventListener('board:fit', fit)
    return () => {
      window.removeEventListener('board:reset', reset)
      window.removeEventListener('board:fit', fit)
    }
  }, [setNodes, fitView])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      fitView
      fitViewOptions={{ padding: 0.04 }}
      minZoom={0.15}
      maxZoom={2.2}
      nodesConnectable={false}
      deleteKeyCode={null}
      zoomOnDoubleClick={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background id="dots" variant={BackgroundVariant.Dots} gap={26} size={1.1} color="rgba(64,200,255,0.16)" />
      <Background id="grid" variant={BackgroundVariant.Lines} gap={208} lineWidth={0.6} color="rgba(64,200,255,0.045)" />
      <MiniMap
        pannable
        zoomable
        position="bottom-right"
        style={{ width: 170, height: 108 }}
        maskColor="rgba(1,4,8,0.72)"
        nodeColor={(n) => (n.id === 'core' ? '#2fd8ff' : live[n.id as ModuleKey] ? '#93ecff' : 'rgba(64,200,255,0.35)')}
        nodeStrokeWidth={0}
      />
      <Controls position="bottom-right" showInteractive={false} style={{ marginRight: 200 }} />
    </ReactFlow>
  )
}
