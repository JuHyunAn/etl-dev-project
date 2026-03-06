import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  BackgroundVariant,
  type Node, type Edge, type Connection as FlowConnection,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { jobsApi, executionApi, connectionsApi } from '../api'
import { useAppStore } from '../stores'
import { Badge, Button, Spinner } from '../components/ui'
import ComponentPalette from '../components/job/ComponentPalette'
import PropertiesPanel from '../components/job/PropertiesPanel'
import MappingEditorModal from '../components/job/MappingEditorModal'
import SchemaTree from '../components/job/SchemaTree'
import AiAgentPanel from '../components/job/AiAgentPanel'
import { nodeTypes } from '../components/job/CustomNodes'
import type { ComponentType, JobIR, ExecutionResult, ColumnInfo } from '../types'
import type { AiGraphSpec, AiPatchSpec } from '../api/ai'
import { buildAutoMappings } from '../utils/mapping'
import Editor from '@monaco-editor/react'

type BottomPanel = 'sql' | 'logs' | 'summary' | null

type EtlNodeData = {
  label: string
  componentType: ComponentType
  config: Record<string, unknown>
  status?: 'idle' | 'running' | 'success' | 'failed'
  [key: string]: unknown
}

function irToFlow(ir: JobIR): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = ir.nodes.map(n => ({
    id: n.id,
    type: 'etlNode',
    position: n.position,
    data: {
      label: n.label,
      componentType: n.type,
      config: n.config,
      status: 'idle',
    } as EtlNodeData,
  }))
  const edges: Edge[] = ir.edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: false,
    style: { stroke: '#58a6ff', strokeWidth: 2 },
  }))
  return { nodes, edges }
}

function flowToIR(jobId: string, nodes: Node[], edges: Edge[]): JobIR {
  return {
    id: jobId,
    version: '0.1',
    engineType: 'SQL_PUSHDOWN',
    nodes: nodes.map(n => {
      const d = n.data as EtlNodeData
      return {
        id: n.id,
        type: d.componentType,
        label: d.label,
        position: n.position,
        config: d.config ?? {},
        inputPorts: [],
        outputPorts: [],
      }
    }),
    edges: edges.map(e => ({
      id: e.id,
      source: e.source,
      sourcePort: 'out',
      target: e.target,
      targetPort: 'in',
      linkType: 'ROW',
    })),
    context: {},
  }
}

