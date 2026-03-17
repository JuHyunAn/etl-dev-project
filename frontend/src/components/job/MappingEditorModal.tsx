import React, { useEffect, useState, useMemo, useRef, useCallback, useLayoutEffect } from "react";
import { schemaApi } from "../../api";
import { Spinner } from "../ui";
import type { Node, Edge } from "@xyflow/react";
import type { ColumnInfo } from "../../types";
import { type MappingRow, buildAutoMappings } from "../../utils/mapping";
import {
  normalizeType,
  resolveCast,
  ENHANCEMENTS,
  BULK_ENHANCEMENTS,
} from "../../utils/typeUtils";
import { useAppStore } from "../../stores";

// ── TYPE 선택지 ───────────────────────────────────────────────────
const TYPE_COMMON = [
  "VARCHAR",
  "CHAR",
  "INTEGER",
  "SMALLINT",
  "DECIMAL",
  "NUMERIC",
  "FLOAT",
  "REAL",
  "DATE",
  // ※ 제외: TEXT(Oracle DDL 에러), BIGINT(Oracle DDL 에러), TIMESTAMP(MSSQL=ROWVERSION),
  //         BOOLEAN(Oracle/MSSQL DDL 에러), CLOB/BLOB(PG/MSSQL DDL 에러)
] as const;

const TYPE_POSTGRESQL = [
  "TEXT",
  "BIGINT",
  "TIMESTAMP",
  "BOOLEAN",
  "INT2",
  "INT4",
  "INT8",
  "SERIAL",
  "BIGSERIAL",
  "SMALLSERIAL",
  "BPCHAR",
  "FLOAT4",
  "FLOAT8",
  "DOUBLE PRECISION",
  "MONEY",
  "TIMESTAMPTZ",
  "INTERVAL",
  "BYTEA",
  "JSON",
  "JSONB",
  "UUID",
] as const;

const TYPE_ORACLE = [
  "TIMESTAMP",
  "VARCHAR2",
  "NVARCHAR2",
  "NCHAR",
  "CLOB",
  "NCLOB",
  "LONG",
  "NUMBER",
  "BINARY_FLOAT",
  "BINARY_DOUBLE",
  "BLOB",
  "RAW",
  "LONG RAW",
  "TIMESTAMP WITH TIME ZONE",
  "TIMESTAMP WITH LOCAL TIME ZONE",
] as const;

const TYPE_MARIADB = [
  "TEXT",
  "BIGINT",
  "TIMESTAMP",
  "BOOLEAN",
  "TINYINT",
  "MEDIUMINT",
  "DOUBLE",
  "TINYTEXT",
  "MEDIUMTEXT",
  "LONGTEXT",
  "DATETIME",
  "YEAR",
  "BIT",
  "BINARY",
  "VARBINARY",
  "BLOB",
  "TINYBLOB",
  "MEDIUMBLOB",
  "LONGBLOB",
  "JSON",
  "ENUM",
  "SET",
] as const;

const TYPE_MSSQL = [
  "TEXT",
  "BIGINT",
  "NVARCHAR",
  "NCHAR",
  "NTEXT",
  "TINYINT",
  "MONEY",
  "SMALLMONEY",
  "DATETIME",
  "DATETIME2",
  "SMALLDATETIME",
  "DATETIMEOFFSET",
  "BIT",
  "BINARY",
  "VARBINARY",
  "IMAGE",
  "UNIQUEIDENTIFIER",
  "XML",
] as const;

const ALL_KNOWN_TYPES = new Set<string>([
  ...TYPE_COMMON,
  ...TYPE_POSTGRESQL,
  ...TYPE_ORACLE,
  ...TYPE_MARIADB,
  ...TYPE_MSSQL,
]);

type DbType = "POSTGRESQL" | "ORACLE" | "MARIADB" | "MSSQL";

function detectDbType(connectionType: string): DbType | undefined {
  const t = connectionType.toUpperCase();
  if (t.includes("POSTGRES")) return "POSTGRESQL";
  if (t.includes("ORACLE")) return "ORACLE";
  if (t.includes("MARIA") || t.includes("MYSQL")) return "MARIADB";
  if (t.includes("MSSQL") || t.includes("SQLSERVER")) return "MSSQL";
  return undefined;
}

interface SourceGroup {
  nodeId: string;
  nodeLabel: string;
  connectionId: string;
  tableName: string;
  columns: ColumnInfo[];
  loading: boolean;
  color: string;
}

interface OutputTab {
  id: string;
  label: string;
  tableName: string;
  writeMode: string;
  connectionId: string;
}

const ROW_COLORS = [
  "#FE6703",
  "#FE6703",
  "#FE6703",
  "#FE6703",
  "#FE6703",
  "#FE6703",
  "#FE6703",
  "#FE6703",
];

interface Props {
  nodeId: string;
  nodeLabel: string;
  nodes: Node[];
  edges: Edge[];
  initialOutputNodeId?: string;
  currentMappingsByOutput: Record<string, MappingRow[]>;
  onApply: (allMappings: Record<string, MappingRow[]>) => void;
  onClose: () => void;
}

