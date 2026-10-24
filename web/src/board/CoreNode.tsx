import { memo } from 'react'
import { NodeResizer, type NodeProps } from '@xyflow/react'
import ChatCore from './ChatCore'
import { GhostHandles } from './ModuleNode'

function CoreNode({ selected }: NodeProps) {
  return (
    <>
      <NodeResizer isVisible={selected} minWidth={380} minHeight={460} />
      <GhostHandles />
      <ChatCore />
    </>
  )
}

export default memo(CoreNode)
