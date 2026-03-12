import React, { memo, useCallback } from 'react'
import { Handle, Position, NodeProps, NodeToolbar, useReactFlow } from '@xyflow/react'
import type { ComponentType } from '../../types'
import { useAppStore } from '../../stores'

const DB_ICON: Record<string, string> = {
  POSTGRESQL: '/psql.png',
  ORACLE:     '/oracle.png',
  MARIADB:    '/mariadb.png',
  MYSQL:      '/mysql.png',
  MSSQL:      '/mssql.png',
}

interface NodeData {
  label: string
  componentType: ComponentType
  config?: Record<string, unknown>
  status?: 'idle' | 'running' | 'success' | 'failed'
  rowsProcessed?: number
  durationMs?: number
}

const GROUP_META: Record<string, { iconBg: string; iconColor: string; categoryLabel: string }> = {
  INPUT:         { iconBg: '#f0fdf4', iconColor: '#16a34a', categoryLabel: 'Input' },
  TRANSFORM:     { iconBg: '#eff6ff', iconColor: '#2563eb', categoryLabel: 'Transform' },
  OUTPUT:        { iconBg: '#fff7ed', iconColor: '#ea580c', categoryLabel: 'Output' },
  ORCHESTRATION: { iconBg: '#faf5ff', iconColor: '#7c3aed', categoryLabel: 'Control' },
  LOGS:          { iconBg: '#fefce8', iconColor: '#ca8a04', categoryLabel: 'Utility' },
}

function getGroupMeta(type: ComponentType) {
  if (type === 'T_DB_COMMIT')   return { iconBg: '#f0fdf4', iconColor: '#16a34a', categoryLabel: 'Control' }
  if (type === 'T_DB_ROLLBACK') return { iconBg: '#fef2f2', iconColor: '#dc2626', categoryLabel: 'Control' }
  if (type === 'T_LOOP')        return { iconBg: '#fff7ed', iconColor: '#ea580c', categoryLabel: 'Control' }
  if (type === 'T_JDBC_INPUT' || type === 'T_FILE_INPUT') return GROUP_META.INPUT
  if (type === 'T_JDBC_OUTPUT' || type === 'T_FILE_OUTPUT') return GROUP_META.OUTPUT
  if (['T_PRE_JOB','T_POST_JOB','T_RUN_JOB','T_SLEEP','T_DB_COMMIT','T_DB_ROLLBACK'].includes(type)) return GROUP_META.ORCHESTRATION
  if (type === 'T_LOG_ROW' || type === 'T_DIE') return GROUP_META.LOGS
  if (['T_VALIDATE','T_PROFILE','T_LINEAGE'].includes(type)) return GROUP_META.LOGS
  return GROUP_META.TRANSFORM
}

const TYPE_NAMES: Partial<Record<ComponentType, string>> = {
  T_JDBC_INPUT:    'JDBC',
  T_FILE_INPUT:    'File',
  T_JDBC_OUTPUT:   'JDBC',
  T_FILE_OUTPUT:   'File',
  T_MAP:           'Map',
  T_FILTER_ROW:    'Filter',
  T_AGGREGATE_ROW: 'Aggregate',
  T_SORT_ROW:      'Sort',
  T_JOIN:          'Join',
  T_CONVERT_TYPE:  'Convert',
  T_REPLACE:       'Replace',
  T_UNION_ROW:     'Union',
  T_PRE_JOB:       'Pre Job',
  T_POST_JOB:      'Post Job',
  T_RUN_JOB:       'Run Job',
  T_SLEEP:         'Sleep',
  T_DB_COMMIT:     'Commit',
  T_DB_ROLLBACK:   'Rollback',
  T_LOG_ROW:       'Log',
  T_DIE:           'Die',
  T_VALIDATE:      'Validate',
  T_PROFILE:       'Profile',
  T_LINEAGE:       'Lineage',
}

