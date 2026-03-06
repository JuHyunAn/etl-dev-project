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
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#484f58]"
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="테이블명 검색..."
            className="w-full bg-[#0d1117] border border-[#30363d] text-[#e6edf3] rounded-md
              pl-8 pr-3 py-2 text-sm placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]"
          />
        </div>

        {/* Table List */}
        <div className="border border-[#30363d] rounded-lg overflow-hidden bg-[#0d1117] max-h-80 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : error ? (
            <div className="p-4 text-sm text-[#f85149]">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-[#484f58] text-center">테이블이 없습니다</div>
          ) : (
            Object.entries(grouped).map(([schema, items]) => (
              <div key={schema}>
                {/* Schema header */}
                <div className="px-3 py-1.5 bg-[#161b27] border-b border-[#21262d] sticky top-0">
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3 h-3 text-[#484f58]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span className="text-xs font-semibold text-[#8b949e]">{schema}</span>
                    <span className="text-xs text-[#484f58]">({items.length})</span>
                  </div>
                </div>
                {items.map(t => (
                  <div
                    key={`${t.schemaName}.${t.tableName}`}
                    onClick={() => handleSelect(t)}
                    onDoubleClick={() => { handleSelect(t); setTimeout(handleConfirm, 50) }}
                    className={`flex items-center gap-2.5 px-4 py-2 cursor-pointer
                      border-b border-[#21262d] last:border-0 transition-colors
                      ${selected?.tableName === t.tableName && selected?.schemaName === t.schemaName
                        ? 'bg-[#1f3d6e]'
                        : 'hover:bg-[#161b27]'
                      }`}
                  >
                    <svg className="w-3.5 h-3.5 flex-shrink-0 text-[#484f58]"
                      fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M3 10h18M3 14h18M10 4h4M10 20h4" />
                    </svg>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm text-[#c9d1d9]">{t.tableName}</span>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded border
                      ${t.tableType === 'VIEW'
                        ? 'text-[#bc8cff] bg-[#1f1035] border-[#2e1f52]'
                        : 'text-[#8b949e] bg-[#252d3d] border-[#30363d]'
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
          <div className="px-3 py-2 rounded-md bg-[#0f2d1a] border border-[#1a4731] text-xs text-[#3fb950]">
            선택됨: {selected.schemaName ? `${selected.schemaName}.` : ''}{selected.tableName}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1 border-t border-[#21262d]">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-[#8b949e] hover:text-[#e6edf3] transition-colors">
            취소
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected || confirming}
            className={`px-4 py-2 text-sm rounded-md font-medium transition-colors flex items-center gap-1.5
              ${selected && !confirming
                ? 'bg-[#238636] hover:bg-[#2ea043] text-white'
                : 'bg-[#21262d] text-[#484f58] cursor-not-allowed'
              }`}>
            {confirming && <Spinner size="sm" />}
            선택
          </button>
        </div>
      </div>
    </Modal>
  )
}
