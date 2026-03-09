import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  type Node,
  type Edge,
  type Connection as FlowConnection,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { jobsApi, executionApi, connectionsApi } from "../api";
import { useAppStore } from "../stores";
import { Badge, Button, Spinner } from "../components/ui";
import ComponentPalette from "../components/job/ComponentPalette";
import PropertiesPanel from "../components/job/PropertiesPanel";
import MappingEditorModal from "../components/job/MappingEditorModal";
import SchemaTree from "../components/job/SchemaTree";
import AiAgentPanel from "../components/job/AiAgentPanel";
import { nodeTypes } from "../components/job/CustomNodes";
import type {
  ComponentType,
  TriggerCondition,
  JobIR,
  ExecutionResult,
  ColumnInfo,
} from "../types";
import type { AiGraphSpec, AiPatchSpec } from "../api/ai";
import { buildAutoMappings } from "../utils/mapping";
import Editor from "@monaco-editor/react";

type BottomPanel = "sql" | "logs" | "rowlogs" | "summary" | null;

type EtlNodeData = {
  label: string;
  componentType: ComponentType;
  config: Record<string, unknown>;
  status?: "idle" | "running" | "success" | "failed";
  [key: string]: unknown;
};

function irToFlow(ir: JobIR): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = ir.nodes.map((n) => ({
    id: n.id,
    type: "etlNode",
    position: n.position,
    data: {
      label: n.label,
      componentType: n.type,
      config: n.config,
      status: "idle",
    } as EtlNodeData,
  }));
  const edges: Edge[] = ir.edges.map((e) => {
    const isTrigger = e.linkType === "TRIGGER";
    const isOnError = e.triggerCondition === "ON_ERROR";
    const style = isTrigger
      ? {
          stroke: isOnError ? "#dc2626" : "#16a34a",
          strokeWidth: 2,
          strokeDasharray: "6 3",
        }
      : { stroke: "#2563eb", strokeWidth: 2 };
    const label = isTrigger ? (isOnError ? "err" : "ok") : undefined;
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      animated: false,
      style,
      ...(label
        ? {
            label,
            labelStyle: {
              fill: isOnError ? "#dc2626" : "#16a34a",
              fontSize: 9,
              fontWeight: "bold",
            },
            labelBgStyle: { fill: "#ffffff", fillOpacity: 0.9 },
            labelBgPadding: [3, 1] as [number, number],
            labelBgBorderRadius: 2,
          }
        : {}),
      data: { linkType: e.linkType, triggerCondition: e.triggerCondition },
    };
  });
  return { nodes, edges };
}

function flowToIR(
  jobId: string,
  nodes: Node[],
  edges: Edge[],
  context: Record<string, string> = {},
): JobIR {
  return {
    id: jobId,
    version: "0.1",
    engineType: "SQL_PUSHDOWN",
    nodes: nodes.map((n) => {
      const d = n.data as EtlNodeData;
      return {
        id: n.id,
        type: d.componentType,
        label: d.label,
        position: n.position,
        config: d.config ?? {},
        inputPorts: [],
        outputPorts: [],
      };
    }),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      sourcePort: "out",
      target: e.target,
      targetPort: "in",
      linkType: ((e.data as Record<string, unknown>)?.linkType ?? "ROW") as
        | "ROW"
        | "TRIGGER"
        | "REJECT"
        | "LOOKUP",
      triggerCondition: ((e.data as Record<string, unknown>)
        ?.triggerCondition ?? undefined) as TriggerCondition | undefined,
    })),
    context,
  };
}

// ── 컨텍스트 변수 패널 ──────────────────────────────────────────
interface CtxVar {
  key: string;
  value: string;
  saved?: boolean;
}

