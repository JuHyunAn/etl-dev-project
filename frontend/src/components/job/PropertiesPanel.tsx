import React, { useState, useEffect } from 'react'
import type { Node, Edge } from '@xyflow/react'
import { Input, Select, Button, Spinner } from '../ui'
import type { ComponentType, Connection, ColumnInfo } from '../../types'
import { connectionsApi, schemaApi } from '../../api'
import TablePickerModal from './TablePickerModal'

interface NodeData {
  label: string
  componentType: ComponentType
  config: Record<string, unknown>
}

interface Props {
  node: Node | null
  onUpdate: (nodeId: string, data: Partial<NodeData>) => void
  onDelete: (nodeId: string) => void
  allNodes?: Node[]
  allEdges?: Edge[]
  onOpenMappingEditor?: (outputNodeId: string) => void
}

// ── JSON 예제 정의 ─────────────────────────────────────────────
const JSON_EXAMPLES: Partial<Record<ComponentType, { filename: string; data: unknown }>> = {
  T_MAP: {
    filename: 'tMap_mappings.json',
    data: [
      { sourceNodeId: '', sourceColumn: 'CUST_NM', targetName: 'customer_name', expression: '', type: 'VARCHAR' },
      { sourceNodeId: '', sourceColumn: 'AMT', targetName: 'amount', expression: 'CAST(AMT AS DECIMAL(18,2))', type: 'DECIMAL' },
      { sourceNodeId: '', sourceColumn: '', targetName: 'created_at', expression: 'CURRENT_TIMESTAMP', type: 'TIMESTAMP' },
    ],
  },
  T_FILTER_ROW: {
    filename: 'tFilterRow_condition.json',
    data: { condition: "amount > 1000 AND status = 'ACTIVE'" },
  },
  T_AGGREGATE_ROW: {
    filename: 'tAggregateRow_config.json',
    data: {
      groupBy: 'dept_id, region_cd',
      aggregations: [
        { column: 'sale_amt', function: 'SUM', alias: 'total_sale' },
        { column: 'cust_id', function: 'COUNT', alias: 'cust_count' },
        { column: 'amt', function: 'AVG', alias: 'avg_amt' },
      ],
    },
  },
  T_JOIN: {
    filename: 'tJoin_config.json',
    data: { joinType: 'LEFT', condition: 'a.dept_id = b.dept_id AND a.year = b.year' },
  },
  T_SORT_ROW: {
    filename: 'tSortRow_config.json',
    data: { columns: [{ column: 'created_at', order: 'DESC' }, { column: 'amount', order: 'ASC' }] },
  },
  T_REPLACE: {
    filename: 'tReplace_config.json',
    data: {
      column: 'status_cd',
      rules: [
        { from: '01', to: '정상' },
        { from: '02', to: '휴면' },
        { from: null, to: '미정' },
      ],
    },
  },
  T_CONVERT_TYPE: {
    filename: 'tConvertType_config.json',
    data: {
      conversions: [
        { column: 'reg_dt_str', targetType: 'DATE', expression: "TO_DATE(reg_dt_str, 'YYYYMMDD')" },
        { column: 'amt_str', targetType: 'DECIMAL', expression: 'CAST(amt_str AS DECIMAL(18,2))' },
      ],
    },
  },
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function JsonExampleButton({ type }: { type: ComponentType }) {
  const ex = JSON_EXAMPLES[type]
  if (!ex) return null
  return (
    <button
      onClick={() => downloadJson(ex.filename, ex.data)}
      className="flex items-center gap-1 text-[10px] text-[#94a3b8] hover:text-[#2563eb] transition-colors"
      title="예제 JSON 다운로드">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      예제 JSON
    </button>
  )
}

// ── Connection Selector (공통) ─────────────────────────────────
function ConnectionSelect({ value, onChange }: {
  value: string
  onChange: (id: string) => void
}) {
  const [connections, setConnections] = useState<Connection[]>([])
  useEffect(() => {
    connectionsApi.list().then(setConnections).catch(() => {})
  }, [])

  return (
    <Select label="Connection" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">커넥션 선택...</option>
      {connections.map(c => (
        <option key={c.id} value={c.id}>{c.name} ({c.dbType})</option>
      ))}
    </Select>
  )
}

// ── 컬럼 자동 로드 훅 ─────────────────────────────────────────
function useAutoFetchColumns(
  connId: string,
  config: Record<string, unknown>,
  onChange: (key: string, value: unknown) => void,
) {
  useEffect(() => {
    const tableFull = (config.tableName as string) ?? ''
    if (!connId || !tableFull) return
    // Skip if columns already loaded for this table
    const existingCols = config.columns as ColumnInfo[] | undefined
    if (existingCols && existingCols.length > 0) return

    const parts = tableFull.split('.')
    const table = parts[parts.length - 1]
    const schema = parts.length > 1 ? parts[0] : undefined

    // Debounce: wait 600ms after tableName settles before fetching
    const timer = setTimeout(() => {
      schemaApi.getColumns(connId, table, schema)
        .then(cols => {
          onChange('__raw', { ...config, columns: cols, schemaName: schema ?? config.schemaName ?? '' })
        })
        .catch(() => {})
    }, 600)

    return () => clearTimeout(timer)
  }, [connId, config.tableName]) // eslint-disable-line react-hooks/exhaustive-deps
}

// ── JdbcInput Config ──────────────────────────────────────────
function JdbcInputConfig({ config, onChange }: {
  config: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
}) {
  const [showPicker, setShowPicker] = useState(false)
  const [connections, setConnections] = useState<Connection[]>([])
  const [draftQuery, setDraftQuery] = useState((config.query as string) ?? '')
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState<string | null>(null)

  useEffect(() => {
    connectionsApi.list().then(setConnections).catch(() => {})
  }, [])

  const connId = (config.connectionId as string) ?? ''
  const selectedConn = connections.find(c => c.id === connId)

  useAutoFetchColumns(connId, config, onChange)

  const handleApplyQuery = async () => {
    if (!connId || !draftQuery.trim()) return
    setQueryLoading(true)
    setQueryError(null)
    try {
      const cols = await schemaApi.queryColumns(connId, draftQuery.trim())
      onChange('__raw', { ...config, query: draftQuery.trim(), columns: cols })
    } catch (e: unknown) {
      setQueryError(e instanceof Error ? e.message : '쿼리 실행 오류')
    } finally {
      setQueryLoading(false)
    }
  }

  const handleClearQuery = () => {
    setDraftQuery('')
    setQueryError(null)
    onChange('query', '')
  }

  return (
    <div className="space-y-3">
      <ConnectionSelect value={connId} onChange={v => onChange('connectionId', v)} />

      {/* Table Name + Picker */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-[#64748b]">Table Name</label>
          {connId && (
            <button
              onClick={() => setShowPicker(true)}
              className="flex items-center gap-1 text-[10px] text-[#2563eb] hover:text-[#1d4ed8] transition-colors">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 6h16M4 10h16M10 14h10M4 18h10" />
              </svg>
              테이블 선택
            </button>
          )}
        </div>
        <input
          value={(config.tableName as string) ?? ''}
          onChange={e => onChange('tableName', e.target.value)}
          placeholder="schema.table_name"
          className="w-full bg-[#f8fafc] border border-[#d1d5db] text-[#0f172a] rounded-md px-3 py-2
            text-sm font-mono placeholder-[#94a3b8] focus:outline-none focus:border-[#2563eb]"
        />
      </div>

      {/* Custom Query */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-[#64748b]">Custom Query <span className="text-[#94a3b8] font-normal">(optional)</span></label>
          {(config.query as string) && (
            <button
              onClick={handleClearQuery}
              className="text-[10px] text-[#94a3b8] hover:text-[#ef4444] transition-colors">
              초기화
            </button>
          )}
        </div>
        <textarea
          value={draftQuery}
          onChange={e => { setDraftQuery(e.target.value); setQueryError(null); }}
          placeholder={'SELECT *\nFROM schema.table_name\nWHERE condition'}
          rows={10}
          className="w-full bg-[#f8fafc] border border-[#d1d5db] text-[#0f172a] rounded-md px-3 py-2
            text-xs font-mono placeholder-[#94a3b8] focus:outline-none focus:border-[#2563eb] resize-y"
          style={{ borderColor: queryError ? '#ef4444' : undefined }}
        />
        {queryError && (
          <p className="text-[10px] text-[#ef4444] font-mono leading-snug">{queryError}</p>
        )}
        {(config.query as string) && !queryError && (
          <p className="text-[10px] text-[#16a34a]">✓ 적용됨 — Table Name 설정보다 우선합니다</p>
        )}
        <button
          onClick={handleApplyQuery}
          disabled={!connId || !draftQuery.trim() || queryLoading}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
          style={{
            background: !connId || !draftQuery.trim() ? '#f1f5f9' : '#f0fdf4',
            color: !connId || !draftQuery.trim() ? '#94a3b8' : '#16a34a',
            border: `1px solid ${!connId || !draftQuery.trim() ? '#e2e8f0' : '#bbf7d0'}`,
            cursor: !connId || !draftQuery.trim() || queryLoading ? 'not-allowed' : 'pointer',
          }}
        >
          {queryLoading ? (
            <><Spinner size="sm" /> 쿼리 실행 중...</>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              적용
            </>
          )}
        </button>
      </div>

      {showPicker && connId && selectedConn && (
        <TablePickerModal
          connectionId={connId}
          connectionName={selectedConn.name}
          onSelect={(tableName, schemaName, columns) => {
            const full = schemaName ? `${schemaName}.${tableName}` : tableName
            onChange('__raw', { ...config, tableName: full, schemaName, columns })
          }}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* Column preview */}
      {Array.isArray(config.columns) && (config.columns as ColumnInfo[]).length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-[#94a3b8] font-medium">
            컬럼 {(config.columns as ColumnInfo[]).length}개 로드됨
          </p>
          <div className="max-h-32 overflow-y-auto rounded-md border border-[#e2e8f0] bg-[#f8fafc]">
            {(config.columns as ColumnInfo[]).map(col => (
              <div key={col.columnName}
                className="flex items-center gap-1.5 px-2 py-0.5 border-b border-[#e2e8f0] last:border-0">
                {col.isPrimaryKey && (
                  <svg className="w-2.5 h-2.5 text-[#d29922] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clipRule="evenodd" />
                  </svg>
                )}
                {!col.isPrimaryKey && (
                  <span className="w-2.5 h-2.5 flex-shrink-0 flex items-center justify-center">
                    <span className="w-1 h-1 rounded-full bg-[#cbd5e1]" />
                  </span>
                )}
                <span className="text-xs font-mono text-[#64748b] flex-1 truncate">{col.columnName}</span>
                <span className="text-[11px] text-[#94a3b8] flex-shrink-0">
                  {col.dataType}{col.characterMaxLength ? `(${col.characterMaxLength})` : ''}
                </span>
                {!col.nullable && (
                  <span className="text-[10px] text-[#dc2626] flex-shrink-0">NN</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 증분 처리 설정 */}
      {(() => {
        const inc = (config.incremental as Record<string, unknown>) ?? {}
        const enabled = inc.enabled === true
        return (
          <div className="pt-1 border-t border-[#e2e8f0]">
            {/* 헤더 토글 */}
            <button
              type="button"
              onClick={() => onChange('incremental', { ...inc, enabled: !enabled })}
              className="w-full flex items-center justify-between px-3 py-2 transition-colors"
              style={{
                background: enabled ? '#f0fdf4' : '#f8fafc',
                border: `1px solid ${enabled ? '#86efac' : '#e2e8f0'}`,
                borderRadius: enabled ? '8px 8px 0 0' : '8px',
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                  style={{ background: enabled ? '#16a34a' : '#e2e8f0' }}
                >
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <span className="text-xs font-semibold" style={{ color: enabled ? '#15803d' : '#64748b' }}>
                  증분 처리
                </span>
                {enabled && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ background: '#dcfce7', color: '#16a34a' }}>
                    ON
                  </span>
                )}
              </div>
              <svg
                className="w-3.5 h-3.5 transition-transform"
                style={{ color: enabled ? '#16a34a' : '#94a3b8', transform: enabled ? 'rotate(180deg)' : 'rotate(0deg)' }}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {enabled && (
              <div
                className="rounded-b-lg overflow-hidden"
                style={{ border: '1px solid #d1d5db', borderTop: 'none', background: '#f8fafc' }}
              >
                {/* 옵션 리스트 */}
                <div className="divide-y" style={{ borderColor: '#e2e8f0' }}>
                  {/* 모드 */}
                  <div className="flex items-center px-3 py-2 gap-3">
                    <label className="text-[11px] font-medium w-[72px] flex-shrink-0" style={{ color: '#64748b' }}>모드</label>
                    <select
                      value={(inc.mode as string) ?? 'TIMESTAMP'}
                      onChange={e => onChange('incremental', { ...inc, mode: e.target.value })}
                      className="flex-1 min-w-0 bg-white text-[#0f172a] rounded px-2 py-1 text-[11px] focus:outline-none"
                      style={{ border: '1px solid #e2e8f0' }}
                    >
                      <option value="TIMESTAMP">TIMESTAMP</option>
                      <option value="OFFSET">OFFSET</option>
                    </select>
                  </div>
                  {/* 기준 컬럼 */}
                  <div className="flex items-center px-3 py-2 gap-3">
                    <label className="text-[11px] font-medium w-[72px] flex-shrink-0" style={{ color: '#64748b' }}>기준 컬럼</label>
                    <input
                      value={(inc.column as string) ?? ''}
                      onChange={e => onChange('incremental', { ...inc, column: e.target.value })}
                      placeholder="updated_at"
                      className="flex-1 min-w-0 bg-white text-[#0f172a] rounded px-2 py-1 text-[11px] font-mono placeholder-[#94a3b8] focus:outline-none"
                      style={{ border: '1px solid #e2e8f0' }}
                    />
                  </div>
                  {/* Watermark 변수명 */}
                  <div className="flex items-center px-3 py-2 gap-3">
                    <label className="text-[11px] font-medium w-[72px] flex-shrink-0" style={{ color: '#64748b' }}>변수명</label>
                    <input
                      value={(inc.watermarkVar as string) ?? ''}
                      onChange={e => onChange('incremental', { ...inc, watermarkVar: e.target.value })}
                      placeholder="last_run"
                      className="flex-1 min-w-0 bg-white text-[#0f172a] rounded px-2 py-1 text-[11px] font-mono placeholder-[#94a3b8] focus:outline-none"
                      style={{ border: '1px solid #e2e8f0' }}
                    />
                  </div>
                </div>
                {/* 안내 */}
                <div className="flex items-start gap-1.5 px-3 py-2" style={{ borderTop: '1px solid #e2e8f0', background: '#f1f5f9' }}>
                  <svg className="w-3 h-3 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="#94a3b8" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-[10px] leading-snug" style={{ color: '#64748b' }}>
                    첫 실행: FULL SCAN &nbsp;·&nbsp; 이후: WHERE <span className="font-mono">{(inc.column as string) || 'column'}</span> &gt;= 마지막 watermark
                  </p>
                </div>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}

// ── JdbcOutput Config ─────────────────────────────────────────
function JdbcOutputConfig({ config, onChange }: {
  config: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
}) {
  const [showPicker, setShowPicker] = useState(false)
  const [connections, setConnections] = useState<Connection[]>([])

  useEffect(() => {
    connectionsApi.list().then(setConnections).catch(() => {})
  }, [])

  const connId = (config.connectionId as string) ?? ''
  const selectedConn = connections.find(c => c.id === connId)

  useAutoFetchColumns(connId, config, onChange)

  return (
    <div className="space-y-3">
      <ConnectionSelect value={connId} onChange={v => onChange('connectionId', v)} />

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-[#64748b]">Table Name</label>
          {connId && (
            <button
              onClick={() => setShowPicker(true)}
              className="flex items-center gap-1 text-[10px] text-[#2563eb] hover:text-[#1d4ed8] transition-colors">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 6h16M4 10h16M10 14h10M4 18h10" />
              </svg>
              테이블 선택
            </button>
          )}
        </div>
        <input
          value={(config.tableName as string) ?? ''}
          onChange={e => onChange('tableName', e.target.value)}
          placeholder="schema.table_name"
          className="w-full bg-[#f8fafc] border border-[#d1d5db] text-[#0f172a] rounded-md px-3 py-2
            text-sm font-mono placeholder-[#94a3b8] focus:outline-none focus:border-[#2563eb]"
        />
      </div>

      <Select label="Write Mode" value={(config.writeMode as string) ?? 'INSERT'}
        onChange={e => onChange('writeMode', e.target.value)}>
        <option value="INSERT">INSERT</option>
        <option value="UPSERT">UPSERT (INSERT OR UPDATE)</option>
        <option value="UPDATE">UPDATE</option>
        <option value="DELETE">DELETE</option>
        <option value="TRUNCATE_INSERT">TRUNCATE + INSERT</option>
      </Select>

      {/* UPSERT 시 PK 컬럼 설정 (이기종 Fetch-and-Process 경로에서 사용) */}
      {(config.writeMode as string) === 'UPSERT' && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-[#64748b]">PK 컬럼 <span className="text-[10px] text-[#94a3b8]">(쉼표 구분)</span></label>
          <input
            value={(config.pkColumns as string) ?? ''}
            onChange={e => onChange('pkColumns', e.target.value)}
            placeholder="id, code"
            className="w-full bg-[#f8fafc] border border-[#d1d5db] text-[#0f172a] rounded-md px-3 py-2
              text-xs font-mono placeholder-[#94a3b8] focus:outline-none focus:border-[#2563eb]"
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <input type="checkbox" id="truncate"
          checked={(config.truncateBeforeInsert as boolean) ?? false}
          onChange={e => onChange('truncateBeforeInsert', e.target.checked)}
          className="w-3.5 h-3.5 accent-[#2563eb]" />
        <label htmlFor="truncate" className="text-xs text-[#64748b]">Truncate before insert</label>
      </div>

      {showPicker && connId && selectedConn && (
        <TablePickerModal
          connectionId={connId}
          connectionName={selectedConn.name}
          onSelect={(tableName, schemaName, columns) => {
            const full = schemaName ? `${schemaName}.${tableName}` : tableName
            onChange('__raw', { ...config, tableName: full, schemaName, columns })
          }}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* Column preview */}
      {Array.isArray(config.columns) && (config.columns as ColumnInfo[]).length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-[#94a3b8] font-medium">
            컬럼 {(config.columns as ColumnInfo[]).length}개 로드됨
          </p>
          <div className="max-h-32 overflow-y-auto rounded-md border border-[#e2e8f0] bg-[#f8fafc]">
            {(config.columns as ColumnInfo[]).map(col => (
              <div key={col.columnName}
                className="flex items-center gap-1.5 px-2 py-0.5 border-b border-[#e2e8f0] last:border-0">
                {col.isPrimaryKey && (
                  <svg className="w-2.5 h-2.5 text-[#d29922] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clipRule="evenodd" />
                  </svg>
                )}
                {!col.isPrimaryKey && (
                  <span className="w-2.5 h-2.5 flex-shrink-0 flex items-center justify-center">
                    <span className="w-1 h-1 rounded-full bg-[#cbd5e1]" />
                  </span>
                )}
                <span className="text-xs font-mono text-[#64748b] flex-1 truncate">{col.columnName}</span>
                <span className="text-[11px] text-[#94a3b8] flex-shrink-0">
                  {col.dataType}{col.characterMaxLength ? `(${col.characterMaxLength})` : ''}
                </span>
                {!col.nullable && (
                  <span className="text-[10px] text-[#dc2626] flex-shrink-0">NN</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Filter Config ─────────────────────────────────────────────
function FilterConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-[#64748b]">Filter Expression</label>
          <JsonExampleButton type="T_FILTER_ROW" />
        </div>
        <textarea
          value={(config.condition as string) ?? ''}
          onChange={e => onChange('condition', e.target.value)}
          placeholder={"e.g. amount > 1000 AND status = 'ACTIVE'"}
          rows={9}
          className="w-full bg-[#f8fafc] border border-[#d1d5db] text-[#0f172a] rounded-md px-3 py-2
            text-xs font-mono placeholder-[#94a3b8] focus:outline-none focus:border-[#2563eb] resize-y"
        />
      </div>
    </div>
  )
}

// ── Map Config (TOS 스타일 아코디언 — Output별 매핑 JSON) ────────
function MapConfig({
  nodeId, config, onChange, allNodes, allEdges, onOpenMappingEditor,
}: {
  nodeId: string
  config: Record<string, unknown>
  onChange: (k: string, v: unknown) => void
  allNodes?: Node[]
  allEdges?: Edge[]
  onOpenMappingEditor?: (outputNodeId: string) => void
}) {
  // 초기 열림 상태 추적
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())
  const initializedRef = React.useRef(false)

  // 이 tMap에서 ROW 엣지로 직접 연결된 T_JDBC_OUTPUT 노드 목록
  // (직접 연결 + BFS 양쪽 모두 지원)
  const connectedOutputs = React.useMemo(() => {
    if (!allEdges || !allNodes) return []

    // ROW 엣지 source→targets 맵
    const rowEdgesBySource: Record<string, string[]> = {}
    allEdges.forEach(e => {
      const lt = (e.data as Record<string, unknown>)?.linkType as string | undefined
      if (lt === 'ROW' || lt === undefined || lt === null) {
        if (!rowEdgesBySource[e.source]) rowEdgesBySource[e.source] = []
        rowEdgesBySource[e.source].push(e.target)
      }
    })

    // forward BFS로 모든 downstream 노드 수집
    const visited = new Set<string>()
    const queue: string[] = [nodeId]
    while (queue.length > 0) {
      const id = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      const nexts = rowEdgesBySource[id] || []
      nexts.forEach(t => queue.push(t))
    }
    visited.delete(nodeId)

    const outMaps = (config.outputMappings ?? {}) as Record<string, unknown>

    return allNodes
      .filter(n => {
        if (!visited.has(n.id)) return false
        const d = n.data as Record<string, unknown>
        return d?.componentType === 'T_JDBC_OUTPUT'
      })
      .map(n => {
        const d = n.data as Record<string, unknown>
        const cfg = (d?.config ?? {}) as Record<string, unknown>
        const writeMode = (cfg?.writeMode as string) || 'INSERT'
        // 매핑 수: outputMappings[id] 우선, 단일 output이면 legacy mappings 폴백
        let mappingCount = 0
        const specific = outMaps[n.id]
        if (Array.isArray(specific)) mappingCount = specific.length
        else if (Array.isArray(config.mappings)) mappingCount = (config.mappings as unknown[]).length
        return {
          id: n.id,
          label: (d?.label as string) || 'Output',
          tableName: (cfg?.tableName as string) || '',
          writeMode,
          mappingCount,
        }
      })
  }, [nodeId, allEdges, allNodes, config])

  // 처음 outputs이 감지되면 전부 열기
  React.useEffect(() => {
    if (!initializedRef.current && connectedOutputs.length > 0) {
      setExpandedIds(new Set(connectedOutputs.map(o => o.id)))
      initializedRef.current = true
    }
  }, [connectedOutputs])

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 특정 Output의 매핑 JSON 문자열 반환
  const getMappingJson = (outputId: string): string => {
    const outMaps = (config.outputMappings ?? {}) as Record<string, unknown>
    const val = outMaps[outputId]
    if (Array.isArray(val)) return JSON.stringify(val, null, 2)
    if (typeof val === 'string') return val
    // legacy fallback: 단일 output이면 config.mappings 표시
    if (connectedOutputs.length === 1) {
      const m = config.mappings
      if (Array.isArray(m)) return JSON.stringify(m, null, 2)
      if (typeof m === 'string') return m as string
    }
    return '[]'
  }

  // 매핑 JSON 변경 시 outputMappings에 저장
  const handleMappingChange = (outputId: string, raw: string) => {
    const outMaps = ((config.outputMappings ?? {}) as Record<string, unknown>)
    try {
      const parsed = JSON.parse(raw)
      onChange('__raw', { ...config, outputMappings: { ...outMaps, [outputId]: parsed } })
    } catch {
      // 파싱 실패 시 문자열 그대로 보관 (입력 중)
      onChange('__raw', { ...config, outputMappings: { ...outMaps, [outputId]: raw } })
    }
  }

  const writeModeColor: Record<string, { bg: string; text: string }> = {
    INSERT:          { bg: '#dbeafe', text: '#1d4ed8' },
    TRUNCATE_INSERT: { bg: '#fef9c3', text: '#92400e' },
    UPDATE:          { bg: '#dcfce7', text: '#166534' },
    UPSERT:          { bg: '#f3e8ff', text: '#6b21a8' },
  }

  return (
    <div className="space-y-2">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-0.5">
        <label className="text-xs font-medium" style={{ color: '#374151' }}>
          Output 매핑
          <span className="ml-1.5 text-[10px] font-normal" style={{ color: '#94a3b8' }}>
            ({connectedOutputs.length}개 연결됨)
          </span>
        </label>
      </div>

      {/* Output 없을 때 경고 */}
      {connectedOutputs.length === 0 && (
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-md text-[10px]"
          style={{ background: '#fef9c3', border: '1px solid #fde68a', color: '#92400e' }}>
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          T_JDBC_OUTPUT 노드를 ROW 엣지로 연결하면 Output별 매핑이 표시됩니다
        </div>
      )}

      {/* Output별 아코디언 */}
      {connectedOutputs.map(out => {
        const isOpen = expandedIds.has(out.id)
        const wmc = writeModeColor[out.writeMode] ?? { bg: '#f1f5f9', text: '#64748b' }
        return (
          <div key={out.id} className="rounded-md overflow-hidden"
            style={{ border: '1px solid #e2e8f0' }}>
            {/* 아코디언 헤더 */}
            <button
              className="w-full flex items-center gap-2 px-2.5 py-2 text-left transition-colors"
              style={{ background: isOpen ? '#f0f9ff' : '#f8fafc' }}
              onClick={() => toggleExpand(out.id)}>
              {/* 화살표 */}
              <svg className="w-3 h-3 flex-shrink-0 transition-transform"
                style={{ color: '#64748b', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {/* DB 아이콘 */}
              <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                style={{ background: '#dbeafe' }}>
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="#2563eb">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
              </div>
              {/* 테이블명 */}
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-semibold truncate block" style={{ color: '#0f172a' }}>
                  {out.tableName || out.label}
                </span>
                {out.tableName && (
                  <span className="text-[9px]" style={{ color: '#94a3b8' }}>{out.label}</span>
                )}
              </div>
              {/* Write Mode 뱃지 */}
              <span className="text-[9px] px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                style={{ background: wmc.bg, color: wmc.text }}>
                {out.writeMode}
              </span>
              {/* 매핑 수 */}
              <span className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                style={{
                  background: out.mappingCount > 0 ? '#dcfce7' : '#f1f5f9',
                  color: out.mappingCount > 0 ? '#16a34a' : '#94a3b8',
                }}>
                {out.mappingCount > 0 ? `${out.mappingCount}` : '0'}
              </span>
            </button>

            {/* 아코디언 바디 */}
            {isOpen && (
              <div className="px-2.5 pb-2.5 pt-1.5 space-y-1.5"
                style={{ background: '#ffffff', borderTop: '1px solid #e2e8f0' }}>
                {/* 시각적 에디터 버튼 */}
                <div className="flex justify-end">
                  <button
                    onClick={() => onOpenMappingEditor?.(out.id)}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded font-medium"
                    style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    시각적 매핑 에디터
                  </button>
                </div>
                {/* JSON textarea */}
                <textarea
                  value={getMappingJson(out.id)}
                  onChange={e => handleMappingChange(out.id, e.target.value)}
                  rows={8}
                  spellCheck={false}
                  placeholder='[{"sourceColumn": "col_a", "targetName": "col_b", "expression": "", "type": "VARCHAR"}]'
                  className="w-full bg-[#f8fafc] border border-[#d1d5db] text-[#0f172a] rounded px-2.5 py-2
                    text-xs font-mono placeholder-[#94a3b8] focus:outline-none focus:border-[#2563eb] resize-y"
                />
              </div>
            )}
          </div>
        )
      })}

      {/* Output 없을 때 — legacy JSON 폴백 (Output 미연결 상태에서도 편집 가능) */}
      {connectedOutputs.length === 0 && (
        <div className="space-y-1">
          <label className="text-[10px]" style={{ color: '#94a3b8' }}>기본 매핑 (JSON)</label>
          <textarea
            value={typeof config.mappings === 'string'
              ? config.mappings as string
              : JSON.stringify(config.mappings ?? [], null, 2)}
            onChange={e => onChange('mappings', e.target.value)}
            rows={10}
            spellCheck={false}
            placeholder='[{"sourceColumn": "col_a", "targetName": "col_b", "expression": "", "type": "VARCHAR"}]'
            className="w-full bg-[#f8fafc] border border-[#d1d5db] text-[#0f172a] rounded px-2.5 py-2
              text-xs font-mono placeholder-[#94a3b8] focus:outline-none focus:border-[#2563eb] resize-y"
          />
        </div>
      )}
    </div>
  )
}

// ── Aggregate Config ──────────────────────────────────────────
function AggregateConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <div className="space-y-3">
      <Input label="Group By Columns" value={(config.groupBy as string) ?? ''}
        onChange={e => onChange('groupBy', e.target.value)} placeholder="col1, col2" />
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-[#64748b]">Aggregations (JSON)</label>
          <JsonExampleButton type="T_AGGREGATE_ROW" />
        </div>
        <textarea
          value={typeof config.aggregations === 'string'
            ? config.aggregations
            : JSON.stringify(config.aggregations ?? [], null, 2)}
          onChange={e => onChange('aggregations', e.target.value)}
          placeholder={'[{"column": "amount", "function": "SUM", "alias": "total_amount"}]'}
          rows={12}
          className="w-full bg-[#f8fafc] border border-[#d1d5db] text-[#0f172a] rounded-md px-3 py-2
            text-xs font-mono placeholder-[#94a3b8] focus:outline-none focus:border-[#2563eb] resize-y"
        />
      </div>
    </div>
  )
}

// ── Join Config ───────────────────────────────────────────────
function JoinConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#64748b]">Join Config</span>
        <JsonExampleButton type="T_JOIN" />
      </div>
      <Select label="Join Type" value={(config.joinType as string) ?? 'INNER'}
        onChange={e => onChange('joinType', e.target.value)}>
        <option value="INNER">INNER JOIN</option>
        <option value="LEFT">LEFT JOIN</option>
        <option value="RIGHT">RIGHT JOIN</option>
        <option value="FULL">FULL OUTER JOIN</option>
      </Select>
      <Input label="Join Condition" value={(config.condition as string) ?? ''}
        onChange={e => onChange('condition', e.target.value)}
        placeholder="a.id = b.id AND a.type = b.type" />
    </div>
  )
}

// ── Sort Config ───────────────────────────────────────────────
function SortConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-[#64748b]">Sort Columns (JSON)</label>
        <JsonExampleButton type="T_SORT_ROW" />
      </div>
      <textarea
        value={typeof config.columns === 'string'
          ? config.columns
          : JSON.stringify(config.columns ?? [], null, 2)}
        onChange={e => onChange('columns', e.target.value)}
        placeholder={'[{"column": "created_at", "order": "DESC"}]'}
        rows={12}
        className="w-full bg-[#f8fafc] border border-[#d1d5db] text-[#0f172a] rounded-md px-3 py-2
          text-xs font-mono placeholder-[#94a3b8] focus:outline-none focus:border-[#2563eb] resize-y"
      />
    </div>
  )
}

// ── Generic Config ────────────────────────────────────────────
// ── T_LOOP 설정 패널 ──────────────────────────────────────────
function LoopConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  const loopType   = (config.loopType   as string) || 'FOR'    // 'FOR' | 'WHILE'
  const forSubType = (config.forSubType as string) || 'RANGE'  // 'RANGE' | 'LIST'
  const loopVar    = (config.loopVar    as string) || ''

  const set = (k: string, v: unknown) => onChange('__raw', { ...config, [k]: v })

  const fromVal = (config.from as string) || ''
  const toVal   = (config.to   as string) || ''

  // yyyyMMdd 패턴 자동 감지
  const isDateLike = (v: string) => /^(19|20)\d{6}$/.test(v)
  const isDateMode = isDateLike(fromVal) || isDateLike(toVal)

  // 프리뷰 계산
  const preview = React.useMemo(() => {
    if (loopType === 'WHILE') return null
    if (forSubType === 'LIST') {
      const vals = (config.listValues as string)?.split(',').map(v => v.trim()).filter(Boolean) ?? []
      return vals.length ? `${vals.length}개 항목` : null
    }
    if (!fromVal || !toVal) return null
    if (toVal.startsWith('context.'))   return `TO: ${toVal} (실행 시 동적 결정)`
    if (fromVal.startsWith('context.')) return `FROM: ${fromVal} (실행 시 동적 결정)`
    if (isDateMode) {
      try {
        const parseD = (s: string) => new Date(+s.slice(0,4), +s.slice(4,6)-1, +s.slice(6,8))
        const sd = parseD(fromVal), ed = parseD(toVal)
        if (isNaN(sd.getTime()) || isNaN(ed.getTime()) || sd > ed) return null
        const step = parseInt(config.step as string) || 1
        const unit = (config.stepUnit as string) || 'DAY'
        let cnt = 0; const cur = new Date(sd)
        while (cur <= ed && cnt < 1000) {
          cnt++
          if (unit === 'MONTH')     cur.setMonth(cur.getMonth() + step)
          else if (unit === 'YEAR') cur.setFullYear(cur.getFullYear() + step)
          else                      cur.setDate(cur.getDate() + step)
        }
        return `${cnt}회 반복`
      } catch { return null }
    }
    const s = parseInt(fromVal), e = parseInt(toVal)
    const st = parseInt(config.step as string) || 1
    if (isNaN(s) || isNaN(e)) return null
    if (st === 0) return '(step=0은 불가)'
    const cnt = st > 0 ? Math.max(0, Math.floor((e - s) / st) + 1) : Math.max(0, Math.floor((s - e) / -st) + 1)
    return `${cnt}회 반복`
  }, [loopType, forSubType, fromVal, toVal, config.step, config.stepUnit, config.listValues, isDateMode])

  const inputCls = "w-full px-2 py-1.5 rounded text-xs font-mono outline-none"
  const inputSty = { border: '1px solid #d1d5db', background: '#f8fafc', color: '#0f172a' }

  return (
    <div className="space-y-3">

      {/* ① Loop Type: FOR / WHILE */}
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: '#374151' }}>Loop Type</label>
        <div className="flex gap-1">
          {(['FOR', 'WHILE'] as const).map(t => (
            <button key={t} onClick={() => set('loopType', t)}
              className="flex-1 py-1 rounded text-[11px] font-medium transition-colors"
              style={{
                background: loopType === t ? '#fff7ed' : '#f8fafc',
                border: `1px solid ${loopType === t ? '#fb923c' : '#e2e8f0'}`,
                color: loopType === t ? '#ea580c' : '#64748b',
              }}>
              {t === 'FOR' ? 'For 문' : 'While 문'}
            </button>
          ))}
        </div>
      </div>

      {/* ② 반복값 변수명 — FOR/WHILE 공통 */}
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: '#374151' }}>
          반복값 변수명
          {loopType === 'WHILE' && <span className="ml-1" style={{ color: '#94a3b8', fontWeight: 400 }}>(선택)</span>}
        </label>
        <input value={loopVar} onChange={e => set('loopVar', e.target.value)}
          placeholder={loopType === 'FOR' ? (isDateMode ? 'BIZ_DT' : 'LOOP_INDEX') : 'ATTEMPT_NO'}
          className={inputCls} style={inputSty} />
        <div className="mt-1 px-2 py-1.5 rounded text-[10px]" style={{ background: '#f5f3ff', border: '1px solid #e9d5ff' }}>
          <p style={{ color: '#6d28d9' }}>
            Loop 컴포넌트가 자체적으로 생성하는 변수(<code style={{ background: '#ede9fe', padding: '0 3px', borderRadius: 3 }}>context.{loopVar || '변수명'})</code>
          </p>
          {/* <p className="mt-0.5" style={{ color: '#7c3aed' }}>
            → tMap · SQL 등에서 <strong>context.{loopVar || '변수명'}</strong> 으로 참조하세요.
          </p> */}
          <p className="mt-0.5" style={{ color: '#94a3b8' }}>Context 변수(FUNCTION)와 별개로 변수 추가 필요 없음</p>
        </div>
      </div>

      {/* ③-A FOR문 옵션 */}
      {loopType === 'FOR' && (
        <>
          {/* 서브타입: 범위 / 목록 */}
          <div className="flex gap-1">
            {(['RANGE', 'LIST'] as const).map(t => (
              <button key={t} onClick={() => set('forSubType', t)}
                className="flex-1 py-1 rounded text-[11px] font-medium transition-colors"
                style={{
                  background: forSubType === t ? '#fff7ed' : '#f8fafc',
                  border: `1px solid ${forSubType === t ? '#fb923c' : '#e2e8f0'}`,
                  color: forSubType === t ? '#ea580c' : '#64748b',
                }}>
                {t === 'RANGE' ? '범위 (FROM ~ TO)' : '목록 (LIST)'}
              </button>
            ))}
          </div>

          {/* RANGE 입력 */}
          {forSubType === 'RANGE' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] block mb-0.5" style={{ color: '#94a3b8' }}>FROM</label>
                  <input value={fromVal} onChange={e => set('from', e.target.value)}
                    placeholder="1 또는 20260101"
                    className={inputCls} style={inputSty} />
                </div>
                <div>
                  <label className="text-[10px] flex items-center gap-1 mb-0.5" style={{ color: '#94a3b8' }}>
                    TO
                    <span className="px-1 rounded" style={{ background: '#f0fdf4', color: '#16a34a', fontSize: '9px' }}>context.VAR 가능</span>
                  </label>
                  <input value={toVal} onChange={e => set('to', e.target.value)}
                    placeholder="100 또는 20261231 또는 context.END_DT"
                    className={inputCls} style={inputSty} />
                </div>
              </div>
              <div className={`grid gap-2 ${isDateMode ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <div>
                  <label className="text-[10px] block mb-0.5" style={{ color: '#94a3b8' }}>STEP</label>
                  <input value={(config.step as string) || '1'} onChange={e => set('step', e.target.value)}
                    placeholder="1"
                    className={inputCls} style={inputSty} />
                </div>
                {isDateMode && (
                  <div>
                    <label className="text-[10px] block mb-0.5" style={{ color: '#94a3b8' }}>단위</label>
                    <select value={(config.stepUnit as string) || 'DAY'} onChange={e => set('stepUnit', e.target.value)}
                      className={inputCls} style={inputSty}>
                      <option value="DAY">일 (Day)</option>
                      <option value="MONTH">월 (Month)</option>
                      <option value="YEAR">년 (Year)</option>
                    </select>
                  </div>
                )}
              </div>
              {isDateMode && (
                <p className="text-[10px] px-1" style={{ color: '#ea580c' }}>
                  날짜 형식(yyyyMMdd) 자동 감지됨 — 날짜 산술로 처리됩니다
                </p>
              )}
            </>
          )}

          {/* LIST 입력 */}
          {forSubType === 'LIST' && (
            <div>
              <label className="text-[10px] block mb-0.5" style={{ color: '#94a3b8' }}>값 목록 (콤마 구분)</label>
              <textarea value={(config.listValues as string) || ''}
                onChange={e => set('listValues', e.target.value)}
                rows={4} placeholder="20260101,20260201,20260301"
                className="w-full bg-[#f8fafc] border border-[#d1d5db] text-[#0f172a] rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-[#ea580c] resize-y" />
            </div>
          )}
        </>
      )}

      {/* ③-B WHILE문 옵션 */}
      {loopType === 'WHILE' && (
        <>
          <ConnectionSelect
            value={(config.connectionId as string) || ''}
            onChange={v => set('connectionId', v)}
          />
          <div>
            <label className="text-[10px] block mb-0.5" style={{ color: '#94a3b8' }}>
              종료 조건 SQL <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea value={(config.conditionSql as string) || ''}
              onChange={e => set('conditionSql', e.target.value)}
              rows={3} placeholder={"SELECT COUNT(*) FROM queue WHERE status = 'PENDING'"}
              className="w-full bg-[#f8fafc] border border-[#d1d5db] text-[#0f172a] rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-[#ea580c] resize-y" />
            <p className="text-[10px] mt-0.5" style={{ color: '#94a3b8' }}>결과값이 0이면 루프를 종료합니다</p>
          </div>
          <div>
            <label className="text-[10px] block mb-0.5" style={{ color: '#94a3b8' }}>최대 반복 횟수 (무한루프 방지)</label>
            <input type="number" min="1" value={(config.maxIterations as string) || '1000'}
              onChange={e => set('maxIterations', e.target.value)}
              className={inputCls} style={inputSty} />
          </div>
        </>
      )}

      {/* 반복 횟수 프리뷰 */}
      {preview && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded"
          style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="#ea580c">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="text-[11px] font-medium" style={{ color: '#ea580c' }}>{preview}</span>
        </div>
      )}

      {/* 연결 방법 안내 */}
      <div className="px-2 py-2 rounded text-[10px] space-y-0.5" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b' }}>
        <p className="font-medium" style={{ color: '#374151' }}>연결 방법</p>
        <p>T_LOOP → <strong>TRIGGER</strong> 링크 → T_RUN_JOB (또는 T_JDBC_OUTPUT 등)</p>
        <p>각 반복마다 하위 노드가 <code className="text-[#7c3aed]">context.{loopVar || 'LOOP_VAR'}</code> 값을 바꿔가며 실행됩니다.</p>
      </div>
    </div>
  )
}

function GenericConfig({ config, type, onChange }: {
  config: Record<string, unknown>
  type: ComponentType
  onChange: (k: string, v: unknown) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-[#64748b]">Configuration (JSON)</label>
        <JsonExampleButton type={type} />
      </div>
      <textarea
        value={JSON.stringify(config, null, 2)}
        onChange={e => {
          try { onChange('__raw', JSON.parse(e.target.value)) } catch {}
        }}
        rows={18}
        className="w-full bg-[#f8fafc] border border-[#d1d5db] text-[#0f172a] rounded-md px-3 py-2
          text-xs font-mono focus:outline-none focus:border-[#2563eb] resize-y"
      />
    </div>
  )
}

// ── Main PropertiesPanel ──────────────────────────────────────
export default function PropertiesPanel({ node, onUpdate, onDelete, allNodes, allEdges, onOpenMappingEditor }: Props) {
  if (!node) {
    return (
      <div className="w-full flex flex-col items-center justify-center"
        style={{ background: '#ffffff' }}>
        <div className="text-center px-6">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-3"
            style={{ background: '#f1f5f9', border: '1px solid #e2e8f0' }}>
            <svg className="w-5 h-5" style={{ color: '#94a3b8' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
            </svg>
          </div>
          <p className="text-xs" style={{ color: '#64748b' }}>노드를 클릭하여 설정</p>
          <p className="text-[10px] mt-1" style={{ color: '#94a3b8' }}>T_MAP은 더블클릭 시<br/>매핑 에디터가 열립니다</p>
        </div>
      </div>
    )
  }

  const data = node.data as unknown as NodeData
  const config = (data.config ?? {}) as Record<string, unknown>

  const handleChange = (key: string, value: unknown) => {
    if (key === '__raw') {
      onUpdate(node.id, { config: value as Record<string, unknown> })
    } else {
      onUpdate(node.id, { config: { ...config, [key]: value } })
    }
  }

  const renderConfig = () => {
    switch (data.componentType) {
      case 'T_JDBC_INPUT':    return <JdbcInputConfig config={config} onChange={handleChange} />
      case 'T_JDBC_OUTPUT':   return <JdbcOutputConfig config={config} onChange={handleChange} />
      case 'T_FILTER_ROW':    return <FilterConfig config={config} onChange={handleChange} />
      case 'T_MAP':           return <MapConfig nodeId={node.id} config={config} onChange={handleChange} allNodes={allNodes} allEdges={allEdges} onOpenMappingEditor={onOpenMappingEditor} />
      case 'T_AGGREGATE_ROW': return <AggregateConfig config={config} onChange={handleChange} />
      case 'T_JOIN':          return <JoinConfig config={config} onChange={handleChange} />
      case 'T_SORT_ROW':      return <SortConfig config={config} onChange={handleChange} />
      case 'T_LOOP':          return <LoopConfig config={config} onChange={handleChange} />
      default:                return <GenericConfig config={config} type={data.componentType} onChange={handleChange} />
    }
  }

  return (
    <div className="w-full flex flex-col overflow-hidden" style={{ background: '#ffffff' }}>
      {/* Header */}
      <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #e2e8f0' }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold" style={{ color: '#0f172a' }}>Properties</p>
          <button onClick={() => onDelete(node.id)}
            className="p-1 rounded transition-colors"
            style={{ color: '#94a3b8' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#dc2626'; (e.currentTarget as HTMLElement).style.background = '#fef2f2' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#94a3b8'; (e.currentTarget as HTMLElement).style.background = '' }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
        <Input
          value={data.label}
          onChange={e => onUpdate(node.id, { label: e.target.value })}
          className="text-xs"
        />
        <p className="text-[10px] mt-1" style={{ color: '#94a3b8' }}>
          {data.componentType.replace('T_', '').replace(/_/g, ' ')}
        </p>
      </div>

      {/* Config */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {renderConfig()}
      </div>
    </div>
  )
}
