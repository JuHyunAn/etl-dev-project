import React from 'react'
import type { PreviewNodeResult } from '../../types'

interface Props {
  nodeLabel: string
  outputLabel?: string
  result: PreviewNodeResult | null
  loading: boolean
  onRefresh: () => void
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
  outputOptions,
  selectedOutputId,
  onOutputChange,
}: Props) {
  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#fff' }}>
      {/* 헤더 */}
      <div
        className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5"
        style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}
      >
        <svg className="w-3.5 h-3.5 text-[#6366f1]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 10h18M3 14h18M3 6h18M3 18h18" />
        </svg>
        <span className="text-[11px] font-semibold text-[#374151]">
          Preview
        </span>
        <span className="text-[11px] text-[#6366f1] font-medium">{nodeLabel}</span>
        {outputLabel && (
          <>
            <span className="text-[10px] text-[#94a3b8]">→</span>
            <span className="text-[11px] text-[#0ea5e9] font-medium">{outputLabel}</span>
          </>
        )}

        {/* multi-output 드롭다운 */}
        {outputOptions && outputOptions.length > 1 && onOutputChange && (
          <select
            value={selectedOutputId ?? ''}
            onChange={e => onOutputChange(e.target.value)}
            className="ml-1 text-[10px] border border-[#d1d5db] rounded px-1.5 py-0.5 bg-white text-[#374151]"
          >
            {outputOptions.map(o => (
              <option key={o.nodeId} value={o.nodeId}>{o.label}</option>
            ))}
          </select>
        )}

        <div className="flex-1" />

        {result && !result.error && (
          <span className="text-[10px] text-[#64748b]">
            {result.rowCount}행 · {result.durationMs}ms
          </span>
        )}

        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
          style={{
            background: loading ? '#f1f5f9' : '#6366f1',
            color: loading ? '#94a3b8' : '#fff',
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
          <div className="flex items-center justify-center h-full text-[12px] text-[#94a3b8]">
            노드를 선택하고 [실행]을 눌러 데이터를 미리 확인하세요.
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center h-full text-[12px] text-[#94a3b8]">
            <svg className="w-4 h-4 animate-spin mr-2 text-[#6366f1]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            DB에서 데이터를 조회하는 중...
          </div>
        )}

        {result?.error && !loading && (
          <div className="flex items-start gap-2 m-3 p-3 rounded-lg"
            style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
            <svg className="w-4 h-4 text-[#dc2626] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <pre className="text-[11px] text-[#dc2626] whitespace-pre-wrap font-mono">{result.error}</pre>
          </div>
        )}

        {result && !result.error && !loading && (
          <table className="w-full text-[11px] border-collapse" style={{ tableLayout: 'auto' }}>
            <thead>
              <tr style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                <th
                  className="px-2 py-1.5 text-left font-semibold text-[10px] uppercase tracking-wider"
                  style={{ color: '#64748b', borderBottom: '2px solid #e2e8f0', width: 40, minWidth: 40 }}
                >
                  #
                </th>
                {result.columns.map(col => (
                  <th
                    key={col}
                    className="px-2 py-1.5 text-left font-semibold text-[10px] uppercase tracking-wider whitespace-nowrap"
                    style={{ color: '#374151', borderBottom: '2px solid #e2e8f0' }}
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
                    className="px-3 py-4 text-center text-[11px] text-[#94a3b8]"
                  >
                    조건에 맞는 데이터가 없습니다 (0행)
                  </td>
                </tr>
              ) : (
                result.rows.map((row, ri) => (
                  <tr
                    key={ri}
                    style={{ background: ri % 2 === 0 ? '#fff' : '#f8fafc' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
                    onMouseLeave={e => (e.currentTarget.style.background = ri % 2 === 0 ? '#fff' : '#f8fafc')}
                  >
                    <td
                      className="px-2 py-1 text-right font-mono"
                      style={{ color: '#94a3b8', borderBottom: '1px solid #f1f5f9', minWidth: 40 }}
                    >
                      {ri + 1}
                    </td>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className="px-2 py-1 font-mono whitespace-nowrap"
                        style={{
                          color: cell === null ? '#94a3b8' : '#1e293b',
                          borderBottom: '1px solid #f1f5f9',
                          fontStyle: cell === null ? 'italic' : 'normal',
                          maxWidth: 240,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={cell === null ? 'NULL' : String(cell)}
                      >
                        {cell === null ? 'NULL' : String(cell)}
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
          style={{ borderColor: '#e2e8f0', background: '#f8fafc' }}
        >
          <summary className="px-3 py-1 cursor-pointer text-[#64748b] select-none">
            실행된 SQL 보기
          </summary>
          <pre
            className="px-3 py-2 font-mono overflow-auto text-[#334155]"
            style={{ maxHeight: 120, fontSize: 10 }}
          >
            {result.sql}
          </pre>
        </details>
      )}
    </div>
  )
}