function ContextVarsPanel({
  vars,
  onChange,
  onClose,
}: {
  vars: CtxVar[];
  onChange: (v: CtxVar[]) => void;
  onClose: () => void;
}) {
  const update = (i: number, field: "key" | "value", val: string) =>
    onChange(vars.map((v, idx) => (idx === i ? { ...v, [field]: val } : v)));

  const save = (i: number) => {
    if (!vars[i].key.trim()) return;
    onChange(vars.map((v, idx) => (idx === i ? { ...v, saved: true } : v)));
  };

  const edit = (i: number) =>
    onChange(vars.map((v, idx) => (idx === i ? { ...v, saved: false } : v)));

  const remove = (i: number) => onChange(vars.filter((_, idx) => idx !== i));
  const add = () => onChange([...vars, { key: "", value: "", saved: false }]);

  return (
    <div
      className="w-[30rem] rounded-lg shadow-xl"
      style={{ border: "1px solid #e2e8f0", background: "#ffffff" }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 rounded-t-lg"
        style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}
      >
        <div className="flex items-center gap-1.5">
          <svg
            className="w-3.5 h-3.5 text-[#ef4444]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
            />
          </svg>
          <span className="text-xs font-semibold text-[#0f172a]">
            컨텍스트 변수
          </span>
          <span className="text-[9px] text-[#94a3b8]">
            context.변수명 으로 참조
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-[#94a3b8] hover:text-[#64748b] text-xs"
        >
          ✕
        </button>
      </div>

      <div className="px-2 py-2 space-y-1.5 max-h-72 overflow-y-auto">
        {vars.length === 0 && (
          <p className="text-[10px] text-[#94a3b8] text-center py-4">
            변수가 없습니다. 아래 추가 버튼을 클릭하세요.
          </p>
        )}
        {vars.map((v, i) =>
          v.saved ? (
            /* 저장된 행: 읽기 전용 표시 + 편집/삭제 버튼 */
            <div
              key={i}
              className="flex items-center gap-2 px-2 py-1.5 rounded group"
              style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}
            >
              <span className="font-mono text-[11px] text-[#ef4444] truncate">
                context.
              </span>
              <span className="font-mono text-[11px] text-[#0f172a] truncate flex-1">
                {v.key}
              </span>
              <span className="text-[#94a3b8] text-[10px] flex-shrink-0">
                =
              </span>
              <span className="font-mono text-[11px] text-[#16a34a] truncate flex-1">
                {v.value || (
                  <span className="text-[#94a3b8] italic">empty</span>
                )}
              </span>
              <button
                onClick={() => edit(i)}
                title="수정"
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded
                text-[#94a3b8] hover:text-[#2563eb] hover:bg-[#eff6ff] text-[10px] transition-colors opacity-0 group-hover:opacity-100"
              >
                ✎
              </button>
              <button
                onClick={() => remove(i)}
                title="삭제"
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded
                text-[#94a3b8] hover:text-[#dc2626] hover:bg-[#fef2f2] text-xs transition-colors"
              >
                ✕
              </button>
            </div>
          ) : (
            /* 편집 행: 입력 필드 + 저장 버튼 */
            <div key={i} className="flex items-center gap-2">
              <input
                value={v.key}
                onChange={(e) => update(i, "key", e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save(i)}
                placeholder="변수명 (batch_id)"
                autoFocus
                className="w-[44%] min-w-0 bg-[#f8fafc] border border-[#d1d5db] text-[#0f172a] rounded px-2 py-1.5
                text-[11px] placeholder-[#94a3b8] focus:outline-none focus:border-[#ef4444] font-mono"
              />
              <span className="text-[#94a3b8] text-[10px] flex-shrink-0">
                =
              </span>
              <input
                value={v.value}
                onChange={(e) => update(i, "value", e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save(i)}
                placeholder="값"
                className="w-[44%] min-w-0 bg-[#f8fafc] border border-[#d1d5db] text-[#0f172a] rounded px-2 py-1.5
                text-[11px] placeholder-[#94a3b8] focus:outline-none focus:border-[#ef4444] font-mono"
              />
              {v.key.trim() || v.value.trim() ? (
                <button
                  onClick={() => save(i)}
                  title="저장"
                  className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-xs font-bold
                  text-[#16a34a] hover:bg-[#f0fdf4] transition-colors"
                >
                  ✓
                </button>
              ) : (
                <button
                  onClick={() => remove(i)}
                  title="취소"
                  className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-xs
                  text-[#94a3b8] hover:text-[#dc2626] hover:bg-[#fef2f2] transition-colors"
                >
                  ✕
                </button>
              )}
            </div>
          ),
        )}
      </div>

      <div
        className="px-2 pb-2 pt-2"
        style={{ borderTop: "1px solid #e2e8f0" }}
      >
        <button
          onClick={add}
          className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded
            text-[10px] font-medium transition-colors"
          style={{
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            color: "#dc2626",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "#fee2e2";
            (e.currentTarget as HTMLElement).style.borderColor = "#dc2626";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "#fef2f2";
            (e.currentTarget as HTMLElement).style.borderColor = "#fca5a5";
          }}
        >
          + 변수 추가
        </button>
        <p className="mt-1.5 text-[9px] text-[#94a3b8] text-center">
          SQL/쿼리에서 <code className="text-[#7c3aed]">context.변수명</code>{" "}
          으로 참조
        </p>
      </div>
    </div>
  );
}

function buildCtxMap(contextVars: { key: string; value: string }[]): Record<string, string> {
  return Object.fromEntries(contextVars.filter((v) => v.key.trim()).map((v) => [v.key.trim(), v.value]));
}

export default function JobDesignerPage() {
  const { projectId, jobId } = useParams<{
    projectId: string;
    jobId: string;
  }>();
  const navigate = useNavigate();
  const { upsertJob, connections, setConnections } = useAppStore();

  const [jobName, setJobName] = useState("");
  const [jobStatus, setJobStatus] = useState<"DRAFT" | "PUBLISHED">("DRAFT");
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [running, setRunning] = useState(false);
  const [bottomPanel, setBottomPanel] = useState<BottomPanel>("sql");
  const [executionResult, setExecutionResult] =
    useState<ExecutionResult | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [dragType, setDragType] = useState<{
    type: ComponentType;
    label: string;
  } | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [mappingTarget, setMappingTarget] = useState<{
    nodeId: string;
    nodeLabel: string;
  } | null>(null);
  const [schemaTreeCollapsed, setSchemaTreeCollapsed] = useState(false);
  const [schemaHeight, setSchemaHeight] = useState(240);
  const schemaResizingRef = useRef(false);
  const schemaResizeStartY = useRef(0);
  const schemaResizeStartH = useRef(0);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [activeLogNodeId, setActiveLogNodeId] = useState<string | null>(null);
  const [contextVars, setContextVars] = useState<CtxVar[]>([]);
  const [showContextPanel, setShowContextPanel] = useState(false);
  const [contextPanelTop, setContextPanelTop] = useState(0);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [nodeContextMenu, setNodeContextMenu] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);
  const [pendingTrigger, setPendingTrigger] = useState<{
    sourceNodeId: string;
    condition: TriggerCondition;
  } | null>(null);

  // 패널 리사이즈 상태
  const [aiPanelWidth, setAiPanelWidth] = useState(320);
  const [rightPanelWidth, setRightPanelWidth] = useState(300);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(240);
  const [aiResizing, setAiResizing] = useState(false);

  const aiResizeStartX = useRef(0);
  const aiResizeStartW = useRef(0);
  const rightResizingRef = useRef(false);
  const rightResizeStartX = useRef(0);
  const rightResizeStartW = useRef(0);
  const bottomResizingRef = useRef(false);
  const bottomResizeStartY = useRef(0);
  const bottomResizeStartH = useRef(0);

  // 커넥션 목록이 없으면 직접 로드 (다른 페이지 거치지 않고 진입 시 대비)
  useEffect(() => {
    if (connections.length === 0) {
      connectionsApi
        .list()
        .then(setConnections)
        .catch(() => {});
    }
  }, []);

  // ESC: 우클릭 메뉴 + 트리거 대기 상태 해제
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setNodeContextMenu(null);
        setPendingTrigger(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!projectId || !jobId) return;
    jobsApi
      .get(projectId, jobId)
      .then((job) => {
        setJobName(job.name);
        setJobStatus(job.status);
        try {
          const ir: JobIR = JSON.parse(job.irJson);
          if (ir.nodes?.length > 0) {
            const { nodes: n, edges: e } = irToFlow(ir);
            setNodes(n);
            setEdges(e);
          }
          if (ir.context && Object.keys(ir.context).length > 0) {
            setContextVars(
              Object.entries(ir.context).map(([key, value]) => ({
                key,
                value,
                saved: true,
              })),
            );
          }
        } catch {}
      })
      .catch(() => navigate(`/projects/${projectId}`))
      .finally(() => setLoading(false));
  }, [projectId, jobId]);

  const onConnect = useCallback(
    (params: FlowConnection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: false,
            style: { stroke: "#2563eb", strokeWidth: 2 },
          },
          eds,
        ),
      );
    },
    [setEdges],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (pendingTrigger) {
        if (pendingTrigger.sourceNodeId !== node.id) {
          const cond = pendingTrigger.condition;
          const style =
            cond === "ON_OK"
              ? { stroke: "#16a34a", strokeWidth: 2, strokeDasharray: "6 3" }
              : { stroke: "#dc2626", strokeWidth: 2, strokeDasharray: "6 3" };
          setEdges((eds) => [
            ...eds,
            {
              id: `trigger-${pendingTrigger.sourceNodeId}-${node.id}-${Date.now()}`,
              source: pendingTrigger.sourceNodeId,
              target: node.id,
              animated: false,
              style,
              label: cond === "ON_OK" ? "ok" : "err",
              labelStyle: {
                fill: cond === "ON_OK" ? "#16a34a" : "#dc2626",
                fontSize: 9,
                fontWeight: "bold",
              },
              labelBgStyle: { fill: "#ffffff", fillOpacity: 0.9 },
              labelBgPadding: [3, 1] as [number, number],
              labelBgBorderRadius: 2,
              data: { linkType: "TRIGGER", triggerCondition: cond },
            },
          ]);
        }
        setPendingTrigger(null);
        return;
      }
      setNodeContextMenu(null);
      setSelectedNode(node);
    },
    [pendingTrigger, setEdges],
  );

  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    const d = node.data as EtlNodeData;
    if (d.componentType === "T_MAP") {
      setMappingTarget({ nodeId: node.id, nodeLabel: d.label });
    }
  }, []);

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    setNodeContextMenu({ nodeId: node.id, x: e.clientX, y: e.clientY });
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setNodeContextMenu(null);
    setPendingTrigger(null);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!dragType || !reactFlowWrapper.current || !rfInstance) return;

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = rfInstance.screenToFlowPosition({
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top,
      });

      const newNode: Node = {
        id: `${dragType.type}-${Date.now()}`,
        type: "etlNode",
        position,
        data: {
          label: dragType.label,
          componentType: dragType.type,
          config: {},
          status: "idle",
        } as EtlNodeData,
      };
      setNodes((ns) => [...ns, newNode]);
      setDragType(null);
    },
    [dragType, rfInstance, setNodes],
  );

  const handleUpdateNode = useCallback(
    (nodeId: string, patch: Partial<EtlNodeData>) => {
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== nodeId) return n;
          return { ...n, data: { ...(n.data as EtlNodeData), ...patch } };
        }),
      );
      setSelectedNode((prev) => {
        if (!prev || prev.id !== nodeId) return prev;
        return { ...prev, data: { ...(prev.data as EtlNodeData), ...patch } };
      });
    },
    [setNodes],
  );

  const handleApplyAiGraph = useCallback(
    (spec: AiGraphSpec) => {
      if (!rfInstance) return;
      const center = rfInstance.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      const ts = Date.now();
      const newNodes: Node[] = spec.nodes.map((n, i) => ({
        id: `${n.type}-ai-${ts}-${i}`,
        type: "etlNode",
        position: {
          x: center.x + i * 220 - (spec.nodes.length - 1) * 110,
          y: center.y,
        },
        data: {
          label: n.label,
          componentType: n.type as ComponentType,
          config: n.config ?? {},
          status: "idle",
        } as EtlNodeData,
      }));
      const newEdges: Edge[] = spec.edges
        .map((e, i) => ({
          id: `ai-edge-${ts}-${i}`,
          source: newNodes[e.source]?.id ?? "",
          target: newNodes[e.target]?.id ?? "",
          animated: false,
          style: { stroke: "#2563eb", strokeWidth: 2 },
        }))
        .filter((e) => e.source && e.target);

      // T_MAP 노드에 자동 매핑 적용
      const finalNodes = newNodes.map((node) => {
        const data = node.data as EtlNodeData;
        if (data.componentType !== "T_MAP") return node;

        // 이 T_MAP 노드로 들어오는 엣지의 소스 노드 수집
        const inputCols: { nodeId: string; cols: ColumnInfo[] }[] = newEdges
          .filter((e) => e.target === node.id)
          .map((e) => {
            const srcNode = newNodes.find((n) => n.id === e.source);
            if (!srcNode) return null;
            const srcData = srcNode.data as EtlNodeData;
            const cols = Array.isArray(srcData.config.columns)
              ? (srcData.config.columns as ColumnInfo[])
              : [];
            return { nodeId: srcNode.id, cols };
          })
          .filter(Boolean) as { nodeId: string; cols: ColumnInfo[] }[];

        const mappings = inputCols.flatMap(({ nodeId, cols }) =>
          buildAutoMappings(nodeId, cols),
        );

        if (!mappings.length) return node;
        return {
          ...node,
          data: { ...data, config: { ...data.config, mappings } },
        };
      });

      setNodes((ns) => [...ns, ...finalNodes]);
      setEdges((es) => [...es, ...newEdges]);
    },
    [rfInstance, setNodes, setEdges],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((ns) => ns.filter((n) => n.id !== nodeId));
      setEdges((es) =>
        es.filter((e) => e.source !== nodeId && e.target !== nodeId),
      );
      setSelectedNode(null);
    },
    [setNodes, setEdges],
  );

  const handlePatchNodes = useCallback(
    (patches: AiPatchSpec["patches"]) => {
      setNodes((ns) =>
        ns.map((n) => {
          const patch = patches.find((p) => p.nodeId === n.id);
          if (!patch) return n;
          const d = n.data as EtlNodeData;
          return {
            ...n,
            data: {
              ...d,
              ...(patch.label ? { label: patch.label } : {}),
              config: patch.config
                ? { ...d.config, ...patch.config }
                : d.config,
            },
          };
        }),
      );
    },
    [setNodes],
  );

  const handleSchemaResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      schemaResizingRef.current = true;
      schemaResizeStartY.current = e.clientY;
      schemaResizeStartH.current = schemaHeight;

      const onMove = (ev: MouseEvent) => {
        if (!schemaResizingRef.current) return;
        const delta = schemaResizeStartY.current - ev.clientY;
        const next = Math.min(
          600,
          Math.max(80, schemaResizeStartH.current + delta),
        );
        setSchemaHeight(next);
      };
      const onUp = () => {
        schemaResizingRef.current = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [schemaHeight],
  );

  const handleAiPanelResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setAiResizing(true);
      aiResizeStartX.current = e.clientX;
      aiResizeStartW.current = aiPanelWidth;
      const onMove = (ev: MouseEvent) => {
        const delta = aiResizeStartX.current - ev.clientX;
        setAiPanelWidth(
          Math.min(600, Math.max(200, aiResizeStartW.current + delta)),
        );
      };
      const onUp = () => {
        setAiResizing(false);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [aiPanelWidth],
  );

  const handleRightPanelResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      rightResizingRef.current = true;
      rightResizeStartX.current = e.clientX;
      rightResizeStartW.current = rightPanelWidth;
      const onMove = (ev: MouseEvent) => {
        if (!rightResizingRef.current) return;
        const delta = rightResizeStartX.current - ev.clientX;
        setRightPanelWidth(
          Math.min(600, Math.max(200, rightResizeStartW.current + delta)),
        );
      };
      const onUp = () => {
        rightResizingRef.current = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [rightPanelWidth],
  );

  const handleBottomPanelResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      bottomResizingRef.current = true;
      bottomResizeStartY.current = e.clientY;
      bottomResizeStartH.current = bottomPanelHeight;
      const onMove = (ev: MouseEvent) => {
        if (!bottomResizingRef.current) return;
        const delta = bottomResizeStartY.current - ev.clientY;
        setBottomPanelHeight(
          Math.min(600, Math.max(80, bottomResizeStartH.current + delta)),
        );
      };
      const onUp = () => {
        bottomResizingRef.current = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [bottomPanelHeight],
  );

  const handleSave = async () => {
    if (!projectId || !jobId) return;
    setSaving(true);
    try {
      const ctxMap = buildCtxMap(contextVars);
      const ir = flowToIR(jobId, nodes, edges, ctxMap);
      const updated = await jobsApi.update(projectId, jobId, { irJson: JSON.stringify(ir) });
      upsertJob(projectId, updated);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  // 자동저장: 로딩 완료 후 nodes/edges/contextVars 변경 시 2초 debounce
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (loading || !projectId || !jobId) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        const ctxMap = buildCtxMap(contextVars);
        const ir = flowToIR(jobId, nodes, edges, ctxMap);
        const updated = await jobsApi.update(projectId, jobId, { irJson: JSON.stringify(ir) });
        upsertJob(projectId, updated);
      } catch {}
    }, 2000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [nodes, edges, contextVars, projectId, jobId]);

  const handlePublish = async () => {
    if (!projectId || !jobId) return;
    setSaving(true);
    try {
      const updated = await jobsApi.publish(projectId, jobId);
      upsertJob(projectId, updated);
      setJobStatus("PUBLISHED");
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async () => {
    if (!jobId) return;
    setRunning(true);
    setBottomPanel("logs");
    setExecutionResult(null);

    setNodes((ns) =>
      ns.map((n) => ({
        ...n,
        data: { ...(n.data as EtlNodeData), status: "running" },
      })),
    );
    // 실행 시작: 엣지 초기화 + animated
    setEdges((es) =>
      es.map((e) => {
        const isTrigger =
          (e.data as Record<string, unknown>)?.linkType === "TRIGGER";
        const isOnError =
          (e.data as Record<string, unknown>)?.triggerCondition === "ON_ERROR";
        return {
          ...e,
          label: isTrigger ? (isOnError ? "err" : "ok") : undefined,
          animated: !isTrigger,
          style: isTrigger
            ? {
                stroke: isOnError ? "#dc2626" : "#16a34a",
                strokeWidth: 2,
                strokeDasharray: "6 3",
              }
            : { stroke: "#2563eb", strokeWidth: 2 },
        };
      }),
    );

    try {
      const ctxMap = buildCtxMap(contextVars);
      const ir = flowToIR(jobId, nodes, edges, ctxMap);
      await jobsApi.update(projectId!, jobId, { irJson: JSON.stringify(ir) });

      const result = await executionApi.run(jobId, ctxMap, previewMode);
      setExecutionResult(result);
      useAppStore.getState().setLastExecution(result);

      setNodes((ns) =>
        ns.map((n) => {
          const nr = result.nodeResults[n.id];
          const status = nr
            ? nr.status === "SUCCESS"
              ? "success"
              : nr.status === "FAILED"
                ? "failed"
                : "idle"
            : result.status === "SUCCESS"
              ? "success"
              : "idle";
          const isLogRow = (n.data as EtlNodeData)?.componentType === "T_LOG_ROW";
          return {
            ...n,
            data: {
              ...(n.data as EtlNodeData),
              status,
              rowsProcessed: isLogRow ? undefined : nr?.rowsProcessed,
              durationMs: isLogRow ? undefined : nr?.durationMs,
            },
          };
        }),
      );

      // 완료: 엣지에 rows + 색상 표기
      setEdges((es) =>
        es.map((e) => {
          const isTrigger =
            (e.data as Record<string, unknown>)?.linkType === "TRIGGER";
          const isOnError =
            (e.data as Record<string, unknown>)?.triggerCondition ===
            "ON_ERROR";
          if (isTrigger) {
            return {
              ...e,
              animated: false,
              style: {
                stroke: isOnError ? "#dc2626" : "#16a34a",
                strokeWidth: 2,
                strokeDasharray: "6 3",
              },
              label: isOnError ? "err" : "ok",
              labelStyle: {
                fill: isOnError ? "#dc2626" : "#16a34a",
                fontSize: 9,
                fontWeight: "bold",
              },
              labelBgStyle: { fill: "#ffffff", fillOpacity: 0.9 },
              labelBgPadding: [3, 1] as [number, number],
              labelBgBorderRadius: 2,
            };
          }
          let nr = result.nodeResults[e.source];
          const sourceNode = nodes.find((n) => n.id === e.source);
          const targetNode = nodes.find((n) => n.id === e.target);
          const targetType = (targetNode?.data as EtlNodeData)?.componentType;
          const sourceType = (sourceNode?.data as EtlNodeData)?.componentType;

          // T_JDBC_OUTPUT으로 들어오는 엣지: 실제 INSERT된 행 수 (output 노드 결과)
          if (targetType === "T_JDBC_OUTPUT") {
            nr = result.nodeResults[e.target] ?? nr;
          }
          // T_LOG_ROW는 pass-through — 샘플 개수 대신 upstream 노드의 rowsProcessed 사용
          else if (sourceType === "T_LOG_ROW") {
            const upstreamEdge = es.find((ed) => ed.target === e.source);
            if (upstreamEdge) nr = result.nodeResults[upstreamEdge.source] ?? nr;
          }
          if (nr?.rowsProcessed !== undefined && nr.rowsProcessed > 0) {
            const isZero = nr.rowsProcessed === 0;
            const jobFailed = result.status === "FAILED";
            const isError = isZero && jobFailed;
            const color = isError ? "#f85149" : "#3fb950";
            const rowLabel = isZero
              ? `0 rows${isError ? " (error)" : ""}`
              : `${nr.rowsProcessed.toLocaleString()} rows${nr.durationMs ? ` in ${nr.durationMs}ms` : ""}`;
            return {
              ...e,
              animated: false,
              style: { stroke: color, strokeWidth: 2 },
              label: rowLabel,
              labelStyle: {
                fill: color,
                fontSize: 10,
                fontFamily: "monospace",
              },
              labelBgStyle: { fill: "#ffffff", fillOpacity: 0.95 },
              labelBgPadding: [4, 2] as [number, number],
              labelBgBorderRadius: 3,
            };
          }
          // nodeResult 없으면 전체 결과 기반 색상만
          const color = result.status === "SUCCESS" ? "#3fb950" : "#f85149";
          return {
            ...e,
            animated: false,
            style: { stroke: color, strokeWidth: 2 },
          };
        }),
      );
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Execution failed";
      setExecutionResult({
        executionId: "error",
        jobId: jobId,
        status: "FAILED",
        startedAt: new Date().toISOString(),
        nodeResults: {},
        errorMessage: errMsg,
        logs: [errMsg],
      });
      setNodes((ns) =>
        ns.map((n) => ({
          ...n,
          data: {
            ...(n.data as EtlNodeData),
            status: "failed",
            rowsProcessed: undefined,
            durationMs: undefined,
          },
        })),
      );
      setEdges((es) =>
        es.map((e) => {
          const isTrigger =
            (e.data as Record<string, unknown>)?.linkType === "TRIGGER";
          const isOnError =
            (e.data as Record<string, unknown>)?.triggerCondition ===
            "ON_ERROR";
          return {
            ...e,
            animated: false,
            style: isTrigger
              ? {
                  stroke: isOnError ? "#dc2626" : "#16a34a",
                  strokeWidth: 2,
                  strokeDasharray: "6 3",
                }
              : { stroke: "#f85149", strokeWidth: 2 },
          };
        }),
      );
    } finally {
      setRunning(false);
    }
  };

  const sqlPreview = useMemo(() => {
    if (nodes.length === 0) {
      return "-- Add nodes to the canvas to see generated SQL\n-- Visual DAG → IR → SQL Compiler → Target DB";
    }
    const lines = [
      "-- Auto-generated SQL (SQL Pushdown Mode)",
      "-- Visual DAG → IR → SQL Compiler → Target DB",
      "",
    ];
    nodes.forEach((n) => {
      const d = n.data as EtlNodeData;
      if (d.componentType === "T_JDBC_INPUT") {
        if (d.config?.query) {
          lines.push(`-- [${d.label}]`, d.config.query as string, "");
        } else if (d.config?.tableName) {
          const cols = d.config.columns as ColumnInfo[] | undefined;
          const colPart =
            cols && cols.length > 0
              ? cols.map((c) => `  ${c.columnName}`).join(",\n")
              : "  *";
          lines.push(
            `-- [${d.label}]`,
            `SELECT\n${colPart}\nFROM ${d.config.tableName}`,
            "",
          );
        }
      } else if (d.componentType === "T_JDBC_OUTPUT" && d.config?.tableName) {
        const cols = d.config.columns as ColumnInfo[] | undefined;
        const colList =
          cols && cols.length > 0
            ? ` (${cols.map((c) => c.columnName).join(", ")})`
            : "";
        lines.push(
          `-- [${d.label}] → INSERT INTO ${d.config.tableName}${colList}`,
          `-- Write Mode: ${d.config?.writeMode ?? "INSERT"}`,
          "",
        );
      } else if (d.componentType === "T_FILTER_ROW" && d.config?.condition) {
        lines.push(`-- [${d.label}] WHERE ${d.config.condition}`, "");
      } else if (d.componentType === "T_AGGREGATE_ROW") {
        lines.push(
          `-- [${d.label}] GROUP BY ${d.config?.groupBy ?? "..."}`,
          "",
        );
      }
    });
    return lines.join("\n");
  }, [nodes]);

  const jobSummary = useMemo(() => {
    const byType = nodes.reduce<Record<string, string[]>>((acc, n) => {
      const d = n.data as EtlNodeData;
      const t = d.componentType;
      acc[t] = acc[t] ?? [];
      acc[t].push(d.label);
      return acc;
    }, {});

    const inputNodes = nodes.filter((n) =>
      (n.data as EtlNodeData).componentType.includes("INPUT"),
    );
    const outputNodes = nodes.filter((n) =>
      (n.data as EtlNodeData).componentType.includes("OUTPUT"),
    );
    const xformNodes = nodes.filter((n) => {
      const t = (n.data as EtlNodeData).componentType;
      return (
        !t.includes("INPUT") &&
        !t.includes("OUTPUT") &&
        !["T_PRE_JOB", "T_POST_JOB", "T_RUN_JOB", "T_SLEEP"].includes(t)
      );
    });

    const usedConnections = new Map<string, string>();
    nodes.forEach((n) => {
      const d = n.data as EtlNodeData;
      const cid = d.config?.connectionId as string | undefined;
      const tbl = d.config?.tableName as string | undefined;
      if (cid) usedConnections.set(cid, tbl ?? "(미설정)");
    });

    return {
      byType,
      inputNodes,
      outputNodes,
      xformNodes,
      usedConnections,
      total: nodes.length,
      edgeCount: edges.length,
    };
  }, [nodes, edges]);

  if (loading)
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );

  return (
    <div className="flex flex-col h-screen" style={{ background: "#f0f4f8" }}>
      {/* Toolbar */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0"
        style={{ background: "#232b37", borderBottom: "1px solid #232b37" }}
      >
        <button
          onClick={() => navigate(`/projects/${projectId}`)}
          className="text-[#94a3b8] hover:text-[#374151] transition-colors p-1"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <div className="h-4 w-px bg-[#e2e8f0]" />
        <input
          value={jobName}
          onChange={(e) => setJobName(e.target.value)}
          onBlur={() => {
            if (projectId && jobId)
              jobsApi.update(projectId, jobId, { name: jobName });
          }}
          className="bg-transparent text-sm font-semibold focus:outline-none
            border-b border-transparent focus:border-[#2563eb] min-w-0 max-w-[200px]"
          style={{ color: "#ffffff" }}
        />
        <Badge variant={jobStatus === "PUBLISHED" ? "success" : "default"}>
          {jobStatus}
        </Badge>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setPreviewMode((p) => !p)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors select-none
              ${
                previewMode
                  ? "bg-[#f0fdf4] border-[#16a34a] text-[#16a34a]"
                  : "bg-[#f8fafc] border-[#d1d5db] text-[#6b7280] hover:text-[#374151]"
              }`}
          >
            Preview Mode {previewMode ? "(활성)" : "(비활성)"}
          </button>

          <Button
            variant={bottomPanel === "sql" ? "success" : "ghost"}
            size="sm"
            onClick={() => setBottomPanel((p) => (p === "sql" ? null : "sql"))}
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
              />
            </svg>
            SQL
          </Button>
          <Button
            variant={bottomPanel === "logs" ? "secondary" : "ghost"}
            size="sm"
            onClick={() =>
              setBottomPanel((p) => (p === "logs" ? null : "logs"))
            }
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Logs
          </Button>
          <Button
            variant={bottomPanel === "summary" ? "secondary" : "ghost"}
            size="sm"
            onClick={() =>
              setBottomPanel((p) => (p === "summary" ? null : "summary"))
            }
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Summary
          </Button>

          <div className="h-4 w-px bg-[#e2e8f0]" />

          <Button
            variant={savedFlash ? "success" : "secondary"}
            size="sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Spinner size="sm" />
            ) : savedFlash ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                />
              </svg>
            )}
            {savedFlash ? "Saved" : "Save"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handlePublish}
            disabled={saving || jobStatus === "PUBLISHED"}
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Publish
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleRun}
            disabled={running}
            className="text-[#1268B3]"
          >
            {running ? (
              <Spinner size="sm" />
            ) : (
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            )}
            {running ? "Running..." : "Run"}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* 좌측 사이드바 */}
        <div ref={sidebarRef} className="relative w-[200px] flex-shrink-0 flex flex-col overflow-visible z-10">
          <ComponentPalette
            onDragStart={(type, label) => setDragType({ type, label })}
            showContextPanel={showContextPanel}
            onToggleContextPanel={(btnEl) => {
              if (sidebarRef.current) {
                const btnRect = btnEl.getBoundingClientRect();
                const sidebarRect = sidebarRef.current.getBoundingClientRect();
                setContextPanelTop(btnRect.top - sidebarRect.top);
              }
              setShowContextPanel((p) => !p);
            }}
            varsCount={contextVars.filter((v) => v.key.trim()).length}
          />
          {showContextPanel && (
            <div className="absolute left-full ml-1 z-50" style={{ top: contextPanelTop }}>
              <ContextVarsPanel
                vars={contextVars}
                onChange={setContextVars}
                onClose={() => setShowContextPanel(false)}
              />
            </div>
          )}
        </div>

        <div className="flex flex-col flex-1 min-w-0">
          {/* Canvas */}
          <div
            ref={reactFlowWrapper}
            className="flex-1 min-h-0 relative"
            onDragOver={onDragOver}
            onDrop={onDrop}
            style={{
              backgroundImage:
                "radial-gradient(circle, #dde1e7 1px, transparent 1px)",
              backgroundSize: "12px 12px",
              backgroundColor: "#f8fafc",
            }}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onNodeDoubleClick={onNodeDoubleClick}
              onNodeContextMenu={onNodeContextMenu}
              onPaneClick={onPaneClick}
              onInit={setRfInstance}
              nodeTypes={nodeTypes}
              fitView
              deleteKeyCode={["Delete", "Backspace"]}
              style={{ background: "transparent" }}
              defaultEdgeOptions={{
                style: { stroke: "#2563eb", strokeWidth: 2 },
              }}
            >
              <Controls />
              <MiniMap
                nodeColor={(n) => {
                  const t = (n.data as EtlNodeData).componentType ?? "";
                  if (t.endsWith("_INPUT")) return "#16a34a";
                  if (t.endsWith("_OUTPUT")) return "#ea580c";
                  if (
                    [
                      "T_PRE_JOB",
                      "T_POST_JOB",
                      "T_RUN_JOB",
                      "T_SLEEP",
                    ].includes(t)
                  )
                    return "#7c3aed";
                  return "#2563eb";
                }}
                maskColor="rgba(240,244,248,0.8)"
              />
            </ReactFlow>

            {/* Trigger 대기 배너 */}
            {pendingTrigger && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium shadow-md"
                  style={{
                    background:
                      pendingTrigger.condition === "ON_OK"
                        ? "#f0fdf4"
                        : "#fef2f2",
                    border: `1px solid ${pendingTrigger.condition === "ON_OK" ? "#86efac" : "#fca5a5"}`,
                    color:
                      pendingTrigger.condition === "ON_OK"
                        ? "#15803d"
                        : "#b91c1c",
                  }}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full animate-pulse ${pendingTrigger.condition === "ON_OK" ? "bg-[#16a34a]" : "bg-[#dc2626]"}`}
                  />
                  {pendingTrigger.condition === "ON_OK"
                    ? "On Component Ok"
                    : "On Component Error"}{" "}
                  — 대상 노드를 클릭하세요 (ESC 취소)
                </div>
              </div>
            )}

            {previewMode && (
              <>
                <style>{`
                  @keyframes previewRipple {
                    0%   { transform: scale(1);   opacity: 0.45; }
                    100% { transform: scale(2.6); opacity: 0; }
                  }
                  @keyframes previewGlow {
                    0%, 100% { opacity: 0.25; }
                    50%       { opacity: 0.6; }
                  }
                `}</style>
                <div className="absolute top-8 left-1/2 -translate-x-1/2 pointer-events-none z-10 flex flex-col items-center">
                  <div className="relative flex flex-col items-center px-8 py-3">
                    {/* 정적 glow 테두리 */}
                    <div
                      className="absolute inset-0 rounded-lg border border-[#94a3b8]/50"
                      style={{
                        animation: "previewGlow 2.5s ease-in-out infinite",
                      }}
                    />
                    {/* 물결 ripple 링 3개 (1초 간격) */}
                    <div
                      className="absolute inset-0 rounded-lg border border-[#94a3b8]/50"
                      style={{
                        animation: "previewRipple 3s ease-out infinite",
                        animationDelay: "0s",
                      }}
                    />
                    <div
                      className="absolute inset-0 rounded-lg border border-[#94a3b8]/50"
                      style={{
                        animation: "previewRipple 3s ease-out infinite",
                        animationDelay: "1s",
                      }}
                    />
                    <div
                      className="absolute inset-0 rounded-lg border border-[#94a3b8]/50"
                      style={{
                        animation: "previewRipple 3s ease-out infinite",
                        animationDelay: "2s",
                      }}
                    />
                    <span
                      className="relative z-10 text-[20px] font-bold tracking-widest select-none"
                      style={{ color: "#94a3b8" }}
                    >
                      — Preview Mode —
                    </span>
                    <p
                      className="relative z-10 text-[14px] font-bold text-center mt-1 select-none"
                      style={{ color: "#94a3b8" }}
                    >
                      해당 모드에서는 실행결과가 DB에 반영되지 않습니다.
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* 우클릭 컨텍스트 메뉴 */}
            {nodeContextMenu && (
              <div
                style={{
                  position: "fixed",
                  left: nodeContextMenu.x,
                  top: nodeContextMenu.y,
                  zIndex: 1000,
                  border: "1px solid #e2e8f0",
                }}
                className="bg-white rounded-lg shadow-xl py-1 min-w-[180px]"
                onMouseLeave={() => setNodeContextMenu(null)}
              >
                <div
                  className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{
                    color: "#94a3b8",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  Trigger
                </div>
                <button
                  onClick={() => {
                    setPendingTrigger({
                      sourceNodeId: nodeContextMenu.nodeId,
                      condition: "ON_OK",
                    });
                    setNodeContextMenu(null);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors"
                  style={{ color: "#374151" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      "#f0fdf4";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "";
                  }}
                >
                  <span className="w-2 h-2 rounded-full bg-[#16a34a] flex-shrink-0" />
                  On Component Ok
                </button>
                <button
                  onClick={() => {
                    setPendingTrigger({
                      sourceNodeId: nodeContextMenu.nodeId,
                      condition: "ON_ERROR",
                    });
                    setNodeContextMenu(null);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors"
                  style={{ color: "#374151" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      "#fef2f2";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "";
                  }}
                >
                  <span className="w-2 h-2 rounded-full bg-[#dc2626] flex-shrink-0" />
                  On Component Error
                </button>
              </div>
            )}

            {nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                    style={{
                      background: "#f1f5f9",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <svg
                      className="w-8 h-8"
                      style={{ color: "#94a3b8" }}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1}
                        d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                      />
                    </svg>
                  </div>
                  <p
                    className="text-sm font-medium"
                    style={{ color: "#64748b" }}
                  >
                    Drag components from the palette
                  </p>
                  <p className="text-xs mt-1" style={{ color: "#94a3b8" }}>
                    Connect nodes to build your ETL pipeline
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Panel */}
          {bottomPanel && (
            <div
              className="flex-shrink-0 bg-[#232b37] border-t border-[#21262d] flex flex-col"
              style={{ height: bottomPanelHeight }}
            >
              {/* 상단 리사이즈 핸들 */}
              <div
                onMouseDown={handleBottomPanelResizeStart}
                className="h-1.5 flex-shrink-0 cursor-ns-resize group flex items-center justify-center"
              >
                <div className="w-8 h-0.5 rounded-full bg-[#30363d] group-hover:bg-[#58a6ff] transition-colors" />
              </div>
              <div className="flex items-center gap-1 px-4 border-b border-[#21262d] flex-shrink-0">
                <button
                  onClick={() => setBottomPanel("sql")}
                  className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors
                    ${
                      bottomPanel === "sql"
                        ? "border-[#3fb950] text-[#3fb950]"
                        : "border-transparent text-[#8b949e] hover:text-[#e6edf3]"
                    }`}
                >
                  SQL View
                </button>
                <button
                  onClick={() => setBottomPanel("logs")}
                  className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors
                    ${
                      bottomPanel === "logs"
                        ? "border-[#58a6ff] text-[#58a6ff]"
                        : "border-transparent text-[#8b949e] hover:text-[#e6edf3]"
                    }`}
                >
                  Execution Logs
                  {executionResult && (
                    <span
                      className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]
                      ${
                        executionResult.status === "SUCCESS"
                          ? "bg-[#0f2d1a] text-[#3fb950]"
                          : executionResult.status === "FAILED"
                            ? "bg-[#2d0f0f] text-[#f85149]"
                            : "bg-[#252d3d] text-[#8b949e]"
                      }`}
                    >
                      {executionResult.status}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setBottomPanel("rowlogs")}
                  className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors
                    ${
                      bottomPanel === "rowlogs"
                        ? "border-[#f0883e] text-[#f0883e]"
                        : "border-transparent text-[#8b949e] hover:text-[#e6edf3]"
                    }`}
                >
                  Row Logs
                  {executionResult &&
                    Object.values(executionResult.nodeResults).some(
                      (r) => r.rowSamples,
                    ) && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-[#2d1a07] text-[#f0883e]">
                        {
                          Object.values(executionResult.nodeResults).filter(
                            (r) => r.rowSamples,
                          ).length
                        }
                      </span>
                    )}
                </button>
                <button
                  onClick={() => setBottomPanel("summary")}
                  className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors
                    ${
                      bottomPanel === "summary"
                        ? "border-[#bc8cff] text-[#bc8cff]"
                        : "border-transparent text-[#8b949e] hover:text-[#e6edf3]"
                    }`}
                >
                  Job Summary
                </button>
                <button
                  onClick={() => setBottomPanel(null)}
                  className="ml-auto text-[#484f58] hover:text-[#8b949e] p-1"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {bottomPanel === "sql" && (
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
                      lineNumbers: "on",
                      scrollBeyondLastLine: false,
                      wordWrap: "on",
                      padding: { top: 8 },
                    }}
                  />
                </div>
              )}

              {bottomPanel === "summary" && (
                <div className="flex-1 overflow-y-auto p-4">
                  {nodes.length === 0 ? (
                    <p className="text-xs text-[#484f58]">
                      캔버스에 노드가 없습니다.
                    </p>
                  ) : (
                    <div className="grid grid-cols-4 gap-3 h-full">
                      {/* 통계 카드 */}
                      <div className="col-span-4 grid grid-cols-4 gap-2">
                        {[
                          {
                            label: "전체 노드",
                            value: jobSummary.total,
                            color: "#8b949e",
                          },
                          {
                            label: "Input",
                            value: jobSummary.inputNodes.length,
                            color: "#3fb950",
                          },
                          {
                            label: "Transform",
                            value: jobSummary.xformNodes.length,
                            color: "#58a6ff",
                          },
                          {
                            label: "Output",
                            value: jobSummary.outputNodes.length,
                            color: "#f0883e",
                          },
                        ].map((s) => (
                          <div
                            key={s.label}
                            className="px-3 py-2 rounded-lg bg-[#1a2233] border border-[#21262d] flex items-center gap-2"
                          >
                            <span
                              className="text-lg font-bold"
                              style={{ color: s.color }}
                            >
                              {s.value}
                            </span>
                            <span className="text-[10px] text-[#484f58]">
                              {s.label}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* 데이터 흐름 */}
                      <div className="col-span-2 bg-[#1a2233] border border-[#21262d] rounded-lg p-3 overflow-y-auto">
                        <p className="text-[10px] font-semibold text-[#484f58] uppercase tracking-wider mb-2">
                          데이터 흐름
                        </p>
                        <div className="flex flex-wrap items-center gap-1">
                          {jobSummary.inputNodes.map((n) => (
                            <span
                              key={n.id}
                              className="px-2 py-0.5 rounded text-[10px] bg-[#0f2d1a] text-[#3fb950] border border-[#1a4731]"
                            >
                              {(n.data as EtlNodeData).label}
                            </span>
                          ))}
                          {jobSummary.inputNodes.length > 0 &&
                            jobSummary.xformNodes.length > 0 && (
                              <span className="text-[#30363d] text-xs">→</span>
                            )}
                          {jobSummary.xformNodes.map((n) => (
                            <span
                              key={n.id}
                              className="px-2 py-0.5 rounded text-[10px] bg-[#0d1f35] text-[#58a6ff] border border-[#1a3050]"
                            >
                              {(n.data as EtlNodeData).label}
                            </span>
                          ))}
                          {jobSummary.outputNodes.length > 0 && (
                            <span className="text-[#30363d] text-xs">→</span>
                          )}
                          {jobSummary.outputNodes.map((n) => (
                            <span
                              key={n.id}
                              className="px-2 py-0.5 rounded text-[10px] bg-[#2d1a07] text-[#f0883e] border border-[#3d2c0a]"
                            >
                              {(n.data as EtlNodeData).label}
                            </span>
                          ))}
                        </div>
                        <p className="text-[9px] text-[#484f58] mt-2">
                          엣지: {jobSummary.edgeCount}개 연결
                        </p>
                      </div>

                      {/* 컴포넌트 목록 */}
                      <div className="col-span-2 bg-[#1a2233] border border-[#21262d] rounded-lg p-3 overflow-y-auto">
                        <p className="text-[10px] font-semibold text-[#484f58] uppercase tracking-wider mb-2">
                          컴포넌트 구성
                        </p>
                        <div className="space-y-1">
                          {Object.entries(jobSummary.byType).map(
                            ([type, labels]) => (
                              <div
                                key={type}
                                className="flex items-center gap-2"
                              >
                                <span className="text-[9px] font-mono text-[#bc8cff] w-32 truncate flex-shrink-0">
                                  {type.replace("T_", "")}
                                </span>
                                <span className="text-[9px] text-[#8b949e]">
                                  × {labels.length}
                                </span>
                                <span className="text-[9px] text-[#484f58] truncate">
                                  {labels.join(", ")}
                                </span>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {bottomPanel === "logs" && (
                <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
                  {running && (
                    <div className="flex items-center gap-2 text-[#58a6ff] mb-2">
                      <Spinner size="sm" />
                      <span>Executing pipeline...</span>
                    </div>
                  )}
                  {!running && !executionResult && (
                    <p className="text-[#484f58]">
                      No execution yet. Click Run to execute the pipeline.
                    </p>
                  )}
                  {executionResult && (
                    <div className="space-y-1">
                      <p
                        className={`font-medium ${
                          executionResult.status === "SUCCESS"
                            ? "text-[#3fb950]"
                            : executionResult.status === "FAILED"
                              ? "text-[#f85149]"
                              : "text-[#8b949e]"
                        }`}
                      >
                        ── Execution {executionResult.status} ──
                        {executionResult.durationMs
                          ? ` (${executionResult.durationMs}ms)`
                          : ""}
                      </p>
                      {executionResult.logs.map((log, i) => (
                        <p key={i} className="text-[#8b949e] leading-relaxed">
                          {log}
                        </p>
                      ))}
                      {executionResult.errorMessage && (
                        <p className="text-[#f85149]">
                          ✗ {executionResult.errorMessage}
                        </p>
                      )}
                      {Object.entries(executionResult.nodeResults).map(
                        ([id, r]) => (
                          <p
                            key={id}
                            className={
                              r.status === "SUCCESS"
                                ? "text-[#3fb950]"
                                : "text-[#f85149]"
                            }
                          >
                            {r.status === "SUCCESS" ? "✓" : "✗"} [{r.nodeType}]{" "}
                            {r.rowsProcessed} rows
                            {r.durationMs ? ` in ${r.durationMs}ms` : ""}
                            {r.errorMessage ? ` — ${r.errorMessage}` : ""}
                          </p>
                        ),
                      )}
                    </div>
                  )}
                </div>
              )}

              {bottomPanel === "rowlogs" &&
                (() => {
                  const logNodes = executionResult
                    ? Object.entries(executionResult.nodeResults).filter(
                        ([, r]) => r.rowSamples,
                      )
                    : [];
                  const currentId =
                    activeLogNodeId &&
                    logNodes.some(([id]) => id === activeLogNodeId)
                      ? activeLogNodeId
                      : (logNodes[0]?.[0] ?? null);
                  const active = logNodes.find(([id]) => id === currentId);
                  return (
                    <div className="flex-1 flex flex-col overflow-hidden">
                      {running && (
                        <div className="flex items-center gap-2 text-[#58a6ff] p-4 text-xs font-mono">
                          <Spinner size="sm" />
                          <span>Executing pipeline...</span>
                        </div>
                      )}
                      {!running && !executionResult && (
                        <p className="p-4 text-xs font-mono text-[#484f58]">
                          No execution yet. T_LOG_ROW 노드를 캔버스에 추가하고
                          실행하세요.
                        </p>
                      )}
                      {executionResult && logNodes.length === 0 && (
                        <p className="p-4 text-xs font-mono text-[#484f58]">
                          T_LOG_ROW 노드가 없거나 캡처된 데이터가 없습니다.
                        </p>
                      )}
                      {executionResult && logNodes.length > 0 && (
                        <>
                          {/* 노드 탭 */}
                          <div className="flex items-center gap-1 px-3 pt-1 pb-0 border-b border-[#30363d] flex-shrink-0">
                            {logNodes.map(([id, r]) => {
                              const label =
                                (
                                  nodes.find((n) => n.id === id)?.data as
                                    | { label?: string }
                                    | undefined
                                )?.label ?? r.nodeType;
                              return (
                                <button
                                  key={id}
                                  onClick={() => setActiveLogNodeId(id)}
                                  className={`px-2.5 py-1.5 text-[10px] font-medium border-b-2 transition-colors whitespace-nowrap
                                  ${
                                    currentId === id
                                      ? "border-[#f0883e] text-[#f0883e]"
                                      : "border-transparent text-[#8b949e] hover:text-[#e6edf3]"
                                  }`}
                                >
                                  {label}
                                  <span className="ml-1 text-[#484f58]">
                                    ({r.rowSamples!.rows.length} rows)
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          {/* 그리드 테이블 */}
                          {active && active[1].rowSamples && (
                            <div className="flex-1 overflow-auto">
                              <table className="text-[11px] font-mono w-max min-w-full border-collapse">
                                <thead
                                  className="sticky top-0 z-10"
                                  style={{ background: "#1a2233" }}
                                >
                                  <tr>
                                    <th className="px-2 py-1.5 text-left text-[#484f58] font-medium border-r border-b border-[#21262d] w-8">
                                      #
                                    </th>
                                    {active[1].rowSamples.columns.map((col) => (
                                      <th
                                        key={col}
                                        className="px-3 py-1.5 text-left text-[#8b949e] font-medium border-r border-b border-[#21262d] whitespace-nowrap"
                                      >
                                        {col}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {active[1].rowSamples.rows.map((row, ri) => (
                                    <tr
                                      key={ri}
                                      style={{
                                        background:
                                          ri % 2 === 0 ? "#232b37" : "#1e2632",
                                      }}
                                      className="hover:bg-[#2a3547] transition-colors"
                                    >
                                      <td className="px-2 py-1 text-[#484f58] border-r border-[#21262d] text-center">
                                        {ri + 1}
                                      </td>
                                      {row.map((cell, ci) => (
                                        <td
                                          key={ci}
                                          className="px-3 py-1 border-r border-[#21262d] whitespace-nowrap max-w-[240px] truncate"
                                          style={{
                                            color:
                                              cell === null
                                                ? "#484f58"
                                                : typeof cell === "number"
                                                  ? "#79c0ff"
                                                  : typeof cell === "boolean"
                                                    ? "#56d364"
                                                    : "#c9d1d9",
                                          }}
                                          title={
                                            cell === null
                                              ? "NULL"
                                              : String(cell)
                                          }
                                        >
                                          {cell === null ? (
                                            <span className="italic text-[#484f58]">
                                              NULL
                                            </span>
                                          ) : (
                                            String(cell)
                                          )}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}
            </div>
          )}
        </div>

        {/* AI Agent Panel - 슬라이드 애니메이션 */}
        <div
          className="flex-shrink-0 h-full overflow-hidden relative"
          style={{
            width: aiPanelOpen ? aiPanelWidth : 0,
            transition: aiResizing ? "none" : "width 300ms ease-in-out",
          }}
        >
          {/* 내부 고정 width 래퍼 — 슬라이드 중 reflow 방지 */}
          <div className="h-full relative" style={{ width: aiPanelWidth }}>
            {/* 좌측 리사이즈 핸들 */}
            {aiPanelOpen && (
              <div
                onMouseDown={handleAiPanelResizeStart}
                className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize group z-20"
              >
                <div className="h-full w-full bg-transparent group-hover:bg-[#7c3aed]/20 transition-colors" />
              </div>
            )}
            <AiAgentPanel
              onApplyGraph={handleApplyAiGraph}
              onPatchNodes={handlePatchNodes}
              connections={connections}
              executionResult={executionResult}
              nodes={nodes}
              edges={edges}
            />
          </div>
        </div>

        {/* Right Panel: Properties + Schema Tree */}
        <div
          className="flex-shrink-0 flex flex-col relative"
          style={{
            width: rightPanelWidth,
            background: "#ffffff",
            borderLeft: "1px solid #e2e8f0",
          }}
        >
          {/* 좌측 리사이즈 핸들 */}
          <div
            onMouseDown={handleRightPanelResizeStart}
            className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize group z-20"
          >
            <div className="h-full w-full bg-transparent group-hover:bg-[#2563eb]/20 transition-colors" />
          </div>
          {/* AI 패널 토글 탭 버튼 */}
          <button
            onClick={() => setAiPanelOpen((p) => !p)}
            title={aiPanelOpen ? "AI Agent 닫기" : "AI Agent 열기"}
            className={`absolute z-10 top-[38%] -translate-y-1/2
              flex items-center justify-center
              rounded-l-xl border border-r-0 transition-all duration-300 ease-in-out shadow-lg
              ${
                aiPanelOpen
                  ? "-left-3 w-3 h-16 bg-[#e0e7ff] border-[#6366f1] hover:bg-[#c7d2fe]"
                  : "-left-6 w-6 h-20 bg-[#faf5ff] border-[#d8b4fe] text-[#7c3aed] hover:bg-[#f3e8ff] hover:border-[#a855f7] hover:shadow-[0_0_12px_rgba(124,58,237,0.2)]"
              }`}
          >
            {!aiPanelOpen && (
              <img
                src="/ai.png"
                alt="AI Agent"
                className="w-8 h-8 object-contain"
              />
            )}
          </button>
          {/* Properties Section */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {selectedNode ? (
              <PropertiesPanel
                node={selectedNode}
                onUpdate={(id, patch) =>
                  handleUpdateNode(id, patch as Partial<EtlNodeData>)
                }
                onDelete={handleDeleteNode}
              />
            ) : (
              <div className="flex flex-col items-center justify-center flex-1">
                <div className="text-center px-6">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-3"
                    style={{
                      background: "#f1f5f9",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <svg
                      className="w-5 h-5"
                      style={{ color: "#94a3b8" }}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"
                      />
                    </svg>
                  </div>
                  <p className="text-[12px]" style={{ color: "#64748b" }}>
                    노드를 클릭하여 설정
                  </p>
                  <p className="text-[10px] mt-1" style={{ color: "#94a3b8" }}>
                    T_MAP은 더블클릭 시<br />
                    매핑 에디터가 열립니다
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Schema Tree Section */}
          <div
            className="flex-shrink-0 flex flex-col"
            style={{
              height: schemaTreeCollapsed ? 32 : schemaHeight,
              borderTop: "1px solid #e2e8f0",
            }}
          >
            {/* Resize Handle */}
            {!schemaTreeCollapsed && (
              <div
                onMouseDown={handleSchemaResizeStart}
                className="h-1.5 flex-shrink-0 cursor-ns-resize group flex items-center justify-center"
              >
                <div className="w-8 h-0.5 rounded-full bg-[#e2e8f0] group-hover:bg-[#2563eb] transition-colors" />
              </div>
            )}
            <button
              onClick={() => setSchemaTreeCollapsed((c) => !c)}
              className="flex items-center justify-between px-3 py-2 transition-colors flex-shrink-0 hover:bg-[#f8fafc]"
            >
              <div className="flex items-center gap-1.5">
                <svg
                  className="w-3 h-3"
                  style={{ color: "#94a3b8" }}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
                  />
                </svg>
                <span
                  className="text-xs font-semibold"
                  style={{ color: "#64748b" }}
                >
                  Schema Browser
                </span>
              </div>
              <svg
                className={`w-3 h-3 transition-transform ${schemaTreeCollapsed ? "-rotate-90" : ""}`}
                style={{ color: "#94a3b8" }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
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
            const node = nodes.find((n) => n.id === mappingTarget.nodeId);
            const d = node?.data as EtlNodeData | undefined;
            const raw = d?.config?.mappings;
            if (Array.isArray(raw)) return raw as never[];
            if (typeof raw === "string") {
              try {
                return JSON.parse(raw);
              } catch {
                return [];
              }
            }
            return [];
          })()}
          onApply={(mappings) => {
            handleUpdateNode(mappingTarget.nodeId, {
              config: {
                ...((
                  nodes.find((n) => n.id === mappingTarget.nodeId)
                    ?.data as EtlNodeData
                )?.config ?? {}),
                mappings,
              },
            });
          }}
          onClose={() => setMappingTarget(null)}
        />
      )}
    </div>
  );
}
