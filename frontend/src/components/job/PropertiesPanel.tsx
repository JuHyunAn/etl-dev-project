import React, { useState, useEffect } from 'react'
import type { Node } from '@xyflow/react'
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
      className="flex items-center gap-1 text-[10px] text-[#484f58] hover:text-[#58a6ff] transition-colors"
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

  useEffect(() => {
    connectionsApi.list().then(setConnections).catch(() => {})
  }, [])

  const connId = (config.connectionId as string) ?? ''
  const selectedConn = connections.find(c => c.id === connId)

  useAutoFetchColumns(connId, config, onChange)

  return (
    <div className="space-y-3">
      <ConnectionSelect value={connId} onChange={v => onChange('connectionId', v)} />

      {/* Table Name + Picker */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-[#8b949e]">Table Name</label>
          {connId && (
            <button
              onClick={() => setShowPicker(true)}
              className="flex items-center gap-1 text-[10px] text-[#58a6ff] hover:text-[#79c0ff] transition-colors">
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
          className="w-full bg-[#0d1117] border border-[#30363d] text-[#e6edf3] rounded-md px-3 py-2
            text-sm font-mono placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-[#8b949e]">Custom Query (optional)</label>
        <textarea
          value={(config.query as string) ?? ''}
          onChange={e => onChange('query', e.target.value)}
          placeholder="SELECT * FROM table WHERE ..."
          rows={4}
          className="w-full bg-[#0d1117] border border-[#30363d] text-[#e6edf3] rounded-md px-3 py-2
            text-xs font-mono placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] resize-y"
        />
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
          <p className="text-xs text-[#484f58] font-medium">
            컬럼 {(config.columns as ColumnInfo[]).length}개 로드됨
          </p>
          <div className="max-h-32 overflow-y-auto rounded-md border border-[#21262d] bg-[#0d1117]">
            {(config.columns as ColumnInfo[]).map(col => (
              <div key={col.columnName}
                className="flex items-center gap-1.5 px-2 py-0.5 border-b border-[#21262d] last:border-0">
                {col.isPrimaryKey && (
                  <svg className="w-2.5 h-2.5 text-[#d29922] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clipRule="evenodd" />
                  </svg>
                )}
                {!col.isPrimaryKey && (
                  <span className="w-2.5 h-2.5 flex-shrink-0 flex items-center justify-center">
                    <span className="w-1 h-1 rounded-full bg-[#30363d]" />
                  </span>
                )}
                <span className="text-xs font-mono text-[#8b949e] flex-1 truncate">{col.columnName}</span>
                <span className="text-[11px] text-[#484f58] flex-shrink-0">
                  {col.dataType}{col.characterMaxLength ? `(${col.characterMaxLength})` : ''}
                </span>
                {!col.nullable && (
                  <span className="text-[10px] text-[#f85149] flex-shrink-0">NN</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
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
          <label className="text-xs font-medium text-[#8b949e]">Table Name</label>
          {connId && (
            <button
              onClick={() => setShowPicker(true)}
              className="flex items-center gap-1 text-[10px] text-[#58a6ff] hover:text-[#79c0ff] transition-colors">
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
          className="w-full bg-[#0d1117] border border-[#30363d] text-[#e6edf3] rounded-md px-3 py-2
            text-sm font-mono placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]"
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

      <div className="flex items-center gap-2">
        <input type="checkbox" id="truncate"
          checked={(config.truncateBeforeInsert as boolean) ?? false}
          onChange={e => onChange('truncateBeforeInsert', e.target.checked)}
          className="w-3.5 h-3.5 accent-[#58a6ff]" />
        <label htmlFor="truncate" className="text-xs text-[#8b949e]">Truncate before insert</label>
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
          <p className="text-xs text-[#484f58] font-medium">
            컬럼 {(config.columns as ColumnInfo[]).length}개 로드됨
          </p>
          <div className="max-h-32 overflow-y-auto rounded-md border border-[#21262d] bg-[#0d1117]">
            {(config.columns as ColumnInfo[]).map(col => (
              <div key={col.columnName}
                className="flex items-center gap-1.5 px-2 py-0.5 border-b border-[#21262d] last:border-0">
                {col.isPrimaryKey && (
                  <svg className="w-2.5 h-2.5 text-[#d29922] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clipRule="evenodd" />
                  </svg>
                )}
                {!col.isPrimaryKey && (
                  <span className="w-2.5 h-2.5 flex-shrink-0 flex items-center justify-center">
                    <span className="w-1 h-1 rounded-full bg-[#30363d]" />
                  </span>
                )}
                <span className="text-xs font-mono text-[#8b949e] flex-1 truncate">{col.columnName}</span>
                <span className="text-[11px] text-[#484f58] flex-shrink-0">
                  {col.dataType}{col.characterMaxLength ? `(${col.characterMaxLength})` : ''}
                </span>
                {!col.nullable && (
                  <span className="text-[10px] text-[#f85149] flex-shrink-0">NN</span>
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
          <label className="text-xs font-medium text-[#8b949e]">Filter Expression</label>
          <JsonExampleButton type="T_FILTER_ROW" />
        </div>
        <textarea
          value={(config.condition as string) ?? ''}
          onChange={e => onChange('condition', e.target.value)}
          placeholder={"e.g. amount > 1000 AND status = 'ACTIVE'"}
          rows={9}
          className="w-full bg-[#0d1117] border border-[#30363d] text-[#e6edf3] rounded-md px-3 py-2
            text-xs font-mono placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] resize-y"
        />
      </div>
    </div>
  )
}

// ── Map Config (with hint to use double-click) ─────────────────
function MapConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <div className="space-y-3">
      {/* Double-click hint */}
      <div className="flex items-start gap-2 p-2.5 rounded-md bg-[#0d1f35] border border-[#1a3050]">
        <svg className="w-3.5 h-3.5 text-[#58a6ff] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-[10px] text-[#58a6ff] leading-relaxed">
          노드를 <strong>더블클릭</strong>하면 시각적 매핑 에디터가 열립니다.<br />
          연결된 Input 테이블의 컬럼을 선택해 매핑할 수 있습니다.
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-[#8b949e]">Column Mappings (JSON)</label>
          <JsonExampleButton type="T_MAP" />
        </div>
        <textarea
          value={typeof config.mappings === 'string'
            ? config.mappings
            : JSON.stringify(config.mappings ?? [], null, 2)}
          onChange={e => onChange('mappings', e.target.value)}
          placeholder={'[{"sourceColumn": "col_a", "targetName": "col_b", "expression": "", "type": "VARCHAR"}]'}
          rows={18}
          className="w-full bg-[#0d1117] border border-[#30363d] text-[#e6edf3] rounded-md px-3 py-2
            text-xs font-mono placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] resize-y"
        />
      </div>
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
          <label className="text-xs font-medium text-[#8b949e]">Aggregations (JSON)</label>
          <JsonExampleButton type="T_AGGREGATE_ROW" />
        </div>
        <textarea
          value={typeof config.aggregations === 'string'
            ? config.aggregations
            : JSON.stringify(config.aggregations ?? [], null, 2)}
          onChange={e => onChange('aggregations', e.target.value)}
          placeholder={'[{"column": "amount", "function": "SUM", "alias": "total_amount"}]'}
          rows={12}
          className="w-full bg-[#0d1117] border border-[#30363d] text-[#e6edf3] rounded-md px-3 py-2
            text-xs font-mono placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] resize-y"
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
        <span className="text-xs font-medium text-[#8b949e]">Join Config</span>
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
        <label className="text-xs font-medium text-[#8b949e]">Sort Columns (JSON)</label>
        <JsonExampleButton type="T_SORT_ROW" />
      </div>
      <textarea
        value={typeof config.columns === 'string'
          ? config.columns
          : JSON.stringify(config.columns ?? [], null, 2)}
        onChange={e => onChange('columns', e.target.value)}
        placeholder={'[{"column": "created_at", "order": "DESC"}]'}
        rows={12}
        className="w-full bg-[#0d1117] border border-[#30363d] text-[#e6edf3] rounded-md px-3 py-2
          text-xs font-mono placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] resize-y"
      />
    </div>
  )
}

// ── Generic Config ────────────────────────────────────────────
function GenericConfig({ config, type, onChange }: {
  config: Record<string, unknown>
  type: ComponentType
  onChange: (k: string, v: unknown) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-[#8b949e]">Configuration (JSON)</label>
        <JsonExampleButton type={type} />
      </div>
      <textarea
        value={JSON.stringify(config, null, 2)}
        onChange={e => {
          try { onChange('__raw', JSON.parse(e.target.value)) } catch {}
        }}
        rows={18}
        className="w-full bg-[#0d1117] border border-[#30363d] text-[#e6edf3] rounded-md px-3 py-2
          text-xs font-mono focus:outline-none focus:border-[#58a6ff] resize-y"
      />
    </div>
  )
}

// ── Main PropertiesPanel ──────────────────────────────────────
export default function PropertiesPanel({ node, onUpdate, onDelete }: Props) {
  if (!node) {
    return (
      <div className="w-full bg-[#161b27] border-l border-[#21262d]
        flex flex-col items-center justify-center">
        <div className="text-center px-6">
          <div className="w-10 h-10 rounded-lg bg-[#252d3d] flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-[#484f58]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
            </svg>
          </div>
          <p className="text-xs text-[#484f58]">노드를 클릭하여 설정</p>
          <p className="text-[10px] text-[#30363d] mt-1">T_MAP은 더블클릭 시<br/>매핑 에디터가 열립니다</p>
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
      case 'T_MAP':           return <MapConfig config={config} onChange={handleChange} />
      case 'T_AGGREGATE_ROW': return <AggregateConfig config={config} onChange={handleChange} />
      case 'T_JOIN':          return <JoinConfig config={config} onChange={handleChange} />
      case 'T_SORT_ROW':      return <SortConfig config={config} onChange={handleChange} />
      default:                return <GenericConfig config={config} type={data.componentType} onChange={handleChange} />
    }
  }

  return (
    <div className="w-full bg-[#161b27] border-l border-[#21262d]
      flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#21262d] flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-[#e6edf3]">Properties</p>
          <button onClick={() => onDelete(node.id)}
            className="p-1 rounded text-[#484f58] hover:text-[#f85149] hover:bg-[#2d0f0f] transition-colors">
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
        <p className="text-[10px] text-[#484f58] mt-1">
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
