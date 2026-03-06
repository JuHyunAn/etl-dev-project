import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { projectsApi, jobsApi } from '../api'
import { useAppStore } from '../stores'
import { Badge, Button, Card, Input, Textarea, Modal, Spinner, EmptyState } from '../components/ui'
import type { Job, Project } from '../types'

function JobForm({ projectId, initial, onSave, onClose }: {
  projectId: string
  initial?: Job
  onSave: (data: { name: string; description: string }) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    try {
      await onSave({ name: name.trim(), description })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-4">
      {error && (
        <div className="p-3 rounded-md bg-[#2d0f0f] border border-[#3d1515] text-sm text-[#f85149]">
          {error}
        </div>
      )}
      <Input label="Job Name *" value={name} onChange={e => setName(e.target.value)}
        placeholder="e.g. Extract Sales Data" autoFocus />
      <Textarea label="Description" value={description} onChange={e => setDescription(e.target.value)}
        placeholder="What does this job do?" rows={3} />
      <div className="flex justify-end gap-2 pt-2 border-t border-[#21262d]">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={saving}>
          {saving ? <Spinner size="sm" /> : null}
          {initial ? 'Update' : 'Create Job'}
        </Button>
      </div>
    </div>
  )
}

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { jobs, setJobs, upsertJob, removeJob } = useAppStore()
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Job | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const projectJobs = jobs[projectId!] ?? []

  useEffect(() => {
    if (!projectId) return
    Promise.all([
      projectsApi.get(projectId),
      jobsApi.list(projectId),
    ]).then(([p, j]) => {
      setProject(p)
      setJobs(projectId, j)
    }).catch(() => {})
    .finally(() => setLoading(false))
  }, [projectId])

  const handleSave = async (data: { name: string; description: string }) => {
    if (!projectId) return
    if (editing) {
      const updated = await jobsApi.update(projectId, editing.id, data)
      upsertJob(projectId, updated)
    } else {
      const created = await jobsApi.create(projectId, { ...data, irJson: JSON.stringify({
        id: crypto.randomUUID(), version: '0.1', engineType: 'SQL_PUSHDOWN',
        nodes: [], edges: [], context: {}
      })})
      upsertJob(projectId, created)
    }
    setEditing(null)
  }

  const handleDelete = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Delete this job?')) return
    setDeleting(jobId)
    try {
      await jobsApi.delete(projectId!, jobId)
      removeJob(projectId!, jobId)
    } finally {
      setDeleting(null)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full"><Spinner size="lg" /></div>
  )

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <button onClick={() => navigate('/projects')}
                className="text-sm text-[#8b949e] hover:text-[#e6edf3] transition-colors">
                Projects
              </button>
              <svg className="w-3 h-3 text-[#484f58]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-[#e6edf3]">{project?.name}</h1>
            {project?.description && (
              <p className="text-sm text-[#8b949e] mt-1">{project.description}</p>
            )}
          </div>
          <Button variant="primary" onClick={() => { setEditing(null); setShowForm(true) }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Job
          </Button>
        </div>

        {/* Jobs List */}
        {projectJobs.length === 0 ? (
          <Card>
            <EmptyState
              icon={
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                </svg>
              }
              title="No jobs yet"
              description="Create an ETL job to start designing your pipeline"
              action={<Button variant="primary" size="sm" onClick={() => setShowForm(true)}>Create Job</Button>}
            />
          </Card>
        ) : (
          <div className="space-y-2">
            {projectJobs.map(job => (
              <Card key={job.id}
                className="p-4 group cursor-pointer"
                onClick={() => navigate(`/projects/${projectId}/jobs/${job.id}`)}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#1c2333] border border-[#30363d]
                      flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-[#8b949e] group-hover:text-[#58a6ff] transition-colors"
                        fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#e6edf3] group-hover:text-[#58a6ff] transition-colors">
                          {job.name}
                        </span>
                        <Badge variant={job.status === 'PUBLISHED' ? 'success' : 'default'}>
                          {job.status}
                        </Badge>
                        <span className="text-xs text-[#484f58]">v{job.version}</span>
                      </div>
                      {job.description && (
                        <p className="text-xs text-[#8b949e] mt-0.5 truncate">{job.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-[#484f58]">
                      {new Date(job.updatedAt).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => { e.stopPropagation(); setEditing(job); setShowForm(true) }}
                        className="p-1.5 rounded text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#252d3d]">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={e => handleDelete(job.id, e)}
                        disabled={deleting === job.id}
                        className="p-1.5 rounded text-[#8b949e] hover:text-[#f85149] hover:bg-[#2d0f0f]">
                        {deleting === job.id ? <Spinner size="sm" /> : (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <svg className="w-4 h-4 text-[#484f58] group-hover:text-[#58a6ff] transition-colors"
                      fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); setEditing(null) }}
        title={editing ? 'Edit Job' : 'New Job'}
      >
        <JobForm
          projectId={projectId!}
          initial={editing ?? undefined}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null) }}
        />
      </Modal>
    </div>
  )
}
