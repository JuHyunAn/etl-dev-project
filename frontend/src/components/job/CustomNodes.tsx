import React, { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
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
  INPUT:         { bg: '#0f2d1a', border: '#1a4731', icon: '#3fb950', text: '#3fb950' },
  TRANSFORM:     { bg: '#0d1f35', border: '#1a3050', icon: '#58a6ff', text: '#58a6ff' },
  OUTPUT:        { bg: '#2d1a07', border: '#3d2c0a', icon: '#f0883e', text: '#f0883e' },
  ORCHESTRATION: { bg: '#1f1035', border: '#2e1f52', icon: '#bc8cff', text: '#bc8cff' },
  LOGS:          { bg: '#2d2007', border: '#3d2c0a', icon: '#d29922', text: '#d29922' },
  AETL:          { bg: '#0d1f35', border: '#1a3050', icon: '#58a6ff', text: '#58a6ff' },
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
  running: 'border-[#58a6ff] shadow-[0_0_0_2px_rgba(88,166,255,0.3)]',
  success: 'border-[#3fb950]',
  failed:  'border-[#f85149]',
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

const ETLNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as NodeData
  const colors = getGroupColors(nodeData.componentType)
  const statusClass = STATUS_COLORS[nodeData.status ?? 'idle']
  const isInput = nodeData.componentType.endsWith('_INPUT') || nodeData.componentType === 'T_PRE_JOB'
  const isOutput = nodeData.componentType.endsWith('_OUTPUT') || nodeData.componentType === 'T_POST_JOB' || nodeData.componentType === 'T_LOG_ROW' || nodeData.componentType === 'T_DIE'

  return (
    <div
      className={`relative min-w-[140px] rounded-lg border-2 transition-all select-none
        ${selected ? 'border-[#58a6ff] shadow-[0_0_0_3px_rgba(88,166,255,0.2)]' : `border-[${colors.border}]`}
        ${statusClass}`}
      style={{ backgroundColor: colors.bg, borderColor: selected ? '#58a6ff' : colors.border }}
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
            <p className="text-[10px] text-[#484f58] truncate">
              {nodeData.componentType.replace('T_', '').replace(/_/g, ' ')}
            </p>
          </div>
        </div>

        {/* Write Mode badge for OUTPUT nodes */}
        {nodeData.componentType === 'T_JDBC_OUTPUT' && nodeData.config?.writeMode && (
          <div className="mt-1 flex items-center">
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#2d1a07] border border-[#3d2c0a] text-[#f0883e] font-mono">
              {nodeData.config.writeMode as string}
            </span>
          </div>
        )}

        {/* Status indicator */}
        {nodeData.status && nodeData.status !== 'idle' && (
          <div className="mt-1.5 flex items-center gap-1">
            {nodeData.status === 'running' && (
              <><span className="w-1.5 h-1.5 rounded-full bg-[#58a6ff] animate-pulse" />
              <span className="text-[10px] text-[#58a6ff]">Running...</span></>
            )}
            {nodeData.status === 'success' && (
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950]" />
                  <span className="text-[10px] text-[#3fb950]">Done</span>
                </div>
                {(nodeData.rowsProcessed !== undefined || nodeData.durationMs !== undefined) && (
                  <span className="text-[9px] text-[#484f58] pl-2.5 font-mono">
                    {nodeData.rowsProcessed !== undefined && `${nodeData.rowsProcessed.toLocaleString()} rows`}
                    {nodeData.durationMs !== undefined && ` in ${nodeData.durationMs}ms`}
                  </span>
                )}
              </div>
            )}
            {nodeData.status === 'failed' && (
              <><span className="w-1.5 h-1.5 rounded-full bg-[#f85149]" />
              <span className="text-[10px] text-[#f85149]">Failed</span></>
            )}
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
  )
})

export const nodeTypes = { etlNode: ETLNode }