function getTypeName(type: ComponentType): string {
  return TYPE_NAMES[type] ?? type.replace(/^T_/, '').replace(/_/g, ' ')
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'success') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 13l4 4L19 7" />
    </svg>
  )
  if (status === 'failed') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
  if (status === 'running') return (
    <div style={{
      width: 14, height: 14, borderRadius: '50%',
      border: '2px solid #2563eb', borderTopColor: 'transparent',
      animation: 'spin 0.8s linear infinite',
    }} />
  )
  return null
}

function ComponentIcon({ type }: { type: ComponentType }) {
  const sz = { width: 20, height: 20 }
  const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

  if (type === 'T_DB_COMMIT') return (
    <svg {...sz} viewBox="0 0 24 24"><path {...s} d="M5 13l4 4L19 7" /></svg>
  )
  if (type === 'T_DB_ROLLBACK') return (
    <svg {...sz} viewBox="0 0 24 24"><path {...s} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
  )
  if (type === 'T_JDBC_INPUT' || type === 'T_JDBC_OUTPUT') return (
    <svg {...sz} viewBox="0 0 24 24"><path {...s} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>
  )
  if (type === 'T_FILE_INPUT' || type === 'T_FILE_OUTPUT') return (
    <svg {...sz} viewBox="0 0 24 24"><path {...s} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
  )
  if (type === 'T_MAP') return (
    <svg {...sz} viewBox="0 0 24 24"><path {...s} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
  )
  if (type === 'T_FILTER_ROW') return (
    <svg {...sz} viewBox="0 0 24 24"><path {...s} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
  )
  if (type === 'T_AGGREGATE_ROW') return (
    <svg {...sz} viewBox="0 0 24 24"><path {...s} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
  )
  if (type === 'T_JOIN') return (
    <svg {...sz} viewBox="0 0 24 24"><path {...s} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
  )
  if (type === 'T_SORT_ROW') return (
    <svg {...sz} viewBox="0 0 24 24"><path {...s} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>
  )
  if (type === 'T_UNION_ROW') return (
    <svg {...sz} viewBox="0 0 24 24"><path {...s} d="M8 16s6-5.686 0-11m8 11s-6-5.686 0-11" /></svg>
  )
  if (type === 'T_PRE_JOB' || type === 'T_POST_JOB') return (
    <svg {...sz} viewBox="0 0 24 24"><path {...s} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path {...s} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  )
  if (type === 'T_RUN_JOB') return (
    <svg {...sz} viewBox="0 0 24 24"><path {...s} d="M5 3l14 9-14 9V3z" /></svg>
  )
  if (type === 'T_LOG_ROW') return (
    <svg {...sz} viewBox="0 0 24 24"><path {...s} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
  )
  if (type === 'T_DIE') return (
    <svg {...sz} viewBox="0 0 24 24"><path {...s} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
  )
  return (
    <svg {...sz} viewBox="0 0 24 24"><path {...s} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
  )
}

