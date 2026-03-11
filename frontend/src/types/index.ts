export type DbType = 'POSTGRESQL' | 'ORACLE' | 'MARIADB'
export type JobStatus = 'DRAFT' | 'PUBLISHED'
export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED'
export type EngineType = 'SQL_PUSHDOWN' | 'PYTHON_WORKER' | 'JVM_WORKER'
export type LinkType = 'ROW' | 'TRIGGER' | 'REJECT' | 'LOOKUP'
export type TriggerCondition = 'ON_OK' | 'ON_ERROR'
export type PortType = 'ROW' | 'TRIGGER' | 'REJECT' | 'LOOKUP'

export type ComponentType =
  | 'T_JDBC_INPUT' | 'T_FILE_INPUT'
  | 'T_MAP' | 'T_FILTER_ROW' | 'T_AGGREGATE_ROW' | 'T_SORT_ROW'
  | 'T_JOIN' | 'T_CONVERT_TYPE' | 'T_REPLACE' | 'T_UNION_ROW'
  | 'T_JDBC_OUTPUT' | 'T_FILE_OUTPUT'
  | 'T_PRE_JOB' | 'T_POST_JOB' | 'T_RUN_JOB' | 'T_SLEEP' | 'T_LOOP'
  | 'T_DB_COMMIT' | 'T_DB_ROLLBACK'
  | 'T_LOG_ROW' | 'T_DIE'
  | 'T_VALIDATE' | 'T_PROFILE' | 'T_LINEAGE'

export interface Connection {
  id: string
  name: string
  description: string
  dbType: DbType
  host: string
  port: number
  database: string
  schema?: string
  username: string
  sslEnabled: boolean
  jdbcUrlOverride?: string
  createdAt: string
  updatedAt: string
}

export interface ConnectionCreateRequest {
  name: string
  description?: string
  dbType: DbType
  host: string
  port: number
  database: string
  schema?: string
  username: string
  password: string
  sslEnabled?: boolean
  jdbcUrlOverride?: string
}

export interface ConnectionTestResult {
  success: boolean
  message: string
  durationMs: number
}

export interface Project {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
}

export interface Job {
  id: string
  projectId: string
  folderId?: string
  name: string
  description: string
  version: string
  status: JobStatus
  irJson: string
  createdAt: string
  updatedAt: string
}

export interface ColumnIR {
  name: string
  type: string
  nullable?: boolean
  length?: number
}

export interface PortIR {
  id: string
  name: string
  portType: PortType
  schema?: ColumnIR[]
}

export interface NodeIR {
  id: string
  type: ComponentType
  label: string
  position: { x: number; y: number }
  config: Record<string, unknown>
  inputPorts: PortIR[]
  outputPorts: PortIR[]
}

export interface EdgeIR {
  id: string
  source: string
  sourcePort: string
  target: string
  targetPort: string
  linkType: LinkType
  triggerCondition?: TriggerCondition
}

export interface ContextVar {
  value: string
  defaultValue?: string
  description?: string
}

export interface JobIR {
  id: string
  version: string
  engineType: EngineType
  nodes: NodeIR[]
  edges: EdgeIR[]
  context: Record<string, ContextVar>
}

export interface LogRowData {
  columns: string[]
  rows: (string | number | boolean | null)[][]
}

export interface NodeResult {
  nodeId: string
  nodeType: string
  status: ExecutionStatus
  rowsProcessed: number
  rowsRejected: number
  durationMs: number
  generatedSql?: string
  errorMessage?: string
  rowSamples?: LogRowData
}

export interface ExecutionResult {
  executionId: string
  jobId: string
  status: ExecutionStatus
  startedAt: string
  finishedAt?: string
  durationMs?: number
  nodeResults: Record<string, NodeResult>
  errorMessage?: string
  logs: string[]
}

export interface ExecutionSummary {
  id: string
  jobId: string
  jobName: string
  jobVersion: string
  status: ExecutionStatus
  previewMode: boolean
  startedAt: string
  finishedAt?: string
  durationMs?: number
  errorMessage?: string
  triggeredBy: string
}

// ── Schedule ───────────────────────────────────────────────────

export interface ScheduleStep {
  id: string
  scheduleId: string
  jobId: string
  stepOrder: number
  dependsOnStepId?: string
  runCondition: 'ON_SUCCESS' | 'ON_FAILURE' | 'ON_COMPLETE'
  timeoutSeconds: number
  retryCount: number
  retryDelaySeconds: number
  contextOverrides: string
  enabled: boolean
}

export interface ScheduleExecutionSummary {
  id: string
  scheduleId: string
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'CANCELLED'
  startedAt: string
  finishedAt?: string
  totalSteps?: number
  completedSteps: number
  failedSteps: number
  skippedSteps: number
  triggerType: 'CRON' | 'MANUAL' | 'API' | 'RETRY'
  errorSummary?: string
}

export interface StepExecution {
  id: string
  scheduleStepId: string
  executionId?: string
  jobId: string
  stepOrder: number
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED'
  startedAt?: string
  finishedAt?: string
  retryAttempt: number
  errorMessage?: string
}

export interface ScheduleExecutionDetail extends ScheduleExecutionSummary {
  stepExecutions: StepExecution[]
}

export interface Schedule {
  id: string
  name: string
  description?: string
  cronExpression: string
  timezone: string
  enabled: boolean
  lastFiredAt?: string
  nextFireAt?: string
  consecutiveFailures: number
  alertCondition: string
  alertChannel?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
  steps: ScheduleStep[]
  recentExecutions: ScheduleExecutionSummary[]
}

export interface ScheduleCreateRequest {
  name: string
  description?: string
  cronExpression: string
  timezone?: string
  enabled?: boolean
  alertCondition?: string
  alertChannel?: string
  steps: {
    jobId: string
    stepOrder?: number
    dependsOnStepOrder?: number
    runCondition?: string
    timeoutSeconds?: number
    retryCount?: number
    retryDelaySeconds?: number
    contextOverrides?: string
  }[]
}

export interface TableInfo {
  schemaName: string
  tableName: string
  tableType: string
}

export interface ColumnInfo {
  columnName: string
  dataType: string
  nullable: boolean
  columnDefault?: string
  characterMaxLength?: number
  numericPrecision?: number
  numericScale?: number
  isPrimaryKey: boolean
}
