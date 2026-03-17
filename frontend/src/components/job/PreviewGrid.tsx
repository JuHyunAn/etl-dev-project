import React from 'react'
import type { PreviewNodeResult } from '../../types'

interface Props {
  nodeLabel: string
  outputLabel?: string
  result: PreviewNodeResult | null
  loading: boolean
  onRefresh: () => void
  onClear: () => void
  // T_MAP → 여러 output이 있을 때 선택 드롭다운
  outputOptions?: { nodeId: string; label: string }[]
  selectedOutputId?: string
  onOutputChange?: (nodeId: string) => void
}

export default function PreviewGrid({
  nodeLabel,
  outputLabel,
  result,
  loading,
  onRefresh,
  onClear,
  outputOptions,
  selectedOutputId,
  onOutputChange,
}: Props) {
  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#282C34' }}>
      {/* 헤더 */}
      <div
        className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5"
        style={{ borderBottom: '1px solid #21262d', background: '#282C34' }}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: '#6366f1' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 10h18M3 14h18M3 6h18M3 18h18" />
        </svg>
        <span className="text-[11px] font-semibold" style={{ color: '#c9d1d9' }}>
          Preview
        </span>
        <span className="text-[11px] font-medium" style={{ color: '#79c0ff' }}>{nodeLabel}</span>
        {outputLabel && (
          <>
            <span className="text-[10px]" style={{ color: '#484f58' }}>→</span>
            <span className="text-[11px] font-medium" style={{ color: '#56d364' }}>{outputLabel}</span>
          </>
        )}

        {/* multi-output 드롭다운 */}
        {outputOptions && outputOptions.length > 1 && onOutputChange && (
          <select
            value={selectedOutputId ?? ''}
            onChange={e => onOutputChange(e.target.value)}
            className="ml-1 text-[10px] rounded px-1.5 py-0.5"
            style={{ background: '#1e2632', border: '1px solid #30363d', color: '#c9d1d9' }}
          >
            {outputOptions.map(o => (
              <option key={o.nodeId} value={o.nodeId}>{o.label}</option>
            ))}
          </select>
        )}

        <div className="flex-1" />

        {result && !result.error && (
          <span className="text-[10px]" style={{ color: '#484f58' }}>
            {result.rowCount}행 · {result.durationMs}ms
          </span>
        )}

        {/* 초기화 버튼 */}
        <button
          onClick={onClear}
          disabled={loading || !result}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
          style={{
            background: (!result || loading) ? 'transparent' : '#1e2632',
            color: (!result || loading) ? '#484f58' : '#8b949e',
            border: '1px solid',
            borderColor: (!result || loading) ? '#30363d' : '#4a5568',
            cursor: (!result || loading) ? 'not-allowed' : 'pointer',
          }}
          onMouseEnter={e => { if (result && !loading) (e.currentTarget as HTMLElement).style.background = '#2a3547' }}
          onMouseLeave={e => { if (result && !loading) (e.currentTarget as HTMLElement).style.background = '#1e2632' }}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M6 18L18 6M6 6l12 12" />
          </svg>
          초기화
        </button>

        {/* 실행 버튼 */}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
          style={{
            background: loading ? '#1e2632' : '#6366f1',
            color: loading ? '#484f58' : '#fff',
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? (
            <>
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              실행 중...
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              </svg>
              실행
            </>
          )}
        </button>
      </div>

      {/* 내용 */}
      <div className="flex-1 overflow-auto">
        {!result && !loading && (
          <div className="flex items-center justify-center h-full text-[12px]" style={{ color: '#484f58' }}>
            노드를 선택하고 [실행]을 눌러 데이터를 미리 확인하세요.
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center h-full text-[12px]" style={{ color: '#8b949e' }}>
            <svg className="w-4 h-4 animate-spin mr-2" fill="none" viewBox="0 0 24 24" style={{ color: '#6366f1' }}>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            DB에서 데이터를 조회하는 중...
          </div>
        )}

        {result?.error && !loading && (
          <div className="flex items-start gap-2 m-3 p-3 rounded-lg"
            style={{ background: '#2d1515', border: '1px solid #7f1d1d' }}>
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: '#f85149' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <pre className="text-[11px] whitespace-pre-wrap font-mono" style={{ color: '#f85149' }}>{result.error}</pre>
          </div>
        )}

        {result && !result.error && !loading && (
          <table className="w-full text-[11px] font-mono border-collapse" style={{ tableLayout: 'auto' }}>
            <thead className="sticky top-0 z-10" style={{ background: '#282C34' }}>
              <tr>
                <th
                  className="px-2 py-1.5 text-left font-medium text-[10px]"
                  style={{ color: '#484f58', borderBottom: '1px solid #21262d', borderRight: '1px solid #21262d', width: 40, minWidth: 40 }}
                >
                  #
                </th>
                {result.columns.map(col => (
                  <th
                    key={col}
                    className="px-3 py-1.5 text-left font-medium text-[10px] whitespace-nowrap"
                    style={{ color: '#8b949e', borderBottom: '1px solid #21262d', borderRight: '1px solid #21262d' }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={result.columns.length + 1}
                    className="px-3 py-4 text-center text-[11px]"
                    style={{ color: '#484f58' }}
                  >
                    조건에 맞는 데이터가 없습니다 (0행)
                  </td>
                </tr>
              ) : (
                result.rows.map((row, ri) => (
                  <tr
                    key={ri}
                    style={{ background: ri % 2 === 0 ? '#282C34' : '#1e2632' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#2a3547')}
                    onMouseLeave={e => (e.currentTarget.style.background = ri % 2 === 0 ? '#282C34' : '#1e2632')}
                  >
                    <td
                      className="px-2 py-1 text-center"
                      style={{ color: '#484f58', borderBottom: '1px solid #21262d', borderRight: '1px solid #21262d', minWidth: 40 }}
                    >
                      {ri + 1}
                    </td>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className="px-3 py-1 whitespace-nowrap"
                        style={{
                          color: cell === null ? '#484f58' : typeof cell === 'number' ? '#79c0ff' : typeof cell === 'boolean' ? '#56d364' : '#c9d1d9',
                          borderBottom: '1px solid #21262d',
                          borderRight: '1px solid #21262d',
                          fontStyle: cell === null ? 'italic' : 'normal',
                          maxWidth: 240,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={cell === null ? 'NULL' : String(cell)}
                      >
                        {cell === null ? <span style={{ color: '#484f58' }}>NULL</span> : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* SQL 접기 */}
      {result?.sql && !result.error && (
        <details
          className="flex-shrink-0 border-t text-[10px]"
          style={{ borderColor: '#21262d', background: '#1e2632' }}
        >
          <summary className="px-3 py-1 cursor-pointer select-none" style={{ color: '#8b949e' }}>
            실행된 SQL 보기
          </summary>
          <pre
            className="px-3 py-2 font-mono overflow-auto"
            style={{ maxHeight: 120, fontSize: 10, color: '#c9d1d9' }}
          >
            {result.sql}
          </pre>
        </details>
      )}
    </div>
  )
}
