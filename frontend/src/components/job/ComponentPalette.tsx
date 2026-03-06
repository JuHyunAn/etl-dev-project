import React, { useState } from 'react'
import type { ComponentType } from '../../types'

interface ComponentDef {
  type: ComponentType
  label: string
  description: string
  color: string
  icon: React.ReactNode
}

const PALETTE: { group: string; color: string; items: ComponentDef[] }[] = [
  {
    group: 'Input',
    color: 'text-[#3fb950]',
    items: [
      {
        type: 'T_JDBC_INPUT',
        label: 'DB Input',
        description: 'Read from database table or query',
        color: '#0f2d1a',
        icon: (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
        ),
      },
      {
        type: 'T_FILE_INPUT',
        label: 'File Input',
        description: 'Read from CSV/TSV file',
        color: '#0f2d1a',
        icon: (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        ),
      },
    ],
  },
  {
    group: 'Transform',
    color: 'text-[#58a6ff]',
    items: [
      { type: 'T_MAP', label: 'Map', description: 'Column mapping & expressions', color: '#0d1f35', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg> },
      { type: 'T_FILTER_ROW', label: 'Filter', description: 'Filter rows by condition', color: '#0d1f35', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg> },
      { type: 'T_AGGREGATE_ROW', label: 'Aggregate', description: 'GROUP BY aggregation', color: '#0d1f35', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
      { type: 'T_JOIN', label: 'Join', description: 'INNER/LEFT/RIGHT join', color: '#0d1f35', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> },
      { type: 'T_SORT_ROW', label: 'Sort', description: 'Sort rows by columns', color: '#0d1f35', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg> },
      { type: 'T_UNION_ROW', label: 'Union', description: 'Combine multiple inputs', color: '#0d1f35', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg> },
      { type: 'T_CONVERT_TYPE', label: 'Convert', description: 'Type conversion', color: '#0d1f35', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> },
      { type: 'T_REPLACE', label: 'Replace', description: 'Value replacement', color: '#0d1f35', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg> },
    ],
  },
  {
    group: 'Output',
    color: 'text-[#f0883e]',
    items: [
      { type: 'T_JDBC_OUTPUT', label: 'DB Output', description: 'Write to database table', color: '#2d1a07', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg> },
      { type: 'T_FILE_OUTPUT', label: 'File Output', description: 'Write to CSV file', color: '#2d1a07', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> },
    ],
  },
  {
    group: 'Orchestration',
    color: 'text-[#bc8cff]',
    items: [
      { type: 'T_PRE_JOB', label: 'Pre Job', description: 'Run before job starts', color: '#1f1035', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" /></svg> },
      { type: 'T_POST_JOB', label: 'Post Job', description: 'Run after job completes', color: '#1f1035', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-14 9V3z" /></svg> },
      { type: 'T_RUN_JOB', label: 'Run Job', description: 'Execute a sub-job', color: '#1f1035', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
      { type: 'T_SLEEP', label: 'Sleep', description: 'Wait for duration', color: '#1f1035', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
    ],
  },
  {
    group: 'Logs & Error',
    color: 'text-[#d29922]',
    items: [
      { type: 'T_LOG_ROW', label: 'Log Row', description: 'Log data rows', color: '#2d2007', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
      { type: 'T_DIE', label: 'Die', description: 'Force job termination', color: '#2d2007', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg> },
    ],
  },
  {
    group: 'AETL Advanced',
    color: 'text-[#58a6ff]',
    items: [
      { type: 'T_VALIDATE', label: 'Validate', description: 'Auto SQL validation', color: '#0d1f35', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
      { type: 'T_PROFILE', label: 'Profile', description: 'Data profiling analysis', color: '#0d1f35', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
      { type: 'T_LINEAGE', label: 'Lineage', description: 'Data lineage tracking', color: '#0d1f35', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg> },
    ],
  },
]

interface Props {
  onDragStart: (type: ComponentType, label: string) => void
  showContextPanel?: boolean
  onToggleContextPanel?: () => void
  varsCount?: number
}

export default function ComponentPalette({ onDragStart, showContextPanel, onToggleContextPanel, varsCount = 0 }: Props) {
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const filtered = PALETTE.map(g => ({
    ...g,
    items: g.items.filter(item =>
      !search || item.label.toLowerCase().includes(search.toLowerCase()) ||
      item.description.toLowerCase().includes(search.toLowerCase())
    )
  })).filter(g => g.items.length > 0)

  return (
    <div className="flex-1 bg-[#161b27] border-r border-[#21262d] flex flex-col overflow-hidden">
      <div className="p-3 border-b border-[#21262d]">
        <p className="text-xs font-semibold text-[#e6edf3] mb-2">Components</p>
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#484f58]"
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full bg-[#0d1117] border border-[#30363d] rounded-md pl-7 pr-3 py-1.5
              text-xs text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {/* FUNCTION 그룹 — 고정 항목 (검색 미적용) */}
        {!search && (
          <div className="mb-1">
            <div className="w-full flex items-center justify-between px-3 py-1.5">
              <span className="text-xs font-semibold text-[#f85149] uppercase tracking-wider">Function</span>
            </div>
            <div className="space-y-0.5 px-2">
              <button
                onClick={onToggleContextPanel}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded transition-colors select-none
                  ${showContextPanel ? 'bg-[#2d0f0f]' : 'hover:bg-[#252d3d]'}`}>
                <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 bg-[#2d0f0f]">
                  <svg className="w-3.5 h-3.5 text-[#f85149]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-xs font-medium text-[#c9d1d9] truncate">Context 변수</p>
                </div>
                {varsCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-[#f8514920] text-[#f85149] font-mono flex-shrink-0">
                    {varsCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        {filtered.map(group => (
          <div key={group.group} className="mb-1">
            <button
              onClick={() => setCollapsed(c => ({ ...c, [group.group]: !c[group.group] }))}
              className="w-full flex items-center justify-between px-3 py-1.5
                text-xs font-semibold text-[#484f58] hover:text-[#8b949e] transition-colors uppercase tracking-wider">
              <span className={group.color}>{group.group}</span>
              <svg className={`w-3 h-3 transition-transform ${collapsed[group.group] ? '-rotate-90' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {!collapsed[group.group] && (
              <div className="space-y-0.5 px-2">
                {group.items.map(item => (
                  <div
                    key={item.type}
                    draggable
                    onDragStart={() => onDragStart(item.type, item.label)}
                    title={item.description}
                    className="flex items-center gap-2 px-2 py-1.5 rounded cursor-grab
                      hover:bg-[#252d3d] transition-colors group select-none">
                    <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0`}
                      style={{ backgroundColor: item.color }}>
                      <span className={group.color}>{item.icon}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[#c9d1d9] truncate">{item.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export { PALETTE }
export type { ComponentDef }
