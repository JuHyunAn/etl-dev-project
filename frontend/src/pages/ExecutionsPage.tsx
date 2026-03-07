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
    <div className="h-full overflow-y-auto" style={{ background: '#f0f4f8' }}>
      <div className="px-6 py-5" style={{ borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
        <div className="max-w-5xl mx-auto">
          <h1 className="text-xl font-bold" style={{ color: '#0f172a' }}>Runs</h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748b' }}>Execution history</p>
        </div>
      </div>
      <div className="px-6 py-5">
      <div className="max-w-5xl mx-auto space-y-6">
        {!lastExecution ? (
          <Card>
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: '#111e35', border: '1px solid #1a2d47' }}>
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  style={{ color: '#3d5573' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium" style={{ color: '#7a93b5' }}>No executions yet</p>
                <p className="text-xs mt-1" style={{ color: '#3d5573' }}>Run a job from the Job Designer to see results here</p>
              </div>
            </div>
          </Card>
        ) : (
          <ExecutionDetail result={lastExecution} />
        )}
      </div>
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
              <span className="text-xs font-mono" style={{ color: '#3d5573' }}>{result.executionId}</span>
            </div>
            <p className="text-xs" style={{ color: '#4d6b8a' }}>
              Started: {new Date(result.startedAt).toLocaleString()}
              {result.finishedAt && ` · Finished: ${new Date(result.finishedAt).toLocaleString()}`}
              {result.durationMs && ` · Duration: ${result.durationMs}ms`}
            </p>
          </div>
        </div>

        {result.errorMessage && (
          <div className="p-3 rounded-lg text-sm mb-4" style={{ background: '#2a0f0f', border: '1px solid #3a1515', color: '#f87070' }}>
            {result.errorMessage}
          </div>
        )}

        {/* Node Results */}
        {Object.keys(result.nodeResults).length > 0 && (
          <div>
            <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: '#4d6b8a' }}>Node Results</p>
            <div className="space-y-2">
              {Object.entries(result.nodeResults).map(([id, r]) => (
                <div key={id} className="flex items-center justify-between p-3 rounded-lg"
                  style={{ background: '#08121f', border: '1px solid #1a2d47' }}>
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{
                        background: r.status === 'SUCCESS' ? '#22c55e' : r.status === 'FAILED' ? '#f87070' : r.status === 'RUNNING' ? '#4f82f7' : '#3d5573',
                        boxShadow: r.status === 'RUNNING' ? '0 0 6px rgba(79,130,247,0.6)' : undefined
                      }} />
                    <div>
                      <p className="text-xs font-medium" style={{ color: '#adc3e0' }}>{r.nodeType}</p>
                      {r.errorMessage && (
                        <p className="text-xs" style={{ color: '#f87070' }}>{r.errorMessage}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs" style={{ color: '#3d5573' }}>
                    {r.rowsProcessed > 0 && <span>{r.rowsProcessed.toLocaleString()} rows</span>}
                    {r.rowsRejected > 0 && <span style={{ color: '#fbbf24' }}>{r.rowsRejected} rejected</span>}
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
          <p className="text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: '#4d6b8a' }}>Execution Logs</p>
          <div className="rounded-lg p-4 font-mono text-xs space-y-1 max-h-80 overflow-y-auto"
            style={{ background: '#06101c', border: '1px solid #1a2d47' }}>
            {result.logs.map((log, i) => (
              <p key={i} className="leading-relaxed" style={{ color: '#7a93b5' }}>{log}</p>
            ))}
          </div>
        </Card>
      )}

      {/* Node SQL */}
      {Object.values(result.nodeResults).some(r => r.generatedSql) && (
        <Card className="p-5">
          <p className="text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: '#4d6b8a' }}>Generated SQL</p>
          <div className="space-y-3">
            {Object.entries(result.nodeResults).filter(([, r]) => r.generatedSql).map(([id, r]) => (
              <div key={id}>
                <p className="text-xs mb-1" style={{ color: '#3d5573' }}>{r.nodeType}</p>
                <pre className="rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap"
                  style={{ background: '#06101c', border: '1px solid #1a2d47', color: '#dde8f8' }}>
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
