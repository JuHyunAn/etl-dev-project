import React, { useEffect, useRef, useState } from 'react'
import { schemaApi } from '../../api'
import { Modal, Spinner } from '../ui'
import type { ColumnInfo, TableInfo } from '../../types'

interface Props {
  connectionId: string
  connectionName: string
  onSelect: (tableName: string, schemaName: string, columns: ColumnInfo[]) => void
  onClose: () => void
}

export default function TablePickerModal({ connectionId, connectionName, onSelect, onClose }: Props) {
  const [tables, setTables] = useState<TableInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<TableInfo | null>(null)
  const [confirming, setConfirming] = useState(false)
  // key = "schemaName.tableName", value = fetched columns
  const columnCache = useRef<Map<string, ColumnInfo[]>>(new Map())

  useEffect(() => {
    schemaApi.listTables(connectionId)
      .then(setTables)
      .catch(e => setError(e instanceof Error ? e.message : '테이블 목록 조회 실패'))
      .finally(() => setLoading(false))
  }, [connectionId])

  // Pre-fetch columns as soon as a table row is selected
  const handleSelect = (t: TableInfo) => {
    setSelected(t)
    const key = `${t.schemaName ?? ''}.${t.tableName}`
    if (!columnCache.current.has(key)) {
      schemaApi.getColumns(connectionId, t.tableName, t.schemaName ?? undefined)
        .then(cols => { columnCache.current.set(key, cols) })
        .catch(() => { columnCache.current.set(key, []) })
    }
  }

  const filtered = tables.filter(t =>
    !search ||
    t.tableName.toLowerCase().includes(search.toLowerCase()) ||
    (t.schemaName ?? '').toLowerCase().includes(search.toLowerCase())
  )

  // Group by schema
  const grouped = filtered.reduce<Record<string, TableInfo[]>>((acc, t) => {
    const schema = t.schemaName ?? '(default)'
    acc[schema] = acc[schema] ?? []
    acc[schema].push(t)
    return acc
  }, {})

  const handleConfirm = async () => {
    if (!selected) return
    setConfirming(true)
    const key = `${selected.schemaName ?? ''}.${selected.tableName}`
    let columns = columnCache.current.get(key)
    if (!columns) {
      // Not yet cached — fetch now
      columns = await schemaApi.getColumns(
        connectionId, selected.tableName, selected.schemaName ?? undefined
      ).catch(() => [])
    }
    onSelect(selected.tableName, selected.schemaName ?? '', columns)
    setConfirming(false)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`테이블 선택 — ${connectionName}`} size="md">
      <div className="p-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94a3b8]"
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="테이블명 검색..."
            className="w-full rounded-md pl-8 pr-3 py-2 text-sm focus:outline-none"
            style={{ background: '#f8fafc', border: '1px solid #d1d5db', color: '#0f172a' }}
            onFocus={e => { e.target.style.borderColor = '#2563eb' }}
            onBlur={e => { e.target.style.borderColor = '#d1d5db' }}
          />
        </div>

        {/* Table List */}
        <div className="rounded-lg overflow-hidden max-h-80 overflow-y-auto"
          style={{ border: '1px solid #e2e8f0', background: '#ffffff' }}>
          {loading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : error ? (
            <div className="p-4 text-sm text-[#dc2626]">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-[#94a3b8] text-center">테이블이 없습니다</div>
          ) : (
            Object.entries(grouped).map(([schema, items]) => (
              <div key={schema}>
                {/* Schema header */}
                <div className="px-3 py-1.5 sticky top-0" style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3 h-3 text-[#94a3b8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span className="text-xs font-semibold text-[#64748b]">{schema}</span>
                    <span className="text-xs text-[#94a3b8]">({items.length})</span>
                  </div>
                </div>
                {items.map(t => (
                  <div
                    key={`${t.schemaName}.${t.tableName}`}
                    onClick={() => handleSelect(t)}
                    onDoubleClick={() => { handleSelect(t); setTimeout(handleConfirm, 50) }}
                    className={`flex items-center gap-2.5 px-4 py-2 cursor-pointer transition-colors`}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: selected?.tableName === t.tableName && selected?.schemaName === t.schemaName
                        ? '#eff6ff' : undefined,
                    }}
                    onMouseEnter={e => {
                      if (!(selected?.tableName === t.tableName && selected?.schemaName === t.schemaName))
                        (e.currentTarget as HTMLElement).style.background = '#f8fafc'
                    }}
                    onMouseLeave={e => {
                      if (!(selected?.tableName === t.tableName && selected?.schemaName === t.schemaName))
                        (e.currentTarget as HTMLElement).style.background = ''
                    }}
                  >
                    <svg className="w-3.5 h-3.5 flex-shrink-0 text-[#94a3b8]"
                      fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M3 10h18M3 14h18M10 4h4M10 20h4" />
                    </svg>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm text-[#374151]">{t.tableName}</span>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded border
                      ${t.tableType === 'VIEW'
                        ? 'text-[#7c3aed] bg-[#faf5ff] border-[#e9d5ff]'
                        : 'text-[#64748b] bg-[#f1f5f9] border-[#e2e8f0]'
                      }`}>
                      {t.tableType}
                    </span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Selected info */}
        {selected && (
          <div className="px-3 py-2 rounded-md text-xs text-[#16a34a]"
            style={{ background: '#f0fdf4', border: '1px solid #86efac' }}>
            선택됨: {selected.schemaName ? `${selected.schemaName}.` : ''}{selected.tableName}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1" style={{ borderTop: '1px solid #e2e8f0' }}>
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-[#64748b] hover:text-[#374151] transition-colors">
            취소
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected || confirming}
            className={`px-4 py-2 text-sm rounded-md font-medium transition-colors flex items-center gap-1.5
              ${selected && !confirming
                ? 'bg-[#16a34a] hover:bg-[#15803d] text-white'
                : 'bg-[#f1f5f9] text-[#cbd5e1] cursor-not-allowed'
              }`}>
            {confirming && <Spinner size="sm" />}
            선택
          </button>
        </div>
      </div>
    </Modal>
  )
}
