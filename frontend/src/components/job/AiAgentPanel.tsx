import React, { useEffect, useRef, useState } from 'react'
import { Spinner } from '../ui'
import {
  AI_MODELS, ENV_KEYS, DEFAULT_PROVIDER,
  sendAiMessage, extractGraphSpec,
  type AiMessage, type AiProvider, type AiGraphSpec,
} from '../../api/ai'
import { schemaApi } from '../../api'
import type { Connection, TableInfo, ColumnInfo } from '../../types'

interface Props {
  onApplyGraph: (spec: AiGraphSpec) => void
  connections: Connection[]
}

const PROVIDER_COLORS: Record<AiProvider, string> = {
  claude: '#bc8cff',
  openai: '#3fb950',
  gemini: '#58a6ff',
}

function JsonBlock({ raw }: { raw: string }) {
  const [expanded, setExpanded] = React.useState(false)

  // 요약: nodes N개, edges M개
  let summary = 'JSON'
  try {
    const parsed = JSON.parse(raw) as { nodes?: unknown[]; edges?: unknown[] }
    const n = parsed.nodes?.length ?? 0
    const e = parsed.edges?.length ?? 0
    summary = `노드 ${n}개 · 엣지 ${e}개`
  } catch { /* ignore */ }

  return (
    <div className="my-2 rounded-md border border-[#30363d] bg-[#0d1117] overflow-hidden">
      {/* 헤더 - 항상 표시 */}
      <button
        onClick={() => setExpanded(o => !o)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-[#161b27] transition-colors group">
        <div className="flex items-center gap-1.5">
          <svg className="w-3 h-3 text-[#58a6ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          <span className="text-[10px] font-mono text-[#58a6ff]">JSON</span>
          <span className="text-[10px] text-[#484f58]">{summary}</span>
        </div>
        <svg
          className={`w-3 h-3 text-[#484f58] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 전체 JSON - 펼쳤을 때만 표시 */}
      {expanded && (
        <pre className="px-2.5 pb-2.5 text-[10px] font-mono text-[#79c0ff] overflow-x-auto max-h-60 border-t border-[#21262d]">
          {raw}
        </pre>
      )}
    </div>
  )
}

function CodeBlock({ text }: { text: string }) {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (!jsonMatch) return <span className="whitespace-pre-wrap">{text}</span>

  const before = text.slice(0, text.indexOf('```'))
  const after = text.slice(text.indexOf('```') + jsonMatch[0].length)

  return (
    <>
      {before && <span className="whitespace-pre-wrap">{before}</span>}
      <JsonBlock raw={jsonMatch[1].trim()} />
      {after && <span className="whitespace-pre-wrap">{after}</span>}
    </>
  )
}

function buildConnectionContext(
  conn: Connection,
  tables: TableInfo[],
  columnMap: Record<string, ColumnInfo[]>,
): string {
  const tableLines = tables.map(t => {
    const key = t.schemaName ? `${t.schemaName}.${t.tableName}` : t.tableName
    const cols = columnMap[key]
    if (cols && cols.length) {
      const colDesc = cols.map(c =>
        `${c.columnName}(${c.dataType}${c.isPrimaryKey ? ',PK' : ''}${!c.nullable ? ',NN' : ''})`
      ).join(', ')
      return `  - ${key}: [${colDesc}]`
    }
    return `  - ${key}`
  })

  return `Selected database connection for this pipeline:
Name: "${conn.name}" | id: "${conn.id}" | DB: ${conn.dbType} | host: ${conn.host}:${conn.port} | database: ${conn.database}${conn.schema ? ` | schema: ${conn.schema}` : ''}

Available tables and columns:
${tableLines.join('\n')}

RULES:
- Use ONLY the tables listed above for T_JDBC_INPUT and T_JDBC_OUTPUT nodes.
- Always set "connectionId": "${conn.id}" in the config.
- Use the exact table names (with schema prefix if shown) as the "tableName" value.
- If column info is available, use the actual column names for mappings.`
}

export default function AiAgentPanel({ onApplyGraph, connections }: Props) {
  const [provider, setProvider] = useState<AiProvider>(DEFAULT_PROVIDER)
  const [model, setModel] = useState(AI_MODELS[DEFAULT_PROVIDER].models[0].id)
  const [messages, setMessages] = useState<AiMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // 커넥션 선택
  const [selectedConnId, setSelectedConnId] = useState<string>('')
  const [tables, setTables] = useState<TableInfo[]>([])
  const [columnMap, setColumnMap] = useState<Record<string, ColumnInfo[]>>({})
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [schemaError, setSchemaError] = useState('')
  const [tableListOpen, setTableListOpen] = useState(false)

  const selectedConn = connections.find(c => c.id === selectedConnId) ?? null

  // 커넥션 선택 시 테이블 + 컬럼 로드
  useEffect(() => {
    if (!selectedConnId) { setTables([]); setColumnMap({}); return }
    setSchemaLoading(true)
    setSchemaError('')
    setTables([])
    setColumnMap({})

    schemaApi.listTables(selectedConnId)
      .then(async tbls => {
        setTables(tbls)
        // 테이블별 컬럼 병렬 로드
        const results = await Promise.all(
          tbls.map(t =>
            schemaApi.getColumns(selectedConnId, t.tableName, t.schemaName || undefined)
              .then(cols => ({ key: t.schemaName ? `${t.schemaName}.${t.tableName}` : t.tableName, cols }))
              .catch(() => ({ key: t.schemaName ? `${t.schemaName}.${t.tableName}` : t.tableName, cols: [] as ColumnInfo[] }))
          )
        )
        const map: Record<string, ColumnInfo[]> = {}
        results.forEach(r => { map[r.key] = r.cols })
        setColumnMap(map)
        console.group(`[AI Agent] "${connections.find(c => c.id === selectedConnId)?.name}" 스키마 로드 완료`)
        console.log('테이블 수:', tbls.length)
        tbls.forEach(t => {
          const key = t.schemaName ? `${t.schemaName}.${t.tableName}` : t.tableName
          console.log(`  ${key}:`, map[key]?.map(c => c.columnName) ?? [])
        })
        console.groupEnd()
      })
      .catch(e => setSchemaError(e instanceof Error ? e.message : '스키마 로드 실패'))
      .finally(() => setSchemaLoading(false))
  }, [selectedConnId])

  const apiKey = ENV_KEYS[provider]
  const hasKey = !!apiKey

  const handleProviderChange = (p: AiProvider) => {
    setProvider(p)
    setModel(AI_MODELS[p].models[0].id)
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return

    const newMessages: AiMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setError('')

    const systemContext = selectedConn
      ? buildConnectionContext(selectedConn, tables, columnMap)
      : undefined

    try {
      const reply = await sendAiMessage(newMessages, { provider, model, apiKey, systemContext })
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleApply = (content: string) => {
    const spec = extractGraphSpec(content)
    if (!spec) return

    // T_JDBC_INPUT/OUTPUT 노드 config에 columnMap 데이터 주입
    const enriched = {
      ...spec,
      nodes: spec.nodes.map(n => {
        if (n.type !== 'T_JDBC_INPUT' && n.type !== 'T_JDBC_OUTPUT') return n
        const tableName = (n.config.tableName as string) ?? ''
        const cols = columnMap[tableName]
          ?? columnMap[tableName.split('.').pop() ?? '']
          ?? []
        if (!cols.length) return n
        return { ...n, config: { ...n.config, columns: cols } }
      }),
    }
    onApplyGraph(enriched)
  }

  const clearChat = () => { setMessages([]); setError('') }

  return (
    <div className="w-[320px] h-full flex-shrink-0 flex flex-col bg-[#161b27] border-l border-[#21262d] overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-3 py-2.5 border-b border-[#21262d] bg-[#0d1117]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold"
              style={{ backgroundColor: `${PROVIDER_COLORS[provider]}22`, color: PROVIDER_COLORS[provider] }}>
              AI
            </div>
            <span className="text-xs font-semibold text-[#e6edf3]">AI Agent</span>
          </div>
          <button onClick={clearChat}
            className="text-[10px] text-[#484f58] hover:text-[#8b949e] transition-colors">
            대화 초기화
          </button>
        </div>

        {/* Provider + Model 선택 */}
        <div className="flex gap-1.5 mb-2">
          <select
            value={provider}
            onChange={e => handleProviderChange(e.target.value as AiProvider)}
            className="flex-1 bg-[#161b27] border border-[#30363d] text-[#8b949e] rounded text-[10px] px-2 py-1
              focus:outline-none focus:border-[#58a6ff]">
            {(Object.keys(AI_MODELS) as AiProvider[]).map(p => (
              <option key={p} value={p}>{AI_MODELS[p].label}</option>
            ))}
          </select>
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            className="flex-1 bg-[#161b27] border border-[#30363d] text-[#8b949e] rounded text-[10px] px-2 py-1
              focus:outline-none focus:border-[#58a6ff]">
            {AI_MODELS[provider].models.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* 커넥션 선택 */}
        <div className="mb-1.5">
          <select
            value={selectedConnId}
            onChange={e => setSelectedConnId(e.target.value)}
            className="w-full bg-[#161b27] border border-[#30363d] text-[#8b949e] rounded text-[10px] px-2 py-1
              focus:outline-none focus:border-[#58a6ff]">
            <option value="">DB 커넥션 선택 (선택 시 테이블/컬럼 자동 로드)</option>
            {connections.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.dbType})</option>
            ))}
          </select>
        </div>

        {/* 스키마 로딩 상태 */}
        {schemaLoading && (
          <div className="flex items-center gap-1.5 text-[9px] text-[#484f58] py-1">
            <Spinner size="sm" />
            <span>테이블 및 컬럼 로딩 중...</span>
          </div>
        )}
        {schemaError && (
          <p className="text-[9px] text-[#f85149] py-1">{schemaError}</p>
        )}
        {!schemaLoading && !schemaError && tables.length > 0 && (
          <button
            onClick={() => setTableListOpen(o => !o)}
            className="w-full flex items-center justify-between text-[9px] text-[#3fb950] py-1 hover:text-[#56d364] transition-colors">
            <span>✓ {tables.length}개 테이블 · {Object.values(columnMap).reduce((s, c) => s + c.length, 0)}개 컬럼 로드됨</span>
            <span>{tableListOpen ? '▲' : '▼'}</span>
          </button>
        )}

        {/* 테이블 목록 펼치기 */}
        {tableListOpen && tables.length > 0 && (
          <div className="mt-1 max-h-32 overflow-y-auto rounded border border-[#30363d] bg-[#0d1117]">
            {tables.map(t => {
              const key = t.schemaName ? `${t.schemaName}.${t.tableName}` : t.tableName
              const cols = columnMap[key] ?? []
              return (
                <div key={key} className="px-2 py-1 border-b border-[#21262d] last:border-0">
                  <p className="text-[10px] text-[#79c0ff] font-mono">{key}</p>
                  {cols.length > 0 && (
                    <p className="text-[9px] text-[#484f58] truncate">
                      {cols.map(c => c.columnName).join(', ')}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* API Key 미설정 경고 */}
        {!hasKey && (
          <div className="mt-2 px-2 py-1.5 rounded bg-[#2d1a07] border border-[#3d2c0a] flex items-start gap-1.5">
            <svg className="w-3 h-3 text-[#f0883e] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p className="text-[9px] text-[#f0883e] leading-relaxed">
              API 키 미설정. <code className="text-[#ffa657]">.env</code> 파일에<br />
              <code className="text-[#ffa657]">VITE_{provider.toUpperCase()}_API_KEY</code> 를 입력하세요.
            </p>
          </div>
        )}
      </div>

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center"
              style={{ backgroundColor: `${PROVIDER_COLORS[provider]}22` }}>
              <img src="/ai.png" alt="AI" className="w-6 h-6 object-contain" />
            </div>
            <p className="text-xs font-medium text-[#8b949e]">ETL 파이프라인을 설명해주세요</p>
            <p className="text-[10px] text-[#484f58] mt-1">
              {selectedConn
                ? `"${selectedConn.name}" 커넥션의 테이블을 활용합니다`
                : '위에서 DB 커넥션을 선택하면 실제 테이블을 활용합니다'}
            </p>

            <div className="mt-4 space-y-1.5">
              {[
                '고객 주문 데이터를 집계해서 월별 통계 만들기',
                '두 테이블을 JOIN해서 데이터 정제 후 저장',
                '대용량 테이블에서 특정 조건 필터링 후 이동',
              ].map(prompt => (
                <button key={prompt}
                  onClick={() => setInput(prompt)}
                  className="w-full text-left px-2.5 py-1.5 rounded-md text-[10px] text-[#8b949e]
                    bg-[#252d3d] border border-[#30363d] hover:border-[#484f58]
                    hover:text-[#c9d1d9] transition-colors">
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center mr-1.5 mt-0.5 text-[9px] font-bold"
                style={{ backgroundColor: `${PROVIDER_COLORS[provider]}22`, color: PROVIDER_COLORS[provider] }}>
                AI
              </div>
            )}
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-[11px] leading-relaxed
              ${msg.role === 'user'
                ? 'bg-[#1f3d6e] text-[#c9d1d9] rounded-tr-sm'
                : 'bg-[#252d3d] text-[#c9d1d9] rounded-tl-sm'
              }`}>
              {msg.role === 'assistant' ? (
                <div>
                  <CodeBlock text={msg.content} />
                  {extractGraphSpec(msg.content) && (
                    <button
                      onClick={() => handleApply(msg.content)}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5
                        rounded-md bg-[#238636] hover:bg-[#2ea043] text-white text-[10px] font-medium
                        transition-colors">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      캔버스에 적용
                    </button>
                  )}
                </div>
              ) : (
                <span className="whitespace-pre-wrap">{msg.content}</span>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start gap-1.5 items-center">
            <div className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-[9px] font-bold"
              style={{ backgroundColor: `${PROVIDER_COLORS[provider]}22`, color: PROVIDER_COLORS[provider] }}>
              AI
            </div>
            <div className="flex items-center gap-1.5 bg-[#252d3d] rounded-lg px-3 py-2">
              <Spinner size="sm" />
              <span className="text-[10px] text-[#484f58]">생성 중...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="px-3 py-2 rounded-lg bg-[#2d0f0f] border border-[#3d1a1a] text-[10px] text-[#f85149]">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 p-3 border-t border-[#21262d]">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="파이프라인을 설명해주세요... (Enter 전송, Shift+Enter 줄바꿈)"
            rows={3}
            className="flex-1 bg-[#0d1117] border border-[#30363d] text-[#e6edf3] rounded-lg
              px-3 py-2 text-[11px] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]
              resize-none leading-relaxed"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors
              ${input.trim() && !loading
                ? 'bg-[#238636] hover:bg-[#2ea043] text-white'
                : 'bg-[#21262d] text-[#484f58] cursor-not-allowed'
              }`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <p className="text-[9px] text-[#30363d] mt-1.5 text-center">
          AI가 생성한 JSON 블록의 "캔버스에 적용" 버튼으로 노드를 추가합니다
        </p>
      </div>
    </div>
  )
}
