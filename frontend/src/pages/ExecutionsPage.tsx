import React from 'react'
import { useAppStore } from '../stores'
import { Badge, Card } from '../components/ui'
import type { ExecutionResult, ExecutionStatus } from '../types'

function statusVariant(s: ExecutionStatus): 'success' | 'error' | 'warning' | 'blue' | 'default' {
  switch (s) {
    case 'SUCCESS': return 'success'
    case 'FAILED':  return 'error'
    case 'RUNNING': return 'blue'
    case 'PENDING': return 'warning'
    default:        return 'default'
  }
}

export default function ExecutionsPage() {
  const { lastExecution } = useAppStore()

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-[#e6edf3]">Runs</h1>
          <p className="text-sm text-[#8b949e] mt-1">Execution history</p>
        </div>

        {!lastExecution ? (
          <Card>
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#252d3d] flex items-center justify-center">
                <svg className="w-6 h-6 text-[#484f58]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-[#8b949e]">No executions yet</p>
                <p className="text-xs text-[#484f58] mt-1">Run a job from the Job Designer to see results here</p>
              </div>
            </div>
          </Card>
        ) : (
          <ExecutionDetail result={lastExecution} />
        )}
      </div>
    </div>
  )
}

function ExecutionDetail({ result }: { result: ExecutionResult }) {
  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <Card className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={statusVariant(result.status)}>{result.status}</Badge>
              <span className="text-xs text-[#484f58] font-mono">{result.executionId}</span>
            </div>
            <p className="text-xs text-[#8b949e]">
              Started: {new Date(result.startedAt).toLocaleString()}
              {result.finishedAt && ` · Finished: ${new Date(result.finishedAt).toLocaleString()}`}
              {result.durationMs && ` · Duration: ${result.durationMs}ms`}
            </p>
          </div>
        </div>

        {result.errorMessage && (
          <div className="p-3 rounded-md bg-[#2d0f0f] border border-[#3d1515] text-sm text-[#f85149] mb-4">
            {result.errorMessage}
          </div>
        )}

        {/* Node Results */}
        {Object.keys(result.nodeResults).length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[#8b949e] mb-2 uppercase tracking-wider">Node Results</p>
            <div className="space-y-2">
              {Object.entries(result.nodeResults).map(([id, r]) => (
                <div key={id} className="flex items-center justify-between p-3 rounded-md
                  bg-[#0d1117] border border-[#21262d]">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0
                      ${r.status === 'SUCCESS' ? 'bg-[#3fb950]'
                        : r.status === 'FAILED' ? 'bg-[#f85149]'
                        : r.status === 'RUNNING' ? 'bg-[#58a6ff] animate-pulse'
                        : 'bg-[#484f58]'}`} />
                    <div>
                      <p className="text-xs font-medium text-[#c9d1d9]">{r.nodeType}</p>
                      {r.errorMessage && (
                        <p className="text-xs text-[#f85149]">{r.errorMessage}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[#484f58]">
                    {r.rowsProcessed > 0 && <span>{r.rowsProcessed.toLocaleString()} rows</span>}
                    {r.rowsRejected > 0 && <span className="text-[#d29922]">{r.rowsRejected} rejected</span>}
                    {r.durationMs > 0 && <span>{r.durationMs}ms</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Logs */}
      {result.logs.length > 0 && (
        <Card className="p-5">
          <p className="text-xs font-semibold text-[#8b949e] mb-3 uppercase tracking-wider">Execution Logs</p>
          <div className="bg-[#0d1117] rounded-md p-4 font-mono text-xs space-y-1 max-h-80 overflow-y-auto">
            {result.logs.map((log, i) => (
              <p key={i} className="text-[#8b949e] leading-relaxed">{log}</p>
            ))}
          </div>
        </Card>
      )}

      {/* Node SQL */}
      {Object.values(result.nodeResults).some(r => r.generatedSql) && (
        <Card className="p-5">
          <p className="text-xs font-semibold text-[#8b949e] mb-3 uppercase tracking-wider">Generated SQL</p>
          <div className="space-y-3">
            {Object.entries(result.nodeResults).filter(([, r]) => r.generatedSql).map(([id, r]) => (
              <div key={id}>
                <p className="text-xs text-[#484f58] mb-1">{r.nodeType}</p>
                <pre className="bg-[#0d1117] border border-[#21262d] rounded-md p-3
                  text-xs font-mono text-[#e6edf3] overflow-x-auto whitespace-pre-wrap">
                  {r.generatedSql}
                </pre>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
