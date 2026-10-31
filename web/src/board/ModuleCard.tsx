import { memo, type CSSProperties } from 'react'
import { Handle, NodeResizer, Position, useReactFlow, type NodeProps } from '@xyflow/react'
import { Maximize2, ScanSearch } from 'lucide-react'
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

export function GhostHandles() {
  return (
    <>
      <Handle type="target" position={Position.Left} className="ghost" isConnectable={false} />
      <Handle type="source" position={Position.Right} className="ghost" isConnectable={false} />
    </>
  )
}

function ModuleNode({ id, data, selected }: NodeProps) {
  const def: ModuleDef = MODULE_BY_KEY[(data as { key: ModuleDef['key'] }).key]
  const { state, live, setExpanded } = useStore()
  const { fitView } = useReactFlow()
  const Icon = def.icon
  const count = def.count(state)
  const job = state.jobs.find((j) => j.module === def.key && j.status === 'running')
  const isLive = Boolean(live[def.key]) || Boolean(job)

  return (
    <>
      <NodeResizer isVisible={selected} minWidth={240} minHeight={150} />
      <GhostHandles />
      <div className={`mod ${isLive ? 'live' : ''}`} style={{ '--accent': def.accent } as CSSProperties}>
        <Corners />
        <div className="mod-head" onDoubleClick={() => fitView({ nodes: [{ id }], duration: 600, padding: 0.25 })}>
          <span className="mod-idx">{def.idx}</span>
          <span className="mod-icon"><Icon size={14} /></span>
          <span className="mod-title">{def.title}</span>
          {count !== '' && <span className="mod-count">{count}</span>}
          <button className="mod-btn nodrag" title="Yaxınlaşdır" onClick={() => fitView({ nodes: [{ id }], duration: 600, padding: 0.25 })}>
            <ScanSearch size={13} />
          </button>
          <button className="mod-btn nodrag" title="Genişləndir" onClick={() => setExpanded(def.key)}>
            <Maximize2 size={13} />
          </button>
        </div>
        {job && <div className="ticker-bar" />}
        <div className="mod-body nowheel">
          <def.Summary s={state} />
        </div>
        <div className="mod-foot">
          {job ? (
            <span className="mod-job ellip">{job.progress}</span>
          ) : (
            <span className="ellip">{def.desc}</span>
          )}
          <button className="btn sm ghost act nodrag" onClick={() => setExpanded(def.key)}>{def.action}</button>
        </div>
      </div>
    </>
  )
}

export default memo(ModuleNode)
