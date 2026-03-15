import client from './client'
import type {
  Connection, ConnectionCreateRequest, ConnectionTestResult,
  Project, Job, ExecutionResult, ExecutionSummary, TableInfo, ColumnInfo,
  Schedule, ScheduleCreateRequest, ScheduleExecutionDetail, PreviewNodeResult
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
  run: (jobId: string, context?: Record<string, string>, previewMode?: boolean, cancelToken?: string) =>
    client.post<ExecutionResult>(`/api/jobs/${jobId}/run`, {
      context: context ?? {},
      previewMode: previewMode ?? false,
      cancelToken,
    }, { timeout: 300000 }).then(r => r.data),

  cancel: (cancelToken: string) =>
    client.post(`/api/executions/cancel/${cancelToken}`).then(r => r.data),

  listAll: (page = 0, size = 20) =>
    client.get<{ content: ExecutionSummary[]; totalElements: number; totalPages: number }>(
      '/api/executions', { params: { page, size } }
    ).then(r => r.data),

  listByJob: (jobId: string) =>
    client.get<ExecutionSummary[]>(`/api/jobs/${jobId}/executions`).then(r => r.data),

  getDetail: (id: string) =>
    client.get<ExecutionResult>(`/api/executions/${id}`).then(r => r.data),

  previewNode: (
    jobId: string,
    nodeId: string,
    outputNodeId?: string,
    context?: Record<string, string>
  ) =>
    client.post<PreviewNodeResult>(`/api/jobs/${jobId}/preview-node`, {
      nodeId,
      outputNodeId: outputNodeId ?? null,
      context: context ?? {},
    }, { timeout: 30000 }).then(r => r.data),
}

// ── Schedules ─────────────────────────────────────────────────
export const schedulesApi = {
  list: () => client.get<Schedule[]>('/api/schedules').then(r => r.data),
  get: (id: string) => client.get<Schedule>(`/api/schedules/${id}`).then(r => r.data),
  create: (data: ScheduleCreateRequest) =>
    client.post<Schedule>('/api/schedules', data).then(r => r.data),
  update: (id: string, data: Partial<ScheduleCreateRequest> & { enabled?: boolean }) =>
    client.put<Schedule>(`/api/schedules/${id}`, data).then(r => r.data),
  delete: (id: string) => client.delete(`/api/schedules/${id}`),
  setEnabled: (id: string, enabled: boolean) =>
    client.patch<Schedule>(`/api/schedules/${id}/enabled`, null, { params: { enabled } }).then(r => r.data),
  trigger: (id: string) =>
    client.post(`/api/schedules/${id}/trigger`).then(r => r.data),
  listExecutions: (id: string) =>
    client.get<ScheduleExecutionDetail[]>(`/api/schedules/${id}/executions`).then(r => r.data),
  listByJob: (jobId: string) =>
    client.get<Schedule[]>(`/api/schedules/by-job/${jobId}`).then(r => r.data),
}