const ETLNode = memo(({ id, data, selected }: NodeProps) => {
  const nodeData = data as unknown as NodeData
  const meta = getGroupMeta(nodeData.componentType)
  const status = nodeData.status ?? 'idle'

  const connections = useAppStore(s => s.connections)
  const isJdbc = nodeData.componentType === 'T_JDBC_INPUT' || nodeData.componentType === 'T_JDBC_OUTPUT'
  const dbIconSrc = isJdbc
    ? DB_ICON[connections.find(c => c.id === (nodeData.config?.connectionId as string))?.dbType ?? '']
    : undefined

  const isInputOnly  = nodeData.componentType === 'T_PRE_JOB'
  const isOutputOnly = nodeData.componentType === 'T_POST_JOB'
                    || nodeData.componentType === 'T_DIE'
                    || nodeData.componentType === 'T_DB_ROLLBACK'

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

  const borderColor = selected
    ? '#2563eb'
    : status === 'failed'  ? '#dc2626'
    : status === 'success' ? '#16a34a'
    : '#252b37'

  const boxShadow = selected
    ? '0 0 0 3px rgba(37,99,235,0.18), 0 2px 8px rgba(0,0,0,0.08)'
    : status === 'running'
    ? '0 0 0 2px rgba(37,99,235,0.22), 0 2px 6px rgba(0,0,0,0.07)'
    : '0 1px 4px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)'

  const typeLabel = `${meta.categoryLabel} · ${getTypeName(nodeData.componentType)}`

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

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

      {/* ── Top Handle (target) ── */}
      {!isInputOnly && (
        <Handle
          type="target"
          position={Position.Top}
          style={{
            width: 8, height: 8,
            background: '#ffffff',
            border: `2px solid ${meta.iconColor}`,
            top: -4,
          }}
        />
      )}

      {/* ── Node Card ── */}
      <div
        style={{
          display: 'flex',
          width: 220,
          background: '#ffffff',
          border: `1.5px solid ${borderColor}`,
          borderRadius: 4.5,
          overflow: 'hidden',
          boxShadow,
          transition: 'border-color 0.15s, box-shadow 0.15s',
          userSelect: 'none',
        }}
      >
        {/* Left icon area */}
        <div
          style={{
            width: 52,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: meta.iconBg,
            borderRight: '1px solid #e5e7eb',
            color: meta.iconColor,
          }}
        >
          <ComponentIcon type={nodeData.componentType} />
        </div>

        {/* Right text area */}
        <div
          style={{
            flex: 1,
            padding: '9px 10px 9px 12px',
            minWidth: 0,
            position: 'relative',
          }}
        >
          {/* Status icon — top right */}
          <div style={{ position: 'absolute', top: 8, right: 8 }}>
            <StatusIcon status={status} />
          </div>

          {/* Category · Type label */}
          <p
            style={{
              fontSize: 10,
              color: '#9ca3af',
              margin: 0,
              marginBottom: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              paddingRight: status !== 'idle' ? 18 : 0,
            }}
          >
            {typeLabel}
          </p>

          {/* Node name */}
          <p
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#111827',
              margin: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              paddingRight: 4,
            }}
          >
            {nodeData.label}
          </p>

          {/* T_LOOP 요약 배지 */}
          {nodeData.componentType === 'T_LOOP' && (
            <div style={{ marginTop: 4 }}>
              <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace',
                background: '#fff7ed', border: '1px solid #fdba74', color: '#ea580c' }}>
                {(() => {
                  const c = nodeData.config ?? {}
                  const lt  = (c.loopType   as string) || 'FOR'
                  const fst = (c.forSubType as string) || 'RANGE'
                  if (lt === 'WHILE') return `While (최대 ${c.maxIterations ?? 1000}회)`
                  if (fst === 'LIST') return `LIST (${((c.listValues as string) ?? '').split(',').filter(Boolean).length}개)`
                  const from = (c.from as string) || (c.startDate as string) || (c.start as string) || '?'
                  const to   = (c.to   as string) || (c.endDate   as string) || (c.end   as string) || '?'
                  const step = (c.step as string) || '1'
                  return `${from} ~ ${to} / step ${step}`
                })()}
              </span>
            </div>
          )}

          {/* Write Mode badge */}
          {nodeData.componentType === 'T_JDBC_OUTPUT' && nodeData.config?.writeMode && (
            <div style={{ marginTop: 4 }}>
              <span
                style={{
                  fontSize: 9,
                  padding: '1px 6px',
                  borderRadius: 4,
                  fontFamily: 'monospace',
                  background: '#fff7ed',
                  border: '1px solid #fdba74',
                  color: '#ea580c',
                }}
              >
                {nodeData.config.writeMode as string}
              </span>
            </div>
          )}

          {/* DB 아이콘 */}
          {dbIconSrc && (
            <img
              src={dbIconSrc}
              alt=""
              style={{
                position: 'absolute',
                top: '50%',
                right: 7,
                transform: 'translateY(-50%)',
                width: 38,
                height: 38,
                objectFit: 'contain',
                opacity: 0.8,
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      </div>

      {/* ── Bottom Handle (source) ── */}
      {!isOutputOnly && (
        <Handle
          type="source"
          position={Position.Bottom}
          style={{
            width: 8, height: 8,
            background: '#ffffff',
            border: `2px solid ${meta.iconColor}`,
            bottom: -4,
          }}
        />
      )}
    </>
  )
})

export const nodeTypes = { etlNode: ETLNode }
