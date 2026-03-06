import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { projectsApi, connectionsApi } from '../api'
import { useAppStore } from '../stores'
import { Badge, Button, Card, Spinner } from '../components/ui'
import type { Project, Connection } from '../types'

function StatCard({ label, value, icon, color }: {
  label: string
  value: number | string
  icon: React.ReactNode
  color: string
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-[#8b949e] font-medium uppercase tracking-wider">{label}</p>
          <p className={`text-3xl font-bold mt-2 ${color}`}>{value}</p>
        </div>
        <div className={`p-2 rounded-lg bg-[#252d3d] ${color}`}>{icon}</div>
      </div>
    </Card>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { projects, setProjects, connections, setConnections } = useAppStore()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([projectsApi.list(), connectionsApi.list()])
      .then(([p, c]) => { setProjects(p); setConnections(c) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const totalJobs = 0 // would require per-project fetch

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Spinner size="lg" />
    </div>
  )

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-[#e6edf3]">Overview</h1>
          <p className="text-sm text-[#8b949e] mt-1">
            Visual ELT Platform — SQL Pushdown Engine
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Projects"
            value={projects.length}
            color="text-[#58a6ff]"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            }
          />
          <StatCard
            label="Connections"
            value={connections.length}
            color="text-[#3fb950]"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            }
          />
          <StatCard
            label="Engine"
            value="SQL"
            color="text-[#bc8cff]"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
          />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Recent Projects */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[#e6edf3]">Recent Projects</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate('/projects')}>
                View all →
              </Button>
            </div>
            {projects.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-[#484f58]">No projects yet</p>
                <Button variant="primary" size="sm" className="mt-3"
                  onClick={() => navigate('/projects')}>
                  Create Project
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {projects.slice(0, 4).map(p => (
                  <div key={p.id}
                    onClick={() => navigate(`/projects/${p.id}`)}
                    className="flex items-center justify-between p-3 rounded-md
                      bg-[#0d1117] border border-[#21262d] cursor-pointer
                      hover:border-[#58a6ff] transition-colors group">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-md bg-[#1f3d6e] flex items-center justify-center flex-shrink-0">
                        <svg className="w-3.5 h-3.5 text-[#58a6ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                      </div>
                      <span className="text-sm text-[#c9d1d9] truncate group-hover:text-[#58a6ff]">
                        {p.name}
                      </span>
                    </div>
                    <span className="text-xs text-[#484f58] flex-shrink-0 ml-2">
                      {new Date(p.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Connections */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[#e6edf3]">Connections</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate('/connections')}>
                View all →
              </Button>
            </div>
            {connections.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-[#484f58]">No connections yet</p>
                <Button variant="primary" size="sm" className="mt-3"
                  onClick={() => navigate('/connections')}>
                  Add Connection
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {connections.slice(0, 4).map(c => (
                  <div key={c.id}
                    className="flex items-center justify-between p-3 rounded-md
                      bg-[#0d1117] border border-[#21262d]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <DbIcon dbType={c.dbType} />
                      <span className="text-sm text-[#c9d1d9] truncate">{c.name}</span>
                    </div>
                    <Badge variant={c.dbType === 'POSTGRESQL' ? 'blue' : c.dbType === 'ORACLE' ? 'purple' : 'success'}>
                      {c.dbType}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Architecture Callout */}
        <Card className="p-5 border-[#1a3050]">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 p-1.5 rounded bg-[#0d1f35]">
              <svg className="w-4 h-4 text-[#58a6ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-[#58a6ff]">SQL Pushdown Architecture</p>
              <p className="text-xs text-[#8b949e] mt-1 leading-relaxed">
                Visual DAG → IR → SQL Compiler → Target DB. Zero data processing on the web server.
                Future: Spark / JVM Worker execution engine.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

function DbIcon({ dbType }: { dbType: string }) {
  const colors: Record<string, string> = {
    POSTGRESQL: 'bg-[#0d1f35] text-[#58a6ff]',
    ORACLE:     'bg-[#1f1035] text-[#bc8cff]',
    MARIADB:    'bg-[#0f2d1a] text-[#3fb950]',
  }
  const labels: Record<string, string> = { POSTGRESQL: 'PG', ORACLE: 'OR', MARIADB: 'MY' }
  return (
    <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0
      text-[10px] font-bold ${colors[dbType] ?? 'bg-[#252d3d] text-[#8b949e]'}`}>
      {labels[dbType] ?? dbType[0]}
    </div>
  )
}
