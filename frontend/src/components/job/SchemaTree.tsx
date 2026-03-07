import React, { useEffect, useState } from 'react'
import { schemaApi, connectionsApi } from '../../api'
import type { Node } from '@xyflow/react'
import type { ColumnInfo, Connection } from '../../types'
import { Spinner } from '../ui'

interface TableNode {
  schemaName: string
  tableName: string
  columns: ColumnInfo[]
  columnsLoaded: boolean
  columnsLoading: boolean
  expanded: boolean
}

interface ConnectionNode {
  connection: Connection
  tables: TableNode[]
  expanded: boolean
  loading: boolean
}

interface Props {
  nodes: Node[]
}

type EtlData = {
  componentType: string
  config: Record<string, unknown>
  [key: string]: unknown
}

export default function SchemaTree({ nodes }: Props) {
  const [tree, setTree] = useState<ConnectionNode[]>([])
  const [loadingConnIds, setLoadingConnIds] = useState<Set<string>>(new Set())

  // Derive used connections from canvas nodes
  useEffect(() => {
    const connMap = new Map<string, Set<string>>() // connectionId → Set<tableName>

    nodes.forEach(n => {
      const d = n.data as EtlData
      const cfg = d.config ?? {}
      const connId = cfg.connectionId as string | undefined
      const tableName = cfg.tableName as string | undefined
      if (connId) {
        if (!connMap.has(connId)) connMap.set(connId, new Set())
        if (tableName) connMap.get(connId)!.add(tableName)
      }
    })

    if (connMap.size === 0) {
      setTree([])
      return
    }

    // Build a map: connectionId → tableName → pre-loaded columns from node config
    const cachedColsMap = new Map<string, ColumnInfo[]>()
    nodes.forEach(n => {
      const d = n.data as EtlData
      const cfg = d.config ?? {}
      const connId = cfg.connectionId as string | undefined
      const tableName = cfg.tableName as string | undefined
      const cols = cfg.columns
      if (connId && tableName && Array.isArray(cols) && (cols as ColumnInfo[]).length > 0) {
        const parts = (tableName as string).split('.')
        const tName = parts[parts.length - 1]
        cachedColsMap.set(`${connId}::${tName}`, cols as ColumnInfo[])
      }
    })

    // Fetch connection details for each unique connection
    Promise.all(
      Array.from(connMap.keys()).map(id => connectionsApi.get(id).catch(() => null))
    ).then(conns => {
      const newTree: ConnectionNode[] = conns
        .filter((c): c is Connection => c !== null)
        .map(conn => {
          const tableNames = Array.from(connMap.get(conn.id) ?? [])
          return {
            connection: conn,
            expanded: true,
            loading: false,
            tables: tableNames.map(tn => {
              const parts = tn.split('.')
              const tName = parts[parts.length - 1]
              const cached = cachedColsMap.get(`${conn.id}::${tName}`) ?? []
              return {
                schemaName: parts.length > 1 ? parts[0] : (conn.schema ?? ''),
                tableName: tName,
                columns: cached,
                columnsLoaded: cached.length > 0,
                columnsLoading: false,
                expanded: cached.length > 0, // auto-expand if columns already known
              }
            }),
          }
        })
      setTree(newTree)
    })
  }, [nodes])

  const toggleConnection = (connId: string) => {
    setTree(prev => prev.map(c =>
      c.connection.id === connId ? { ...c, expanded: !c.expanded } : c
    ))
  }

  const toggleTable = async (connId: string, tableName: string) => {
    setTree(prev => prev.map(c => {
      if (c.connection.id !== connId) return c
      return {
        ...c,
        tables: c.tables.map(t => {
          if (t.tableName !== tableName) return t
          // Trigger column load on first expand
          if (!t.columnsLoaded && !t.columnsLoading && !t.expanded) {
            loadColumns(connId, t.schemaName, tableName)
          }
          return { ...t, expanded: !t.expanded }
        })
      }
    }))
  }

  const loadColumns = async (connId: string, schemaName: string, tableName: string) => {
    setTree(prev => prev.map(c => {
      if (c.connection.id !== connId) return c
      return {
        ...c,
        tables: c.tables.map(t =>
          t.tableName === tableName ? { ...t, columnsLoading: true } : t
        )
      }
    }))

    try {
      const cols = await schemaApi.getColumns(connId, tableName, schemaName || undefined)
      setTree(prev => prev.map(c => {
        if (c.connection.id !== connId) return c
        return {
          ...c,
          tables: c.tables.map(t =>
            t.tableName === tableName
              ? { ...t, columns: cols, columnsLoaded: true, columnsLoading: false }
              : t
          )
        }
      }))
    } catch {
      setTree(prev => prev.map(c => {
        if (c.connection.id !== connId) return c
        return {
          ...c,
          tables: c.tables.map(t =>
            t.tableName === tableName ? { ...t, columnsLoading: false } : t
          )
        }
      }))
    }
  }

  const dbTypeColor: Record<string, string> = {
    POSTGRESQL: 'text-[#2563eb]',
    ORACLE:     'text-[#7c3aed]',
    MARIADB:    'text-[#16a34a]',
  }
  const dbTypeBg: Record<string, string> = {
    POSTGRESQL: 'bg-[#eff6ff]',
    ORACLE:     'bg-[#faf5ff]',
    MARIADB:    'bg-[#f0fdf4]',
  }

  if (tree.length === 0) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-xs text-[#94a3b8]">캔버스에 DB 노드를 추가하면<br />스키마 정보가 표시됩니다</p>
      </div>
    )
  }

  return (
    <div className="overflow-y-auto">
      {tree.map(connNode => (
        <div key={connNode.connection.id}>
          {/* Connection Row */}
          <button
            onClick={() => toggleConnection(connNode.connection.id)}
            className="w-full flex items-center gap-1.5 px-3 py-2 hover:bg-[#f8fafc] transition-colors group">
            <svg className={`w-2.5 h-2.5 flex-shrink-0 transition-transform text-[#94a3b8]
              ${connNode.expanded ? '' : '-rotate-90'}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            <div className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center flex-shrink-0
              ${dbTypeBg[connNode.connection.dbType] ?? 'bg-[#f1f5f9]'}
              ${dbTypeColor[connNode.connection.dbType] ?? 'text-[#64748b]'}`}>
              {connNode.connection.dbType === 'POSTGRESQL' ? 'PG'
                : connNode.connection.dbType === 'ORACLE' ? 'OR' : 'MY'}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className={`text-xs font-medium truncate ${dbTypeColor[connNode.connection.dbType] ?? 'text-[#64748b]'}`}>
                {connNode.connection.name}
              </p>
              <p className="text-[10px] text-[#94a3b8] truncate">
                {connNode.connection.host}:{connNode.connection.port}
              </p>
            </div>
          </button>

          {connNode.expanded && (
            <div>
              {connNode.tables.length === 0 ? (
                <div className="pl-8 pr-3 py-1.5 text-xs text-[#94a3b8]">커넥션만 사용 중</div>
              ) : (
                connNode.tables.map(tableNode => (
                  <div key={tableNode.tableName}>
                    {/* Table Row */}
                    <button
                      onClick={() => toggleTable(connNode.connection.id, tableNode.tableName)}
                      className="w-full flex items-center gap-1.5 pl-6 pr-3 py-1.5
                        hover:bg-[#f8fafc] transition-colors group">
                      <svg className={`w-2.5 h-2.5 flex-shrink-0 transition-transform text-[#94a3b8]
                        ${tableNode.expanded ? '' : '-rotate-90'}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                      <svg className="w-3 h-3 flex-shrink-0 text-[#94a3b8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M3 10h18M3 14h18M10 4h4M10 20h4" />
                      </svg>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-xs text-[#374151] truncate font-mono">
                          {tableNode.schemaName ? (
                            <><span className="text-[#94a3b8]">{tableNode.schemaName}.</span>{tableNode.tableName}</>
                          ) : tableNode.tableName}
                        </p>
                      </div>
                      {tableNode.columnsLoading && <Spinner size="sm" />}
                    </button>

                    {/* Columns */}
                    {tableNode.expanded && (
                      <div>
                        {tableNode.columnsLoading ? (
                          <div className="pl-12 py-1.5"><Spinner size="sm" /></div>
                        ) : tableNode.columns.length === 0 ? (
                          <div className="pl-12 py-1 text-xs text-[#94a3b8]">컬럼 없음</div>
                        ) : (
                          tableNode.columns.map(col => (
                            <div key={col.columnName}
                              className="flex items-center gap-1.5 pl-12 pr-3 py-0.5 group hover:bg-[#f8fafc]">
                              {col.isPrimaryKey ? (
                                <svg className="w-2.5 h-2.5 text-[#ca8a04] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clipRule="evenodd" />
                                </svg>
                              ) : (
                                <span className="w-2.5 h-2.5 flex-shrink-0 flex items-center justify-center">
                                  <span className="w-1 h-1 rounded-full bg-[#cbd5e1]" />
                                </span>
                              )}
                              <span className="text-[10px] font-mono text-[#64748b] truncate">{col.columnName}</span>
                              <span className="text-[9px] text-[#94a3b8] ml-auto flex-shrink-0">
                                {col.dataType}{col.characterMaxLength ? `(${col.characterMaxLength})` : ''}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