export default function MappingEditorModal({
  nodeId,
  nodeLabel,
  nodes,
  edges,
  initialOutputNodeId,
  currentMappingsByOutput,
  onApply,
  onClose,
}: Props) {
  const [sourceGroups, setSourceGroups] = useState<SourceGroup[]>([]);
  const [loadingCount, setLoadingCount] = useState(0);
  const [outputTabs, setOutputTabs] = useState<OutputTab[]>([]);
  const [activeOutputId, setActiveOutputId] = useState<string>("");
  const [mappingsByOutput, setMappingsByOutput] = useState<
    Record<string, MappingRow[]>
  >({});
  const [targetMapsByOutput, setTargetMapsByOutput] = useState<
    Record<string, Map<string, string>>
  >({});
  const [selectedSourceCol, setSelectedSourceCol] = useState<{
    nodeId: string;
    col: string;
  } | null>(null);
  const [showExprWarning, setShowExprWarning] = useState(false);
  const [popoverRowId, setPopoverRowId] = useState<string | null>(null);
  const [showEnhDropdown, setShowEnhDropdown] = useState(false);

  const connections = useAppStore((s) => s.connections);

  // 현재 active output 탭의 DB 타입 (TYPE 드롭다운 필터용)
  const targetDbType = useMemo<DbType | undefined>(() => {
    const activeTab = outputTabs.find((t) => t.id === activeOutputId);
    if (!activeTab?.connectionId) return undefined;
    const conn = connections.find((c) => c.id === activeTab.connectionId);
    if (!conn) return undefined;
    return detectDbType(conn.dbType);
  }, [outputTabs, activeOutputId, connections]);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    if (!showEnhDropdown && !popoverRowId) return;
    const handler = () => {
      setShowEnhDropdown(false);
      setPopoverRowId(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showEnhDropdown, popoverRowId]);

  // ── 소스 그룹 (Input 노드) ─────────────────────────────────────
  useEffect(() => {
    const inputEdges = edges.filter((e) => {
      const lt = (e.data as Record<string, unknown>)?.linkType as
        | string
        | undefined;
      return (
        e.target === nodeId && (lt === "ROW" || lt === undefined || lt === null)
      );
    });
    const inputNodeIds = inputEdges.map((e) => e.source);

    const groups: SourceGroup[] = inputNodeIds.map((nid, idx) => {
      const node = nodes.find((n) => n.id === nid);
      const data = (node?.data ?? {}) as Record<string, unknown>;
      const cfg = (data.config ?? {}) as Record<string, unknown>;
      const cachedCols = Array.isArray(cfg.columns)
        ? (cfg.columns as ColumnInfo[])
        : [];
      return {
        nodeId: nid,
        nodeLabel: (data.label as string) || nid,
        connectionId: (cfg.connectionId as string) || "",
        tableName: (cfg.tableName as string) || "",
        columns: cachedCols,
        loading: cachedCols.length === 0,
        color: ROW_COLORS[idx % ROW_COLORS.length],
      };
    });

    setSourceGroups(groups);
    setLoadingCount(groups.filter((g) => g.loading).length);

    groups.forEach((g) => {
      if (!g.loading) return;
      if (!g.connectionId || !g.tableName) {
        setSourceGroups((prev) =>
          prev.map((p) =>
            p.nodeId === g.nodeId ? { ...p, loading: false } : p,
          ),
        );
        setLoadingCount((c) => Math.max(0, c - 1));
        return;
      }
      const parts = g.tableName.split(".");
      const table = parts[parts.length - 1];
      const schema = parts.length > 1 ? parts[0] : undefined;
      schemaApi
        .getColumns(g.connectionId, table, schema)
        .then((cols) => {
          setSourceGroups((prev) =>
            prev.map((p) =>
              p.nodeId === g.nodeId
                ? { ...p, columns: cols, loading: false }
                : p,
            ),
          );
          setLoadingCount((c) => Math.max(0, c - 1));
        })
        .catch(() => {
          setSourceGroups((prev) =>
            prev.map((p) =>
              p.nodeId === g.nodeId ? { ...p, loading: false } : p,
            ),
          );
          setLoadingCount((c) => Math.max(0, c - 1));
        });
    });
  }, [nodeId, nodes, edges]);

  // ── 연결된 모든 T_JDBC_OUTPUT 탐색 (BFS) ──────────────────────
  useEffect(() => {
    const rowEdgesBySource: Record<string, string[]> = {};
    edges.forEach((e) => {
      const lt = (e.data as Record<string, unknown>)?.linkType as
        | string
        | undefined;
      if (lt === "ROW" || lt === undefined || lt === null) {
        if (!rowEdgesBySource[e.source]) rowEdgesBySource[e.source] = [];
        rowEdgesBySource[e.source].push(e.target);
      }
    });

    const visited = new Set<string>();
    const queue: string[] = [nodeId];
    const foundOutputs: OutputTab[] = [];

    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const node = nodes.find((n) => n.id === cur);
      if (cur !== nodeId && node) {
        const data = (node.data ?? {}) as Record<string, unknown>;
        if (data.componentType === "T_JDBC_OUTPUT") {
          const cfg = (data.config ?? {}) as Record<string, unknown>;
          foundOutputs.push({
            id: cur,
            label: (data.label as string) || "Output",
            tableName: (cfg.tableName as string) || "",
            writeMode: (cfg.writeMode as string) || "INSERT",
            connectionId: (cfg.connectionId as string) || "",
          });
          continue;
        }
      }
      (rowEdgesBySource[cur] || []).forEach((t) => queue.push(t));
    }

    setOutputTabs(foundOutputs);
    const firstId = initialOutputNodeId ?? foundOutputs[0]?.id ?? "";
    setActiveOutputId(firstId);

    const initial: Record<string, MappingRow[]> = {};
    foundOutputs.forEach((o) => {
      const existing = currentMappingsByOutput[o.id];
      if (Array.isArray(existing)) {
        initial[o.id] = existing.map((m, i) => {
          const raw = m as unknown as Record<string, unknown>;
          return {
            id: (raw.id as string) || `map-loaded-${i}-${Date.now()}`,
            sourceNodeId: (raw.sourceNodeId as string) || "",
            sourceColumn: (raw.sourceColumn as string) || "",
            targetName:
              (raw.targetName as string) || (raw.outputColumn as string) || "",
            expression: (raw.expression as string) || "",
            type: ((raw.type as string) || "VARCHAR").toUpperCase(),
          };
        });
      } else {
        initial[o.id] = [];
      }
    });
    setMappingsByOutput(initial);

    foundOutputs.forEach((out) => {
      const node = nodes.find((n) => n.id === out.id);
      if (!node) return;
      const data = (node.data ?? {}) as Record<string, unknown>;
      const cfg = (data.config ?? {}) as Record<string, unknown>;
      const cachedCols = Array.isArray(cfg.columns)
        ? (cfg.columns as ColumnInfo[])
        : null;

      if (cachedCols && cachedCols.length > 0) {
        const map = new Map<string, string>();
        cachedCols.forEach((c) =>
          map.set(c.columnName.toLowerCase(), c.dataType.toUpperCase()),
        );
        setTargetMapsByOutput((prev) => ({ ...prev, [out.id]: map }));
        return;
      }

      const connId = cfg.connectionId as string;
      const tableName = cfg.tableName as string;
      if (!connId || !tableName) return;

      const parts = tableName.split(".");
      const table = parts[parts.length - 1];
      const schema = parts.length > 1 ? parts[0] : undefined;
      schemaApi
        .getColumns(connId, table, schema)
        .then((cols) => {
          const map = new Map<string, string>();
          cols.forEach((c) =>
            map.set(c.columnName.toLowerCase(), c.dataType.toUpperCase()),
          );
          setTargetMapsByOutput((prev) => ({ ...prev, [out.id]: map }));
        })
        .catch(() => {});
    });
  }, [nodeId, nodes, edges, initialOutputNodeId]);

  // ── sourceGroups 로드 후 sourceNodeId 미해결 행 보완 ─────────
  useEffect(() => {
    const allLoaded =
      sourceGroups.length > 0 && sourceGroups.every((g) => !g.loading);
    if (!allLoaded) return;
    setMappingsByOutput((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((outId) => {
        next[outId] = next[outId].map((m) => {
          if (m.sourceNodeId || !m.sourceColumn) return m;
          for (const g of sourceGroups) {
            if (g.columns.some((c) => c.columnName === m.sourceColumn)) {
              return { ...m, sourceNodeId: g.nodeId };
            }
          }
          return m;
        });
      });
      return next;
    });
  }, [sourceGroups]);

  // ── 현재 활성 Output 데이터 ────────────────────────────────────
  const activeMappings = mappingsByOutput[activeOutputId] ?? [];
  const setActiveMappings = (rows: MappingRow[]) =>
    setMappingsByOutput((prev) => ({ ...prev, [activeOutputId]: rows }));
  const activeTargetMap =
    targetMapsByOutput[activeOutputId] ?? new Map<string, string>();

  const allSourceCols = sourceGroups.flatMap((g) =>
    g.columns.map((c) => ({
      nodeId: g.nodeId,
      nodeLabel: g.nodeLabel,
      col: c,
      color: g.color,
    })),
  );

  // ── Auto Map ─────────────────────────────────────────────────
  const handleAutoMap = () => {
    const ts = Date.now();
    if (activeTargetMap.size > 0) {
      const auto: MappingRow[] = Array.from(activeTargetMap.entries()).map(
        ([targetCol, targetType], idx) => {
          const matched = allSourceCols.find(
            ({ col }) => col.columnName.toLowerCase() === targetCol,
          );
          if (matched) {
            return buildAutoMappings(
              matched.nodeId,
              [matched.col],
              activeTargetMap,
            )[0];
          }
          return {
            id: `auto-empty-${targetCol}-${ts}-${idx}`,
            sourceNodeId: "",
            sourceColumn: "",
            targetName: targetCol,
            expression: "",
            type: targetType,
          };
        },
      );
      setActiveMappings(auto);
    } else {
      const auto: MappingRow[] = allSourceCols.map(
        ({ nodeId: nid, col }) =>
          buildAutoMappings(nid, [col], activeTargetMap)[0],
      );
      setActiveMappings(auto);
    }
    setSelectedSourceCol(null);
  };

  // 소스 컬럼 타입 조회
  const getSourceType = (nid: string, colName: string): string => {
    const g = sourceGroups.find((g) => g.nodeId === nid);
    return g?.columns.find((c) => c.columnName === colName)?.dataType ?? "";
  };

  const handleSourceClick = (nid: string, colName: string) => {
    if (
      selectedSourceCol?.nodeId === nid &&
      selectedSourceCol?.col === colName
    ) {
      setSelectedSourceCol(null);
    } else {
      setSelectedSourceCol({ nodeId: nid, col: colName });
    }
  };

  const handleAddRow = () => {
    if (selectedSourceCol) {
      const g = sourceGroups.find((g) => g.nodeId === selectedSourceCol.nodeId);
      const col = g?.columns.find(
        (c) => c.columnName === selectedSourceCol.col,
      );
      setActiveMappings([
        ...activeMappings,
        {
          id: `map-${Date.now()}`,
          sourceNodeId: selectedSourceCol.nodeId,
          sourceColumn: selectedSourceCol.col,
          targetName: selectedSourceCol.col.toLowerCase(),
          expression: "",
          type:
            activeTargetMap.get(selectedSourceCol.col.toLowerCase()) ??
            col?.dataType ??
            "VARCHAR",
        },
      ]);
      setSelectedSourceCol(null);
    } else {
      setActiveMappings([
        ...activeMappings,
        {
          id: `map-${Date.now()}`,
          sourceNodeId: "",
          sourceColumn: "",
          targetName: "",
          expression: "",
          type: "VARCHAR",
        },
      ]);
    }
  };

  const handleTargetClick = (rowId: string) => {
    if (!selectedSourceCol) return;
    setActiveMappings(
      activeMappings.map((m) =>
        m.id === rowId
          ? {
              ...m,
              sourceNodeId: selectedSourceCol.nodeId,
              sourceColumn: selectedSourceCol.col,
              // 타겟 타입 우선, 없으면 기존 타입 유지
              type: activeTargetMap.get(m.targetName.toLowerCase()) ?? m.type,
            }
          : m,
      ),
    );
    setSelectedSourceCol(null);
  };

  const updateMapping = (id: string, key: keyof MappingRow, value: string) => {
    setActiveMappings(
      activeMappings.map((m) => (m.id === id ? { ...m, [key]: value } : m)),
    );
  };

  const removeMapping = (id: string) => {
    setActiveMappings(activeMappings.filter((m) => m.id !== id));
  };

  const getSourceColor = (nid: string) =>
    sourceGroups.find((g) => g.nodeId === nid)?.color ?? "#64748b";

  const isMapped = (nid: string, colName: string) =>
    activeMappings.some(
      (m) => m.sourceNodeId === nid && m.sourceColumn === colName,
    );

  const handleApply = () => {
    if (
      activeMappings.length > 0 &&
      activeMappings.every((m) => m.expression.trim() !== "") &&
      !showExprWarning
    ) {
      setShowExprWarning(true);
      return;
    }
    onApply(mappingsByOutput);
    onClose();
  };

  // 일괄 Enhancement 적용
  const handleApplyBulkEnh = (enhId: string) => {
    const enh = BULK_ENHANCEMENTS.find((e) => e.id === enhId);
    if (!enh) return;
    setActiveMappings(
      activeMappings.map((m) => {
        const family = normalizeType(m.type);
        if (!enh.applyTo.includes(family)) return m;
        const col = m.sourceColumn || m.targetName;
        if (!col) return m;
        return { ...m, expression: enh.apply(col, family) };
      }),
    );
    setShowEnhDropdown(false);
  };

  const writeModeColors: Record<string, { bg: string; text: string }> = {
    INSERT: { bg: "#dbeafe", text: "#1d4ed8" },
    TRUNCATE_INSERT: { bg: "#fef9c3", text: "#92400e" },
    UPDATE: { bg: "#dcfce7", text: "#166534" },
    UPSERT: { bg: "#f3e8ff", text: "#6b21a8" },
  };

  const totalMappings = Object.values(mappingsByOutput).reduce(
    (s, m) => s + m.length,
    0,
  );

  // ── SVG Connection Lines (DOM 직접 조작 — setState 사용 안 함) ──
  const bodyRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const sourcePanelRef = useRef<HTMLDivElement>(null);
  const targetPanelRef = useRef<HTMLDivElement>(null);
  const sourceRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const targetRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const recalcPaths = useCallback(() => {
    const svg = svgRef.current;
    const body = bodyRef.current;
    if (!svg || !body) return;

    // 기존 커넥션 라인 제거
    svg.querySelectorAll(".conn-line").forEach(el => el.remove());

    const bodyRect = body.getBoundingClientRect();
    activeMappings.forEach((m) => {
      if (!m.sourceNodeId || !m.sourceColumn) return;
      const srcKey = `${m.sourceNodeId}:${m.sourceColumn}`;
      const srcEl = sourceRowRefs.current.get(srcKey);
      const tgtEl = targetRowRefs.current.get(m.id);
      if (!srcEl || !tgtEl) return;
      const srcRect = srcEl.getBoundingClientRect();
      const tgtRect = tgtEl.getBoundingClientRect();
      const x1 = srcRect.right - bodyRect.left;
      const y1 = srcRect.top + srcRect.height / 2 - bodyRect.top;
      const x2 = tgtRect.left - bodyRect.left;
      const y2 = tgtRect.top + tgtRect.height / 2 - bodyRect.top;
      const dx = Math.abs(x2 - x1) * 0.5;
      const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
      const color = getSourceColor(m.sourceNodeId);

      // 그림자 라인
      const shadow = document.createElementNS("http://www.w3.org/2000/svg", "path");
      shadow.setAttribute("d", d);
      shadow.setAttribute("fill", "none");
      shadow.setAttribute("stroke", color);
      shadow.setAttribute("stroke-width", "3");
      shadow.setAttribute("opacity", "0.15");
      shadow.classList.add("conn-line");
      svg.appendChild(shadow);

      // 메인 라인
      const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
      line.setAttribute("d", d);
      line.setAttribute("fill", "none");
      line.setAttribute("stroke", color);
      line.setAttribute("stroke-width", "1.5");
      line.setAttribute("opacity", "0.85");
      line.classList.add("conn-line");
      svg.appendChild(line);
    });
  });

  useLayoutEffect(() => { recalcPaths(); });

  // ── Drag & Drop ───────────────────────────────────────────────
  const [draggedSource, setDraggedSource] = useState<{ nodeId: string; col: string } | null>(null);
  const [draggedTargetRowId, setDraggedTargetRowId] = useState<string | null>(null);

  // ── 타겟 컬럼 커스텀 드롭다운 ────────────────────────────────
  const [openColSelectRowId, setOpenColSelectRowId] = useState<string | null>(null);

  const handleDropOnRow = (rowId: string) => {
    if (!draggedSource) return;
    setActiveMappings(
      activeMappings.map(m =>
        m.id === rowId
          ? { ...m, sourceNodeId: draggedSource.nodeId, sourceColumn: draggedSource.col,
              type: activeTargetMap.get(m.targetName.toLowerCase()) ?? m.type }
          : m
      )
    );
    setDraggedSource(null);
  };

  const handleDisconnectTarget = () => {
    if (!draggedTargetRowId) return;
    setActiveMappings(
      activeMappings.map(m =>
        m.id === draggedTargetRowId
          ? { ...m, sourceNodeId: "", sourceColumn: "" }
          : m
      )
    );
    setDraggedTargetRowId(null);
  };

  const handleDropAddNew = () => {
    if (!draggedSource) return;
    const g = sourceGroups.find(g => g.nodeId === draggedSource.nodeId);
    const col = g?.columns.find(c => c.columnName === draggedSource.col);
    setActiveMappings([...activeMappings, {
      id: `map-${Date.now()}`,
      sourceNodeId: draggedSource.nodeId,
      sourceColumn: draggedSource.col,
      targetName: draggedSource.col.toLowerCase(),
      expression: "",
      type: activeTargetMap.get(draggedSource.col.toLowerCase()) ?? col?.dataType ?? "VARCHAR",
    }]);
    setDraggedSource(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-[50vw] h-[65vh] rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"
          style={{ background: "#f1f5f9", borderBottom: "1px solid #e2e8f0" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: "#388bfd22" }}>
              <svg className="w-3.5 h-3.5 text-[#388bfd]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "#1e293b" }}>{nodeLabel}</p>
              <p className="text-[10px]" style={{ color: "#64748b" }}>
                {selectedSourceCol
                  ? `"${selectedSourceCol.col}" 선택됨 — 타겟 행 클릭하여 연결`
                  : `${outputTabs.length}개 Output · 총 ${totalMappings}개 매핑`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded transition-colors hover:bg-black/5" style={{ color: "#64748b" }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Output Tabs + Toolbar ── */}
        <div
          className="flex items-center flex-shrink-0"
          style={{ background: "#ffffff", borderBottom: "1px solid #e2e8f0" }}
        >
          <div className="flex flex-1 overflow-x-auto">
            {outputTabs.length === 0 ? (
              <div className="px-4 py-2 text-xs" style={{ color: "#94a3b8" }}>T_JDBC_OUTPUT을 ROW 엣지로 연결하세요</div>
            ) : (
              outputTabs.map((out) => {
                const isActive = activeOutputId === out.id;
                const cnt = (mappingsByOutput[out.id] ?? []).length;
                const wmc = writeModeColors[out.writeMode] ?? { bg: "#1c2128", text: "#8b949e" };
                return (
                  <button
                    key={out.id}
                    onClick={() => { setActiveOutputId(out.id); setSelectedSourceCol(null); setShowExprWarning(false); }}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium flex-shrink-0 transition-colors border-b-2"
                    style={{
                      borderColor: isActive ? "#388bfd" : "transparent",
                      color: isActive ? "#388bfd" : "#64748b",
                      background: isActive ? "#388bfd11" : "transparent",
                    }}
                  >
                    <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                    </svg>
                    <span className="truncate max-w-[120px]">{out.tableName || out.label}</span>
                    <span className="text-[9px] px-1 rounded font-medium flex-shrink-0" style={{ background: wmc.bg, color: wmc.text }}>{out.writeMode}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: cnt > 0 ? "#dcfce7" : "#f1f5f9", color: cnt > 0 ? "#16a34a" : "#94a3b8" }}>{cnt}</span>
                  </button>
                );
              })
            )}
          </div>
          {activeOutputId && (
            <div className="flex items-center gap-2 px-3 flex-shrink-0" style={{ borderLeft: "1px solid #e2e8f0" }}>
              <button
                onClick={handleAutoMap}
                className="flex items-center gap-1 px-2 py-1 text-[11px] rounded transition-colors"
                style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#dcfce7")}
                onMouseLeave={e => (e.currentTarget.style.background = "#f0fdf4")}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Auto Map
              </button>
              <div className="relative" onMouseDown={e => e.stopPropagation()}>
                <button
                  onClick={() => setShowEnhDropdown(v => !v)}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] rounded transition-colors"
                  style={{ background: "#fef9c3", color: "#a16207", border: "1px solid #fde68a" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#fef08a")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#fef9c3")}
                >
                  Enhancements ▾
                </button>
                {showEnhDropdown && (
                  <div className="absolute right-0 top-full mt-1 w-64 rounded-lg shadow-xl z-20" style={{ background: "#ffffff", border: "1px solid #e2e8f0" }}>
                    {BULK_ENHANCEMENTS.map(enh => (
                      <button key={enh.id} onClick={() => handleApplyBulkEnh(enh.id)}
                        className="flex flex-col w-full px-3 py-2 text-left transition-colors hover:bg-black/5"
                        style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <span className="text-xs font-medium" style={{ color: "#1e293b" }}>{enh.label}</span>
                        <span className="text-[10px]" style={{ color: "#64748b" }}>{enh.description}</span>
                      </button>
                    ))}
                    <button onClick={() => { setActiveMappings(activeMappings.map(m => ({ ...m, expression: "" }))); setShowEnhDropdown(false); }}
                      className="flex flex-col w-full px-3 py-2 text-left transition-colors hover:bg-red-900/20">
                      <span className="text-xs font-medium" style={{ color: "#f85149" }}>Expression 초기화</span>
                      <span className="text-[10px]" style={{ color: "#64748b" }}>전체 행의 Expression을 비웁니다</span>
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => setActiveMappings([])}
                className="px-2 py-1 text-[11px] rounded transition-colors"
                style={{ background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#f85149")}
                onMouseLeave={e => (e.currentTarget.style.color = "#64748b")}
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* ── Body: 3-panel Talend layout ── */}
        <div ref={bodyRef} className="flex-1 flex min-h-0 relative overflow-hidden" onClick={() => setOpenColSelectRowId(null)}>
          {/* SVG Connection Lines Overlay — DOM 직접 조작 (recalcPaths) */}
          <svg
            ref={svgRef}
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 10, width: "100%", height: "100%" }}
          />

          {/* LEFT: Input Source Panels */}
          <div
            ref={sourcePanelRef}
            onScroll={recalcPaths}
            className="w-[30%] flex-shrink-0 overflow-y-auto"
            style={{ background: "#ffffff", borderRight: "1px solid #e2e8f0", position: "relative", zIndex: 1 }}
          >
            {loadingCount > 0 && (
              <div className="flex justify-center py-6"><Spinner size="sm" /></div>
            )}
            {sourceGroups.length === 0 && loadingCount === 0 && (
              <div className="p-4 text-xs text-center" style={{ color: "#94a3b8" }}>연결된 Input 노드가 없습니다</div>
            )}
            {sourceGroups.map(group => (
              <div key={group.nodeId} className="mb-1">
                {/* Source group header — Talend style */}
                <div
                  className="px-3 py-2 flex items-center gap-2"
                  style={{ background: group.color + "22", borderLeft: `3px solid ${group.color}`, borderBottom: `1px solid ${group.color}44` }}
                >
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: group.color }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: group.color }}>{group.nodeLabel}</p>
                    <p className="text-[10px] truncate" style={{ color: "#94a3b8" }}>{group.tableName || "(테이블 미설정)"}</p>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: group.color + "22", color: group.color }}>
                    {group.columns.length}
                  </span>
                </div>

                {/* Column header */}
                <div className="flex items-center px-3 py-1" style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <span className="text-[9px] font-semibold uppercase tracking-wider flex-1" style={{ color: "#94a3b8" }}>Column</span>
                  <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "#94a3b8" }}>Type</span>
                </div>

                {group.loading ? (
                  <div className="flex justify-center py-4"><Spinner size="sm" /></div>
                ) : group.columns.length === 0 ? (
                  <div className="px-3 py-2 text-xs" style={{ color: "#94a3b8" }}>컬럼 정보 없음</div>
                ) : (
                  group.columns.map(col => {
                    const refKey = `${group.nodeId}:${col.columnName}`;
                    const isSelected = selectedSourceCol?.nodeId === group.nodeId && selectedSourceCol.col === col.columnName;
                    const mapped = isMapped(group.nodeId, col.columnName);
                    return (
                      <div
                        key={col.columnName}
                        ref={el => { if (el) sourceRowRefs.current.set(refKey, el); else sourceRowRefs.current.delete(refKey); }}
                        onClick={() => handleSourceClick(group.nodeId, col.columnName)}
                        draggable
                        onDragStart={() => setDraggedSource({ nodeId: group.nodeId, col: col.columnName })}
                        onDragEnd={() => setDraggedSource(null)}
                        className="flex items-center gap-1.5 px-3 cursor-grab select-none transition-colors"
                        style={{
                          height: 28,
                          borderBottom: "1px solid #f1f5f9",
                          background: isSelected ? group.color + "33" : mapped ? group.color + "18" : undefined,
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = group.color + "15"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = isSelected ? group.color + "33" : mapped ? group.color + "18" : ""; }}
                      >
                        {/* PK indicator */}
                        {col.isPrimaryKey ? (
                          <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24" style={{ color: "#e3b341" }}>
                            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4a3 3 0 110 6 3 3 0 010-6zm0 8c-2.67 0-8 1.34-8 4v1h16v-1c0-2.66-5.33-4-8-4z" />
                          </svg>
                        ) : (
                          <span className="w-3 h-3 flex-shrink-0 flex items-center justify-center">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: mapped ? group.color : "#e2e8f0", boxShadow: mapped ? `0 0 5px ${group.color}` : undefined }} />
                          </span>
                        )}
                        <span className="flex-1 text-[11px] font-mono truncate" style={{ color: mapped ? group.color : isSelected ? "#1e293b" : "#334155" }}>
                          {col.columnName}
                        </span>
                        <span className="text-[9px] flex-shrink-0 ml-1" style={{ color: "#94a3b8" }}>{col.dataType.split("(")[0]}</span>
                        {/* Right connector dot */}
                        <span className="w-3 h-2 rounded-full flex-shrink-0 ml-1"
                          style={{ background: mapped ? group.color : "#e2e8f0", border: `1px solid ${mapped ? group.color : "#e2e8f0"}`, boxShadow: mapped ? `0 0 4px ${group.color}88` : undefined }} />
                      </div>
                    );
                  })
                )}
              </div>
            ))}
          </div>

          {/* MIDDLE: Connection zone — 타겟 row 드롭 시 연결 해제 */}
          <div
            className="w-[18%] flex-shrink-0"
            style={{ background: draggedTargetRowId ? "#fee2e2" : "#f0f4f8", transition: "background 0.15s" }}
            onDragOver={e => { if (draggedTargetRowId) e.preventDefault(); }}
            onDragLeave={() => {}}
            onDrop={() => handleDisconnectTarget()}
          />

          {/* RIGHT: Output Mapping */}
          <div className="flex-1 flex flex-col min-w-0" style={{ background: "#ffffff", position: "relative", zIndex: 1 }}>
            {/* 통 수직 구분선: Column|Expression, Expression|Type */}
            <div className="absolute inset-y-0 pointer-events-none" style={{ left: "calc(17px + 33%)", width: 1, background: "#e2e8f0", zIndex: 2 }} />
            <div className="absolute inset-y-0 pointer-events-none" style={{ left: "calc(100% - 126px)", width: 1, background: "#e2e8f0", zIndex: 2 }} />
            {!activeOutputId ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm" style={{ color: "#94a3b8" }}>Output 탭을 선택하세요</p>
              </div>
            ) : (
              <>
                {/* DB Output header — 소스 패널 group header와 동일 스타일 */}
                {(() => {
                  const activeOut = outputTabs.find(o => o.id === activeOutputId);
                  const outColor = "#388bfd";
                  const mappingCount = activeMappings.length;
                  return activeOut ? (
                    <div
                      className="px-3 py-2 flex items-center gap-2 flex-shrink-0"
                      style={{ background: outColor + "18", borderLeft: `3px solid ${outColor}`, borderBottom: `1px solid ${outColor}44` }}
                    >
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: outColor }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: outColor }}>{activeOut.label}</p>
                        <p className="text-[10px] truncate" style={{ color: "#94a3b8" }}>{activeOut.tableName || "(테이블 미설정)"}</p>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: outColor + "22", color: outColor }}>
                        {mappingCount}
                      </span>
                    </div>
                  ) : null;
                })()}

                {/* Column header row */}
                <div
                  className="flex items-center pl-1 pr-2 py-1.5 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#94a3b8" }}
                >
                  <span className="w-3 flex-shrink-0" />
                  <span className="w-[33%] flex-shrink-0 px-2">Column</span>
                  <span className="flex-1 pl-4 pr-2">Expression</span>
                  <span className="w-[90px] flex-shrink-0 px-2">Type</span>
                  <span className="w-7 flex-shrink-0" />
                </div>

                {/* Mapping rows */}
                <div
                  ref={targetPanelRef}
                  onScroll={recalcPaths}
                  className="flex-1 overflow-y-auto"
                >
                  {activeMappings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "#94a3b8" }}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                      </div>
                      <p className="text-xs" style={{ color: "#94a3b8" }}>소스 컬럼 선택 후 행 추가 또는 Auto Map을 클릭하세요</p>
                    </div>
                  ) : (
                    <>
                      {activeMappings.map(m => {
                        const color = m.sourceNodeId ? getSourceColor(m.sourceNodeId) : "#484f58";
                        const isClickTarget = !!selectedSourceCol;
                        const srcType = getSourceType(m.sourceNodeId, m.sourceColumn);
                        const tgtType = activeTargetMap.get(m.targetName.toLowerCase()) ?? m.type;
                        const castResult = srcType && m.sourceColumn
                          ? resolveCast(srcType, tgtType, m.sourceColumn)
                          : { castRequired: false, expression: "", severity: "none" as const, warning: undefined };
                        const rowBg = castResult.severity === "warning" ? "#fef9c3" : castResult.severity === "danger" ? "#fee2e2" : undefined;
                        const enhList = ENHANCEMENTS[normalizeType(m.type)] ?? [];
                        return (
                          <div
                            key={m.id}
                            ref={el => { if (el) targetRowRefs.current.set(m.id, el); else targetRowRefs.current.delete(m.id); }}
                            onClick={() => { if (isClickTarget) handleTargetClick(m.id); setPopoverRowId(null); setOpenColSelectRowId(null); }}
                            draggable={!!m.sourceNodeId}
                            onDragStart={() => { if (m.sourceNodeId) { setDraggedTargetRowId(m.id); setOpenColSelectRowId(null); } }}
                            onDragEnd={() => setDraggedTargetRowId(null)}
                            onDragOver={e => { if (!draggedSource) return; e.preventDefault(); if (!rowBg) e.currentTarget.style.background = color + "33"; }}
                            onDragLeave={e => { e.currentTarget.style.background = rowBg ?? ""; }}
                            onDrop={e => { if (!draggedSource) return; e.preventDefault(); e.currentTarget.style.background = rowBg ?? ""; handleDropOnRow(m.id); }}
                            className="flex items-center pl-1 pr-2 group transition-colors"
                            style={{
                              height: 28,
                              borderBottom: "1px solid #f1f5f9",
                              background: rowBg ?? undefined,
                              cursor: isClickTarget ? "pointer" : draggedSource ? "copy" : "default",
                            }}
                            onMouseEnter={e => { if (!rowBg) e.currentTarget.style.background = isClickTarget ? color + "22" : "#f8fafc"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = rowBg ?? ""; }}
                          >
                            {/* Left connector dot — 드래그 핸들 (연결 해제) */}
                            <span
                              className="w-3 flex-shrink-0 flex items-center justify-center"
                              style={{ marginRight: 1, cursor: m.sourceNodeId ? "grab" : "default" }}
                              draggable={!!m.sourceNodeId}
                              onDragStart={e => { e.stopPropagation(); if (m.sourceNodeId) setDraggedTargetRowId(m.id); }}
                              onDragEnd={() => setDraggedTargetRowId(null)}
                            >
                              <span className="w-3 h-2 rounded-full"
                                style={{ background: m.sourceNodeId ? color : "#e2e8f0", border: `1px solid ${m.sourceNodeId ? color : "#e2e8f0"}`, boxShadow: m.sourceNodeId ? `0 0 4px ${color}88` : undefined }} />
                            </span>

                            {/* Target Column — 커스텀 드롭다운 */}
                            <div className="w-[33%] flex-shrink-0 px-2 relative">
                              {activeTargetMap.size > 0 ? (
                                <>
                                  <div
                                    className="flex items-center justify-between w-full cursor-pointer"
                                    onClick={e => { e.stopPropagation(); setOpenColSelectRowId(openColSelectRowId === m.id ? null : m.id); }}
                                  >
                                    <span className="text-[11px] font-mono truncate" style={{
                                      color: m.targetName && !activeTargetMap.has(m.targetName.toLowerCase())
                                        ? "#f85149" : m.targetName ? "#334155" : "#94a3b8"
                                    }}>
                                      {m.targetName || "target_column"}
                                    </span>
                                    <svg className="w-2.5 h-2.5 flex-shrink-0 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "#94a3b8" }}>
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </div>
                                  {openColSelectRowId === m.id && (
                                    <div
                                      className="absolute left-0 top-full z-50 min-w-full max-h-44 overflow-y-auto rounded-md shadow-lg"
                                      style={{ background: "#fff", border: "1px solid #e2e8f0", marginTop: 2 }}
                                      onClick={e => e.stopPropagation()}
                                    >
                                      <div
                                        className="px-2 py-1 text-[11px] font-mono cursor-pointer"
                                        style={{ color: "#94a3b8", borderBottom: "1px solid #f1f5f9" }}
                                        onMouseEnter={e => (e.currentTarget.style.background = "#f8fafc")}
                                        onMouseLeave={e => (e.currentTarget.style.background = "")}
                                        onClick={() => { updateMapping(m.id, "targetName", ""); setOpenColSelectRowId(null); }}
                                      >
                                        (없음)
                                      </div>
                                      {Array.from(activeTargetMap.keys()).map(col => (
                                        <div
                                          key={col}
                                          className="px-2 py-1 text-[11px] font-mono cursor-pointer"
                                          style={{ color: col === m.targetName ? "#2563eb" : "#334155", borderBottom: "1px solid #f1f5f9", background: col === m.targetName ? "#eff6ff" : "" }}
                                          onMouseEnter={e => { if (col !== m.targetName) e.currentTarget.style.background = "#f8fafc"; }}
                                          onMouseLeave={e => { e.currentTarget.style.background = col === m.targetName ? "#eff6ff" : ""; }}
                                          onClick={() => { updateMapping(m.id, "targetName", col); setOpenColSelectRowId(null); }}
                                        >
                                          {col}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <input
                                  value={m.targetName}
                                  onChange={e => updateMapping(m.id, "targetName", e.target.value)}
                                  onClick={e => e.stopPropagation()}
                                  placeholder="target_column"
                                  className="w-full bg-transparent text-[11px] font-mono focus:outline-none"
                                  style={{ color: "#334155", caretColor: "#1e293b" }}
                                />
                              )}
                            </div>

                            {/* Expression */}
                            <div className="flex-1 pl-4 pr-2 min-w-0">
                              <input
                                value={m.expression}
                                onChange={e => updateMapping(m.id, "expression", e.target.value)}
                                onClick={e => e.stopPropagation()}
                                placeholder={m.sourceColumn ? `${m.sourceNodeId ? (sourceGroups.find(g=>g.nodeId===m.sourceNodeId)?.nodeLabel ?? '') + '.' : ''}${m.sourceColumn}` : "expression"}
                                className="w-full bg-transparent text-[11px] font-mono focus:outline-none"
                                style={{
                                  color: m.expression ? "#7c3aed" : "#94a3b8",
                                  caretColor: "#1e293b",
                                  pointerEvents: draggedSource ? "none" : "auto",
                                }}
                              />
                            </div>

                            {/* Type */}
                            <div className="w-[90px] flex-shrink-0 flex items-center gap-0.5 px-1">
                              <select
                                value={m.type}
                                onChange={e => updateMapping(m.id, "type", e.target.value)}
                                onClick={e => e.stopPropagation()}
                                className="flex-1 min-w-0 bg-transparent text-[11px] focus:outline-none border-0 cursor-pointer"
                                style={{ color: "#64748b", pointerEvents: draggedSource ? "none" : "auto" }}
                              >
                                {!ALL_KNOWN_TYPES.has(m.type) && <option value={m.type}>{m.type}</option>}
                                {TYPE_COMMON.map(t => <option key={t} value={t}>{t}</option>)}
                                {(!targetDbType || targetDbType === "POSTGRESQL") && (
                                  <optgroup label="─── PostgreSQL ───">{TYPE_POSTGRESQL.map(t => <option key={t} value={t}>{t}</option>)}</optgroup>
                                )}
                                {(!targetDbType || targetDbType === "ORACLE") && (
                                  <optgroup label="──── Oracle ────">{TYPE_ORACLE.map(t => <option key={t} value={t}>{t}</option>)}</optgroup>
                                )}
                                {(!targetDbType || targetDbType === "MARIADB") && (
                                  <optgroup label="── MariaDB/MySQL ──">{TYPE_MARIADB.map(t => <option key={t} value={t}>{t}</option>)}</optgroup>
                                )}
                                {(!targetDbType || targetDbType === "MSSQL") && (
                                  <optgroup label="──── MS SQL ────">{TYPE_MSSQL.map(t => <option key={t} value={t}>{t}</option>)}</optgroup>
                                )}
                              </select>
                              {castResult.severity !== "none" && (
                                <button
                                  title={castResult.warning ?? "타입 변환 필요"}
                                  onClick={e => { e.stopPropagation(); if (castResult.expression) updateMapping(m.id, "expression", castResult.expression); }}
                                  className="flex-shrink-0 text-sm leading-none hover:opacity-70 transition-opacity cursor-pointer"
                                >
                                  {castResult.severity === "danger" ? "❌" : castResult.severity === "warning" ? "⚠️" : "ℹ️"}
                                </button>
                              )}
                            </div>

                            {/* Delete */}
                            <div className="w-7 flex-shrink-0 flex justify-center">
                              <button
                                onClick={e => { e.stopPropagation(); removeMapping(m.id); }}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all"
                                style={{ color: "#94a3b8" }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#f85149"; (e.currentTarget as HTMLElement).style.background = "#fee2e2"; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#94a3b8"; (e.currentTarget as HTMLElement).style.background = ""; }}
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}

                  {/* Add Row */}
                  <button
                    onClick={handleAddRow}
                    onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.background = "#1c3a6e44"; }}
                    onDragLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; }}
                    onDrop={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.background = ""; handleDropAddNew(); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors"
                    style={{ borderTop: "1px solid #e2e8f0", color: "#94a3b8" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#388bfd"; (e.currentTarget as HTMLElement).style.background = "#eff6ff"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#94a3b8"; (e.currentTarget as HTMLElement).style.background = ""; }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {selectedSourceCol ? `"${selectedSourceCol.col}" 행 추가` : "행 추가"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Warning Banner ── */}
        {showExprWarning && (
          <div className="flex items-start gap-3 px-5 py-3 flex-shrink-0" style={{ background: "#fef9c3", borderTop: "1px solid #fde68a" }}>
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "#e3b341" }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p className="text-xs" style={{ color: "#e3b341" }}>모든 ROW에 표현식을 적용할 경우 성능저하를 유발할 수 있습니다.</p>
          </div>
        )}

        {/* ── Footer ── */}
        <div
          className="flex items-center justify-between px-5 py-3 flex-shrink-0"
          style={{ borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}
        >
          <p className="text-xs" style={{ color: "#64748b" }}>
            {outputTabs.length}개 Output · 활성 탭 {activeMappings.length}개 매핑
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-1.5 text-sm rounded transition-colors" style={{ color: "#64748b" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#1e293b")}
              onMouseLeave={e => (e.currentTarget.style.color = "#64748b")}>
              취소
            </button>
            <button
              onClick={handleApply}
              className="px-5 py-1.5 text-sm font-medium rounded-md transition-colors"
              style={{ background: "#1f6feb", color: "#ffffff" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#388bfd")}
              onMouseLeave={e => (e.currentTarget.style.background = "#1f6feb")}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