export default function JobDesignerPage() {
  const { projectId, jobId } = useParams<{ projectId: string; jobId: string }>()
  const navigate = useNavigate()
  const { upsertJob, connections, setConnections } = useAppStore()

  const [jobName, setJobName] = useState('')
  const [jobStatus, setJobStatus] = useState<'DRAFT' | 'PUBLISHED'>('DRAFT')
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [bottomPanel, setBottomPanel] = useState<BottomPanel>('sql')
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null)
  const [previewMode, setPreviewMode] = useState(false)
  const [dragType, setDragType] = useState<{ type: ComponentType; label: string } | null>(null)
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null)
  const [mappingTarget, setMappingTarget] = useState<{ nodeId: string; nodeLabel: string } | null>(null)
  const [schemaTreeCollapsed, setSchemaTreeCollapsed] = useState(false)
  const [schemaHeight, setSchemaHeight] = useState(240)
  const schemaResizingRef = useRef(false)
  const schemaResizeStartY = useRef(0)
  const schemaResizeStartH = useRef(0)
  const [aiPanelOpen, setAiPanelOpen] = useState(false)

  // 커넥션 목록이 없으면 직접 로드 (다른 페이지 거치지 않고 진입 시 대비)
  useEffect(() => {
    if (connections.length === 0) {
      connectionsApi.list().then(setConnections).catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (!projectId || !jobId) return
    jobsApi.get(projectId, jobId).then(job => {
      setJobName(job.name)
      setJobStatus(job.status)
      try {
        const ir: JobIR = JSON.parse(job.irJson)
        if (ir.nodes?.length > 0) {
          const { nodes: n, edges: e } = irToFlow(ir)
          setNodes(n)
          setEdges(e)
        }
      } catch {}
    }).catch(() => navigate(`/projects/${projectId}`))
    .finally(() => setLoading(false))
  }, [projectId, jobId])

  const onConnect = useCallback((params: FlowConnection) => {
    setEdges(eds => addEdge({
      ...params,
      animated: false,
      style: { stroke: '#58a6ff', strokeWidth: 2 },
    }, eds))
  }, [setEdges])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
  }, [])

  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    const d = node.data as EtlNodeData
    if (d.componentType === 'T_MAP') {
      setMappingTarget({ nodeId: node.id, nodeLabel: d.label })
    }
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!dragType || !reactFlowWrapper.current || !rfInstance) return

    const bounds = reactFlowWrapper.current.getBoundingClientRect()
    const position = rfInstance.screenToFlowPosition({
      x: e.clientX - bounds.left,
      y: e.clientY - bounds.top,
    })

    const newNode: Node = {
      id: `${dragType.type}-${Date.now()}`,
      type: 'etlNode',
      position,
      data: {
        label: dragType.label,
        componentType: dragType.type,
        config: {},
        status: 'idle',
      } as EtlNodeData,
    }
    setNodes(ns => [...ns, newNode])
    setDragType(null)
  }, [dragType, rfInstance, setNodes])

  const handleUpdateNode = useCallback((nodeId: string, patch: Partial<EtlNodeData>) => {
    setNodes(ns => ns.map(n => {
      if (n.id !== nodeId) return n
      return { ...n, data: { ...(n.data as EtlNodeData), ...patch } }
    }))
    setSelectedNode(prev => {
      if (!prev || prev.id !== nodeId) return prev
      return { ...prev, data: { ...(prev.data as EtlNodeData), ...patch } }
    })
  }, [setNodes])

  const handleApplyAiGraph = useCallback((spec: AiGraphSpec) => {
    if (!rfInstance) return
    const center = rfInstance.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    })
    const ts = Date.now()
    const newNodes: Node[] = spec.nodes.map((n, i) => ({
      id: `${n.type}-ai-${ts}-${i}`,
      type: 'etlNode',
      position: { x: center.x + i * 220 - ((spec.nodes.length - 1) * 110), y: center.y },
      data: {
        label: n.label,
        componentType: n.type as ComponentType,
        config: n.config ?? {},
        status: 'idle',
      } as EtlNodeData,
    }))
    const newEdges: Edge[] = spec.edges.map((e, i) => ({
      id: `ai-edge-${ts}-${i}`,
      source: newNodes[e.source]?.id ?? '',
      target: newNodes[e.target]?.id ?? '',
      animated: false,
      style: { stroke: '#58a6ff', strokeWidth: 2 },
    })).filter(e => e.source && e.target)

    // T_MAP 노드에 자동 매핑 적용
    const finalNodes = newNodes.map(node => {
      const data = node.data as EtlNodeData
      if (data.componentType !== 'T_MAP') return node

      // 이 T_MAP 노드로 들어오는 엣지의 소스 노드 수집
      const inputCols: { nodeId: string; cols: ColumnInfo[] }[] = newEdges
        .filter(e => e.target === node.id)
        .map(e => {
          const srcNode = newNodes.find(n => n.id === e.source)
          if (!srcNode) return null
          const srcData = srcNode.data as EtlNodeData
          const cols = Array.isArray(srcData.config.columns)
            ? (srcData.config.columns as ColumnInfo[])
            : []
          return { nodeId: srcNode.id, cols }
        })
        .filter(Boolean) as { nodeId: string; cols: ColumnInfo[] }[]

      const mappings = inputCols.flatMap(({ nodeId, cols }) =>
        buildAutoMappings(nodeId, cols)
      )

      if (!mappings.length) return node
      return { ...node, data: { ...data, config: { ...data.config, mappings } } }
    })

    setNodes(ns => [...ns, ...finalNodes])
    setEdges(es => [...es, ...newEdges])
  }, [rfInstance, setNodes, setEdges])

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes(ns => ns.filter(n => n.id !== nodeId))
    setEdges(es => es.filter(e => e.source !== nodeId && e.target !== nodeId))
    setSelectedNode(null)
  }, [setNodes, setEdges])

  const handlePatchNodes = useCallback((patches: AiPatchSpec['patches']) => {
    setNodes(ns => ns.map(n => {
      const patch = patches.find(p => p.nodeId === n.id)
      if (!patch) return n
      const d = n.data as EtlNodeData
      return {
        ...n,
        data: {
          ...d,
          ...(patch.label ? { label: patch.label } : {}),
          config: patch.config ? { ...d.config, ...patch.config } : d.config,
        },
      }
    }))
  }, [setNodes])

  const handleSchemaResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    schemaResizingRef.current = true
    schemaResizeStartY.current = e.clientY
    schemaResizeStartH.current = schemaHeight

    const onMove = (ev: MouseEvent) => {
      if (!schemaResizingRef.current) return
      const delta = schemaResizeStartY.current - ev.clientY
      const next = Math.min(600, Math.max(80, schemaResizeStartH.current + delta))
      setSchemaHeight(next)
    }
    const onUp = () => {
      schemaResizingRef.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [schemaHeight])

  const handleSave = async () => {
    if (!projectId || !jobId) return
    setSaving(true)
    try {
      const ir = flowToIR(jobId, nodes, edges)
      const updated = await jobsApi.update(projectId, jobId, { irJson: JSON.stringify(ir) })
      upsertJob(projectId, updated)
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async () => {
    if (!projectId || !jobId) return
    setSaving(true)
    try {
      const updated = await jobsApi.publish(projectId, jobId)
      upsertJob(projectId, updated)
      setJobStatus('PUBLISHED')
    } finally {
      setSaving(false)
    }
  }

  const handleRun = async () => {
    if (!jobId) return
    setRunning(true)
    setBottomPanel('logs')
    setExecutionResult(null)

    setNodes(ns => ns.map(n => ({
      ...n,
      data: { ...(n.data as EtlNodeData), status: 'running' },
    })))
    // 실행 시작: 엣지 초기화 + animated
    setEdges(es => es.map(e => ({
      ...e,
      label: undefined,
      animated: true,
      style: { stroke: '#58a6ff', strokeWidth: 2 },
    })))

    try {
      const ir = flowToIR(jobId, nodes, edges)
      await jobsApi.update(projectId!, jobId, { irJson: JSON.stringify(ir) })

      const result = await executionApi.run(jobId, {}, previewMode)
      setExecutionResult(result)
      useAppStore.getState().setLastExecution(result)

      setNodes(ns => ns.map(n => {
        const nr = result.nodeResults[n.id]
        const status = nr
          ? (nr.status === 'SUCCESS' ? 'success' : nr.status === 'FAILED' ? 'failed' : 'idle')
          : (result.status === 'SUCCESS' ? 'success' : 'idle')
        return {
          ...n,
          data: {
            ...(n.data as EtlNodeData),
            status,
            rowsProcessed: nr?.rowsProcessed,
            durationMs: nr?.durationMs,
          },
        }
      }))

      // 완료: 엣지에 rows + 색상 표기
      setEdges(es => es.map(e => {
        const nr = result.nodeResults[e.source]
        if (nr?.rowsProcessed !== undefined) {
          const isZero = nr.rowsProcessed === 0
          const jobFailed = result.status === 'FAILED'
          const isError = isZero && jobFailed
          const color = isError ? '#f85149' : '#3fb950'
          const rowLabel = isZero
            ? `0 rows${isError ? ' (error)' : ''}`
            : `${nr.rowsProcessed.toLocaleString()} rows${nr.durationMs ? ` in ${nr.durationMs}ms` : ''}`
          return {
            ...e,
            animated: false,
            style: { stroke: color, strokeWidth: 2 },
            label: rowLabel,
            labelStyle: { fill: color, fontSize: 10, fontFamily: 'monospace' },
            labelBgStyle: { fill: '#0d1117', fillOpacity: 0.9 },
            labelBgPadding: [4, 2] as [number, number],
            labelBgBorderRadius: 3,
          }
        }
        // nodeResult 없으면 전체 결과 기반 색상만
        const color = result.status === 'SUCCESS' ? '#3fb950' : '#f85149'
        return { ...e, animated: false, style: { stroke: color, strokeWidth: 2 } }
      }))
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Execution failed'
      setExecutionResult({
        executionId: 'error',
        jobId: jobId,
        status: 'FAILED',
        startedAt: new Date().toISOString(),
        nodeResults: {},
        errorMessage: errMsg,
        logs: [errMsg],
      })
      setNodes(ns => ns.map(n => ({
        ...n,
        data: { ...(n.data as EtlNodeData), status: 'failed', rowsProcessed: undefined, durationMs: undefined },
      })))
      setEdges(es => es.map(e => ({
        ...e,
        animated: false,
        style: { stroke: '#f85149', strokeWidth: 2 },
      })))
    } finally {
      setRunning(false)
    }
  }

  const sqlPreview = useMemo(() => {
    if (nodes.length === 0) {
      return '-- Add nodes to the canvas to see generated SQL\n-- Visual DAG → IR → SQL Compiler → Target DB'
    }
    const lines = ['-- Auto-generated SQL (SQL Pushdown Mode)', '-- Visual DAG → IR → SQL Compiler → Target DB', '']
    nodes.forEach(n => {
      const d = n.data as EtlNodeData
      if (d.componentType === 'T_JDBC_INPUT') {
        if (d.config?.query) {
          lines.push(`-- [${d.label}]`, d.config.query as string, '')
        } else if (d.config?.tableName) {
          const cols = d.config.columns as ColumnInfo[] | undefined
          const colPart = cols && cols.length > 0
            ? cols.map(c => `  ${c.columnName}`).join(',\n')
            : '  *'
          lines.push(`-- [${d.label}]`, `SELECT\n${colPart}\nFROM ${d.config.tableName}`, '')
        }
      } else if (d.componentType === 'T_JDBC_OUTPUT' && d.config?.tableName) {
        const cols = d.config.columns as ColumnInfo[] | undefined
        const colList = cols && cols.length > 0 ? ` (${cols.map(c => c.columnName).join(', ')})` : ''
        lines.push(`-- [${d.label}] → INSERT INTO ${d.config.tableName}${colList}`, `-- Write Mode: ${d.config?.writeMode ?? 'INSERT'}`, '')
      } else if (d.componentType === 'T_FILTER_ROW' && d.config?.condition) {
        lines.push(`-- [${d.label}] WHERE ${d.config.condition}`, '')
      } else if (d.componentType === 'T_AGGREGATE_ROW') {
        lines.push(`-- [${d.label}] GROUP BY ${d.config?.groupBy ?? '...'}`, '')
      }
    })
    return lines.join('\n')
  }, [nodes])

  const jobSummary = useMemo(() => {
    const byType = nodes.reduce<Record<string, string[]>>((acc, n) => {
      const d = n.data as EtlNodeData
      const t = d.componentType
      acc[t] = acc[t] ?? []
      acc[t].push(d.label)
      return acc
    }, {})

    const inputNodes  = nodes.filter(n => (n.data as EtlNodeData).componentType.includes('INPUT'))
    const outputNodes = nodes.filter(n => (n.data as EtlNodeData).componentType.includes('OUTPUT'))
    const xformNodes  = nodes.filter(n => {
      const t = (n.data as EtlNodeData).componentType
      return !t.includes('INPUT') && !t.includes('OUTPUT') &&
             !['T_PRE_JOB','T_POST_JOB','T_RUN_JOB','T_SLEEP'].includes(t)
    })

    const usedConnections = new Map<string, string>()
    nodes.forEach(n => {
      const d = n.data as EtlNodeData
      const cid = d.config?.connectionId as string | undefined
      const tbl = d.config?.tableName as string | undefined
      if (cid) usedConnections.set(cid, tbl ?? '(미설정)')
    })

    return { byType, inputNodes, outputNodes, xformNodes, usedConnections, total: nodes.length, edgeCount: edges.length }
  }, [nodes, edges])

  if (loading) return (
    <div className="flex items-center justify-center h-full"><Spinner size="lg" /></div>
  )

  return (
    <div className="flex flex-col h-screen bg-[#0d1117]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-[#161b27] border-b border-[#21262d] flex-shrink-0">
        <button onClick={() => navigate(`/projects/${projectId}`)}
          className="text-[#8b949e] hover:text-[#e6edf3] transition-colors p-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="h-4 w-px bg-[#30363d]" />
        <input
          value={jobName}
          onChange={e => setJobName(e.target.value)}
          onBlur={() => { if (projectId && jobId) jobsApi.update(projectId, jobId, { name: jobName }) }}
          className="bg-transparent text-sm font-semibold text-[#e6edf3] focus:outline-none
            border-b border-transparent focus:border-[#58a6ff] min-w-0 max-w-[200px]"
        />
        <Badge variant={jobStatus === 'PUBLISHED' ? 'success' : 'default'}>{jobStatus}</Badge>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#252d3d] border border-[#30363d]">
            <input type="checkbox" id="preview" checked={previewMode}
              onChange={e => setPreviewMode(e.target.checked)}
              className="w-3 h-3 accent-[#58a6ff]" />
            <label htmlFor="preview" className="text-xs text-[#8b949e] cursor-pointer select-none">
              Preview Mode
            </label>
          </div>

          <Button variant={bottomPanel === 'sql' ? 'success' : 'ghost'} size="sm"
            onClick={() => setBottomPanel(p => p === 'sql' ? null : 'sql')}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            SQL
          </Button>
          <Button variant={bottomPanel === 'logs' ? 'secondary' : 'ghost'} size="sm"
            onClick={() => setBottomPanel(p => p === 'logs' ? null : 'logs')}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Logs
          </Button>
          <Button variant={bottomPanel === 'summary' ? 'secondary' : 'ghost'} size="sm"
            onClick={() => setBottomPanel(p => p === 'summary' ? null : 'summary')}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Summary
          </Button>

          <div className="h-4 w-px bg-[#30363d]" />

          <Button variant="secondary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Spinner size="sm" /> : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
            )}
            Save
          </Button>
          <Button variant="secondary" size="sm" onClick={handlePublish}
            disabled={saving || jobStatus === 'PUBLISHED'}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Publish
          </Button>
          <Button variant="primary" size="sm" onClick={handleRun} disabled={running}>
            {running ? <Spinner size="sm" /> : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {running ? 'Running...' : 'Run'}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        <ComponentPalette onDragStart={(type, label) => setDragType({ type, label })} />

        <div className="flex flex-col flex-1 min-w-0">
          {/* Canvas */}
          <div ref={reactFlowWrapper} className="flex-1 min-h-0 relative"
            onDragOver={onDragOver} onDrop={onDrop}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onNodeDoubleClick={onNodeDoubleClick}
              onPaneClick={onPaneClick}
              onInit={setRfInstance}
              nodeTypes={nodeTypes}
              fitView
              deleteKeyCode={['Delete', 'Backspace']}
              style={{ background: '#0d1117' }}
              defaultEdgeOptions={{ style: { stroke: '#58a6ff', strokeWidth: 2 } }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#21262d" />
              <Controls />
              <MiniMap
                nodeColor={n => {
                  const t = (n.data as EtlNodeData).componentType ?? ''
                  if (t.endsWith('_INPUT')) return '#3fb950'
                  if (t.endsWith('_OUTPUT')) return '#f0883e'
                  if (['T_PRE_JOB','T_POST_JOB','T_RUN_JOB','T_SLEEP'].includes(t)) return '#bc8cff'
                  return '#58a6ff'
                }}
                maskColor="rgba(13,17,23,0.8)"
              />
            </ReactFlow>

            {nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-[#161b27] border border-[#30363d]
                    flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-[#484f58]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                        d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-[#484f58]">Drag components from the palette</p>
                  <p className="text-xs text-[#30363d] mt-1">Connect nodes to build your ETL pipeline</p>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Panel */}
          {bottomPanel && (
            <div className="h-[240px] flex-shrink-0 bg-[#161b27] border-t border-[#21262d] flex flex-col">
              <div className="flex items-center gap-1 px-4 border-b border-[#21262d] flex-shrink-0">
                <button onClick={() => setBottomPanel('sql')}
                  className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors
                    ${bottomPanel === 'sql'
                      ? 'border-[#3fb950] text-[#3fb950]'
                      : 'border-transparent text-[#8b949e] hover:text-[#e6edf3]'}`}>
                  SQL View
                </button>
                <button onClick={() => setBottomPanel('logs')}
                  className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors
                    ${bottomPanel === 'logs'
                      ? 'border-[#58a6ff] text-[#58a6ff]'
                      : 'border-transparent text-[#8b949e] hover:text-[#e6edf3]'}`}>
                  Execution Logs
                  {executionResult && (
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]
                      ${executionResult.status === 'SUCCESS' ? 'bg-[#0f2d1a] text-[#3fb950]'
                        : executionResult.status === 'FAILED' ? 'bg-[#2d0f0f] text-[#f85149]'
                        : 'bg-[#252d3d] text-[#8b949e]'}`}>
                      {executionResult.status}
                    </span>
                  )}
                </button>
                <button onClick={() => setBottomPanel('summary')}
                  className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors
                    ${bottomPanel === 'summary'
                      ? 'border-[#bc8cff] text-[#bc8cff]'
                      : 'border-transparent text-[#8b949e] hover:text-[#e6edf3]'}`}>
                  Job Summary
                </button>
                <button onClick={() => setBottomPanel(null)}
                  className="ml-auto text-[#484f58] hover:text-[#8b949e] p-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {bottomPanel === 'sql' && (
                <div className="flex-1 overflow-hidden">
                  <Editor
                    height="100%"
                    language="sql"
                    value={sqlPreview}
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 12,
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      wordWrap: 'on',
                      padding: { top: 8 },
                    }}
                  />
                </div>
              )}

              {bottomPanel === 'summary' && (
                <div className="flex-1 overflow-y-auto p-4">
                  {nodes.length === 0 ? (
                    <p className="text-xs text-[#484f58]">캔버스에 노드가 없습니다.</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-3 h-full">
                      {/* 통계 카드 */}
                      <div className="col-span-4 grid grid-cols-4 gap-2">
                        {[
                          { label: '전체 노드', value: jobSummary.total, color: '#8b949e' },
                          { label: 'Input', value: jobSummary.inputNodes.length, color: '#3fb950' },
                          { label: 'Transform', value: jobSummary.xformNodes.length, color: '#58a6ff' },
                          { label: 'Output', value: jobSummary.outputNodes.length, color: '#f0883e' },
                        ].map(s => (
                          <div key={s.label} className="px-3 py-2 rounded-lg bg-[#0d1117] border border-[#21262d] flex items-center gap-2">
                            <span className="text-lg font-bold" style={{ color: s.color }}>{s.value}</span>
                            <span className="text-[10px] text-[#484f58]">{s.label}</span>
                          </div>
                        ))}
                      </div>

                      {/* 데이터 흐름 */}
                      <div className="col-span-2 bg-[#0d1117] border border-[#21262d] rounded-lg p-3 overflow-y-auto">
                        <p className="text-[10px] font-semibold text-[#484f58] uppercase tracking-wider mb-2">데이터 흐름</p>
                        <div className="flex flex-wrap items-center gap-1">
                          {jobSummary.inputNodes.map(n => (
                            <span key={n.id} className="px-2 py-0.5 rounded text-[10px] bg-[#0f2d1a] text-[#3fb950] border border-[#1a4731]">
                              {(n.data as EtlNodeData).label}
                            </span>
                          ))}
                          {jobSummary.inputNodes.length > 0 && jobSummary.xformNodes.length > 0 && (
                            <span className="text-[#30363d] text-xs">→</span>
                          )}
                          {jobSummary.xformNodes.map(n => (
                            <span key={n.id} className="px-2 py-0.5 rounded text-[10px] bg-[#0d1f35] text-[#58a6ff] border border-[#1a3050]">
                              {(n.data as EtlNodeData).label}
                            </span>
                          ))}
                          {jobSummary.outputNodes.length > 0 && (
                            <span className="text-[#30363d] text-xs">→</span>
                          )}
                          {jobSummary.outputNodes.map(n => (
                            <span key={n.id} className="px-2 py-0.5 rounded text-[10px] bg-[#2d1a07] text-[#f0883e] border border-[#3d2c0a]">
                              {(n.data as EtlNodeData).label}
                            </span>
                          ))}
                        </div>
                        <p className="text-[9px] text-[#484f58] mt-2">엣지: {jobSummary.edgeCount}개 연결</p>
                      </div>

                      {/* 컴포넌트 목록 */}
                      <div className="col-span-2 bg-[#0d1117] border border-[#21262d] rounded-lg p-3 overflow-y-auto">
                        <p className="text-[10px] font-semibold text-[#484f58] uppercase tracking-wider mb-2">컴포넌트 구성</p>
                        <div className="space-y-1">
                          {Object.entries(jobSummary.byType).map(([type, labels]) => (
                            <div key={type} className="flex items-center gap-2">
                              <span className="text-[9px] font-mono text-[#bc8cff] w-32 truncate flex-shrink-0">{type.replace('T_','')}</span>
                              <span className="text-[9px] text-[#8b949e]">× {labels.length}</span>
                              <span className="text-[9px] text-[#484f58] truncate">{labels.join(', ')}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {bottomPanel === 'logs' && (
                <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
                  {running && (
                    <div className="flex items-center gap-2 text-[#58a6ff] mb-2">
                      <Spinner size="sm" />
                      <span>Executing pipeline...</span>
                    </div>
                  )}
                  {!running && !executionResult && (
                    <p className="text-[#484f58]">No execution yet. Click Run to execute the pipeline.</p>
                  )}
                  {executionResult && (
                    <div className="space-y-1">
                      <p className={`font-medium ${
                        executionResult.status === 'SUCCESS' ? 'text-[#3fb950]'
                        : executionResult.status === 'FAILED' ? 'text-[#f85149]'
                        : 'text-[#8b949e]'}`}>
                        ── Execution {executionResult.status} ──
                        {executionResult.durationMs ? ` (${executionResult.durationMs}ms)` : ''}
                      </p>
                      {executionResult.logs.map((log, i) => (
                        <p key={i} className="text-[#8b949e] leading-relaxed">{log}</p>
                      ))}
                      {executionResult.errorMessage && (
                        <p className="text-[#f85149]">✗ {executionResult.errorMessage}</p>
                      )}
                      {Object.entries(executionResult.nodeResults).map(([id, r]) => (
                        <p key={id} className={r.status === 'SUCCESS' ? 'text-[#3fb950]' : 'text-[#f85149]'}>
                          {r.status === 'SUCCESS' ? '✓' : '✗'} [{r.nodeType}] {r.rowsProcessed} rows
                          {r.durationMs ? ` in ${r.durationMs}ms` : ''}
                          {r.errorMessage ? ` — ${r.errorMessage}` : ''}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* AI Agent Panel - 슬라이드 애니메이션 */}
        <div className={`flex-shrink-0 h-full overflow-hidden transition-all duration-300 ease-in-out
          ${aiPanelOpen ? 'w-[320px]' : 'w-0'}`}>
          <AiAgentPanel
            onApplyGraph={handleApplyAiGraph}
            onPatchNodes={handlePatchNodes}
            connections={connections}
            executionResult={executionResult}
            nodes={nodes}
            edges={edges}
          />
        </div>

        {/* Right Panel: Properties + Schema Tree */}
        <div className="w-[300px] flex-shrink-0 flex flex-col border-l border-[#21262d] bg-[#161b27] relative">
          {/* AI 패널 토글 탭 버튼 */}
          <button
            onClick={() => setAiPanelOpen(p => !p)}
            title={aiPanelOpen ? 'AI Agent 닫기' : 'AI Agent 열기'}
            className={`absolute z-10 top-[38%] -translate-y-1/2
              flex items-center justify-center
              rounded-l-xl border border-r-0 transition-all duration-300 ease-in-out shadow-lg
              ${aiPanelOpen
                ? '-left-3 w-3 h-16 bg-[#1a1f6e] border-[#3040cc] hover:bg-[#252d8e]'
                : '-left-6 w-6 h-20 bg-[#1f1035] border-[#3d2060] text-[#bc8cff] hover:bg-[#2a1550] hover:border-[#6e40c9] hover:shadow-[0_0_12px_rgba(188,140,255,0.3)]'
              }`}>
            {!aiPanelOpen && <img src="/ai.png" alt="AI Agent" className="w-8 h-8 object-contain" />}
          </button>
          {/* Properties Section */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {selectedNode ? (
              <PropertiesPanel
                node={selectedNode}
                onUpdate={(id, patch) => handleUpdateNode(id, patch as Partial<EtlNodeData>)}
                onDelete={handleDeleteNode}
              />
            ) : (
              <div className="flex flex-col items-center justify-center flex-1">
                <div className="text-center px-6">
                  <div className="w-10 h-10 rounded-lg bg-[#252d3d] flex items-center justify-center mx-auto mb-3">
                    <svg className="w-5 h-5 text-[#484f58]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
                    </svg>
                  </div>
                  <p className="text-xs text-[#484f58]">노드를 클릭하여 설정</p>
                  <p className="text-[10px] text-[#30363d] mt-1">T_MAP은 더블클릭 시<br/>매핑 에디터가 열립니다</p>
                </div>
              </div>
            )}
          </div>

          {/* Schema Tree Section */}
          <div
            className="flex-shrink-0 border-t border-[#21262d] flex flex-col"
            style={{ height: schemaTreeCollapsed ? 32 : schemaHeight }}
          >
            {/* Resize Handle */}
            {!schemaTreeCollapsed && (
              <div
                onMouseDown={handleSchemaResizeStart}
                className="h-1.5 flex-shrink-0 cursor-ns-resize group flex items-center justify-center"
              >
                <div className="w-8 h-0.5 rounded-full bg-[#30363d] group-hover:bg-[#58a6ff] transition-colors" />
              </div>
            )}
            <button
              onClick={() => setSchemaTreeCollapsed(c => !c)}
              className="flex items-center justify-between px-3 py-2 hover:bg-[#252d3d] transition-colors flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <svg className="w-3 h-3 text-[#484f58]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
                <span className="text-xs font-semibold text-[#8b949e]">Schema Browser</span>
              </div>
              <svg className={`w-3 h-3 text-[#484f58] transition-transform ${schemaTreeCollapsed ? '-rotate-90' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {!schemaTreeCollapsed && (
              <div className="flex-1 overflow-y-auto">
                <SchemaTree nodes={nodes} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mapping Editor Modal */}
      {mappingTarget && (
        <MappingEditorModal
          nodeId={mappingTarget.nodeId}
          nodeLabel={mappingTarget.nodeLabel}
          nodes={nodes}
          edges={edges}
          currentMappings={(() => {
            const node = nodes.find(n => n.id === mappingTarget.nodeId)
            const d = node?.data as EtlNodeData | undefined
            const raw = d?.config?.mappings
            if (Array.isArray(raw)) return raw as never[]
            if (typeof raw === 'string') {
              try { return JSON.parse(raw) } catch { return [] }
            }
            return []
          })()}
          onApply={(mappings) => {
            handleUpdateNode(mappingTarget.nodeId, {
              config: {
                ...((nodes.find(n => n.id === mappingTarget.nodeId)?.data as EtlNodeData)?.config ?? {}),
                mappings,
              }
            })
          }}
          onClose={() => setMappingTarget(null)}
        />
      )}
    </div>
  )
}
