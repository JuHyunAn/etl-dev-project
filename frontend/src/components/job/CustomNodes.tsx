import React, { memo, useCallback } from 'react'
import { Handle, Position, NodeProps, NodeToolbar, useReactFlow } from '@xyflow/react'
import type { ComponentType } from '../../types'

interface NodeData {
  label: string
  componentType: ComponentType
  config?: Record<string, unknown>
  status?: 'idle' | 'running' | 'success' | 'failed'
  rowsProcessed?: number
  durationMs?: number
}

const GROUP_COLORS: Record<string, { bg: string; border: string; icon: string; text: string }> = {
  INPUT:         { bg: '#f0fdf4', border: '#86efac', icon: '#16a34a', text: '#15803d' },
  TRANSFORM:     { bg: '#eff6ff', border: '#93c5fd', icon: '#2563eb', text: '#1d4ed8' },
  OUTPUT:        { bg: '#fff7ed', border: '#fdba74', icon: '#ea580c', text: '#c2410c' },
  ORCHESTRATION: { bg: '#faf5ff', border: '#d8b4fe', icon: '#7c3aed', text: '#6d28d9' },
  LOGS:          { bg: '#fefce8', border: '#fde047', icon: '#ca8a04', text: '#a16207' },
  AETL:          { bg: '#eff6ff', border: '#93c5fd', icon: '#2563eb', text: '#1d4ed8' },
}

function getGroupColors(type: ComponentType) {
  if (type.startsWith('T_JDBC_INPUT') || type.startsWith('T_FILE_INPUT')) return GROUP_COLORS.INPUT
  if (type.startsWith('T_JDBC_OUTPUT') || type.startsWith('T_FILE_OUTPUT')) return GROUP_COLORS.OUTPUT
  if (type.startsWith('T_PRE_JOB') || type.startsWith('T_POST_JOB') || type.startsWith('T_RUN_JOB') || type.startsWith('T_SLEEP')) return GROUP_COLORS.ORCHESTRATION
  if (type.startsWith('T_LOG') || type.startsWith('T_DIE')) return GROUP_COLORS.LOGS
  if (type.startsWith('T_VALIDATE') || type.startsWith('T_PROFILE') || type.startsWith('T_LINEAGE')) return GROUP_COLORS.AETL
  return GROUP_COLORS.TRANSFORM
}

const STATUS_COLORS = {
  idle:    '',
  running: 'border-[#2563eb] shadow-[0_0_0_2px_rgba(37,99,235,0.25)]',
  success: 'border-[#16a34a]',
  failed:  'border-[#dc2626]',
}

function ComponentIcon({ type }: { type: ComponentType }) {
  const isInput = type === 'T_JDBC_INPUT' || type === 'T_FILE_INPUT'
  const isOutput = type === 'T_JDBC_OUTPUT' || type === 'T_FILE_OUTPUT'
  const isDB = type === 'T_JDBC_INPUT' || type === 'T_JDBC_OUTPUT'

  if (isDB) return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
    </svg>
  )
  if (type === 'T_MAP') return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  )
  if (type === 'T_FILTER_ROW') return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </svg>
  )
  if (type === 'T_AGGREGATE_ROW') return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
  if (type === 'T_JOIN') return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  )
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  )
}

const ETLNode = memo(({ id, data, selected }: NodeProps) => {
  const nodeData = data as unknown as NodeData
  const colors = getGroupColors(nodeData.componentType)
  const statusClass = STATUS_COLORS[nodeData.status ?? 'idle']
  const isInput = nodeData.componentType.endsWith('_INPUT') || nodeData.componentType === 'T_PRE_JOB'
  const isOutput = nodeData.componentType.endsWith('_OUTPUT') || nodeData.componentType === 'T_POST_JOB' || nodeData.componentType === 'T_DIE'

  const { deleteElements, addNodes, getNode } = useReactFlow()

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    deleteElements({ nodes: [{ id }] })
  }, [id, deleteElements])

  const handleDuplicate = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const current = getNode(id)
    if (!current) return
    addNodes({
      ...current,
      id: `${nodeData.componentType}-${Date.now()}`,
      position: { x: current.position.x + 30, y: current.position.y + 30 },
      selected: false,
    })
  }, [id, getNode, addNodes, nodeData.componentType])

  return (
    <>
      {/* NodeToolbar: React Flow 포털에 렌더링되어 이벤트 충돌 없음 */}
      <NodeToolbar isVisible={selected} position={Position.Top} align="end" offset={6}>
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleDuplicate}
            title="복제"
            className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold
              bg-white border border-[#e2e8f0] text-[#64748b]
              hover:bg-[#eff6ff] hover:border-[#2563eb] hover:text-[#2563eb] transition-colors shadow-sm"
          >+</button>
          <button
            onClick={handleDelete}
            title="삭제"
            className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold
              bg-white border border-[#e2e8f0] text-[#64748b]
              hover:bg-[#fef2f2] hover:border-[#dc2626] hover:text-[#dc2626] transition-colors shadow-sm"
          >−</button>
        </div>
      </NodeToolbar>

    <div
      className={`relative min-w-[140px] rounded-lg border-2 transition-all select-none
        ${selected ? 'shadow-[0_0_0_3px_rgba(37,99,235,0.2)]' : 'shadow-sm'}
        ${statusClass}`}
      style={{ backgroundColor: colors.bg, borderColor: selected ? '#2563eb' : colors.border }}
    >
      {/* Input Handle */}
      {!isInput && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !-left-1.5"
          style={{ background: colors.icon, border: `2px solid ${colors.border}` }}
        />
      )}

      {/* Node Content */}
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex-shrink-0" style={{ color: colors.icon }}>
            <ComponentIcon type={nodeData.componentType} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate" style={{ color: colors.text }}>
              {nodeData.label}
            </p>
            <p className="text-[10px] truncate" style={{ color: '#94a3b8' }}>
              {nodeData.componentType.replace('T_', '').replace(/_/g, ' ')}
            </p>
          </div>
        </div>

        {/* Write Mode badge for OUTPUT nodes */}
        {nodeData.componentType === 'T_JDBC_OUTPUT' && nodeData.config?.writeMode && (
          <div className="mt-1 flex items-center">
            <span className="text-[9px] px-1.5 py-0.5 rounded font-mono"
              style={{ background: '#fff7ed', border: '1px solid #fdba74', color: '#ea580c' }}>
              {nodeData.config.writeMode as string}
            </span>
          </div>
        )}

      </div>

      {/* Output Handle */}
      {!isOutput && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !-right-1.5"
          style={{ background: colors.icon, border: `2px solid ${colors.border}` }}
        />
      )}
    </div>
    </>
  )
})

export const nodeTypes = { etlNode: ETLNode }
