import client from './client'
import type {
  Connection, ConnectionCreateRequest, ConnectionTestResult,
  Project, Job, ExecutionResult, TableInfo, ColumnInfo
} from '../types'

// ── Connections ──────────────────────────────────────────────
export const connectionsApi = {
  list: () => client.get<Connection[]>('/api/connections').then(r => r.data),
  get: (id: string) => client.get<Connection>(`/api/connections/${id}`).then(r => r.data),
  create: (data: ConnectionCreateRequest) =>
    client.post<Connection>('/api/connections', data).then(r => r.data),
  update: (id: string, data: Partial<ConnectionCreateRequest>) =>
    client.put<Connection>(`/api/connections/${id}`, data).then(r => r.data),
  delete: (id: string) => client.delete(`/api/connections/${id}`),
  test: (id: string) =>
    client.post<ConnectionTestResult>(`/api/connections/${id}/test`).then(r => r.data),
}

// ── Schema ───────────────────────────────────────────────────
export const schemaApi = {
  listTables: (connectionId: string) =>
    client.get<{ tables: TableInfo[] }>(`/api/connections/${connectionId}/schema/tables`)
      .then(r => r.data.tables),
  getColumns: (connectionId: string, tableName: string, schemaName?: string) =>
    client.get<{ columns: ColumnInfo[] }>(`/api/connections/${connectionId}/schema/tables/${tableName}`, {
      params: schemaName ? { schema: schemaName } : undefined
    }).then(r => r.data.columns),
}

// ── Projects ─────────────────────────────────────────────────
export const projectsApi = {
  list: () => client.get<Project[]>('/api/projects').then(r => r.data),
  get: (id: string) => client.get<Project>(`/api/projects/${id}`).then(r => r.data),
  create: (data: { name: string; description?: string }) =>
    client.post<Project>('/api/projects', data).then(r => r.data),
  update: (id: string, data: { name?: string; description?: string }) =>
    client.put<Project>(`/api/projects/${id}`, data).then(r => r.data),
  delete: (id: string) => client.delete(`/api/projects/${id}`),
}

// ── Jobs ──────────────────────────────────────────────────────
export const jobsApi = {
  list: (projectId: string) =>
    client.get<Job[]>(`/api/projects/${projectId}/jobs`).then(r => r.data),
  get: (projectId: string, jobId: string) =>
    client.get<Job>(`/api/projects/${projectId}/jobs/${jobId}`).then(r => r.data),
  create: (projectId: string, data: { name: string; description?: string; irJson?: string }) =>
    client.post<Job>(`/api/projects/${projectId}/jobs`, data).then(r => r.data),
  update: (projectId: string, jobId: string, data: Partial<Job>) =>
    client.put<Job>(`/api/projects/${projectId}/jobs/${jobId}`, data).then(r => r.data),
  delete: (projectId: string, jobId: string) =>
    client.delete(`/api/projects/${projectId}/jobs/${jobId}`),
  publish: (projectId: string, jobId: string) =>
    client.post<Job>(`/api/projects/${projectId}/jobs/${jobId}/publish`).then(r => r.data),
}

// ── Execution ─────────────────────────────────────────────────
export const executionApi = {
  run: (jobId: string, context?: Record<string, string>, previewMode?: boolean) =>
    client.post<ExecutionResult>(`/api/jobs/${jobId}/run`, {
      context: context ?? {},
      previewMode: previewMode ?? false,
    }).then(r => r.data),
}
