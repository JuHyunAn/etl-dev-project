import React, { useEffect, useState } from "react";
import { schemaApi } from "../../api";
import { Spinner } from "../ui";
import type { Node, Edge } from "@xyflow/react";
import type { ColumnInfo } from "../../types";
import {
  type MappingRow,
  buildAutoMappings,
} from "../../utils/mapping";

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
}

const ROW_COLORS = [
  "#2563eb", "#16a34a", "#7c3aed", "#ea580c",
  "#ca8a04", "#dc2626", "#0ea5e9", "#22c55e",
];

interface Props {
  nodeId: string;
  nodeLabel: string;
  nodes: Node[];
  edges: Edge[];
  initialOutputNodeId?: string;                          // 특정 Output 탭으로 바로 열기
  currentMappingsByOutput: Record<string, MappingRow[]>; // output별 현재 매핑
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

  // Output 탭 목록
  const [outputTabs, setOutputTabs] = useState<OutputTab[]>([]);
  const [activeOutputId, setActiveOutputId] = useState<string>("");

  // Output별 매핑 상태
  const [mappingsByOutput, setMappingsByOutput] = useState<Record<string, MappingRow[]>>({});

  // Output별 타겟 컬럼맵
  const [targetMapsByOutput, setTargetMapsByOutput] = useState<Record<string, Map<string, string>>>({});

  const [selectedSourceCol, setSelectedSourceCol] = useState<{ nodeId: string; col: string } | null>(null);
  const [showExprWarning, setShowExprWarning] = useState(false);

  // ── 소스 그룹 (Input 노드) ─────────────────────────────────────
  useEffect(() => {
    const inputEdges = edges.filter((e) => {
      const lt = (e.data as Record<string, unknown>)?.linkType as string | undefined;
      return e.target === nodeId && (lt === "ROW" || lt === undefined || lt === null);
    });
    const inputNodeIds = inputEdges.map((e) => e.source);

    const groups: SourceGroup[] = inputNodeIds.map((nid, idx) => {
      const node = nodes.find((n) => n.id === nid);
      const data = (node?.data ?? {}) as Record<string, unknown>;
      const config = (data.config ?? {}) as Record<string, unknown>;
      return {
        nodeId: nid,
        nodeLabel: (data.label as string) ?? nid,
        connectionId: (config.connectionId as string) ?? "",
        tableName: (config.tableName as string) ?? "",
        columns: [],
        loading: true,
        color: ROW_COLORS[idx % ROW_COLORS.length],
      };
    });
    setSourceGroups(groups);

    groups.forEach((g, idx) => {
      const node = nodes.find((n) => n.id === g.nodeId);
      const data = (node?.data ?? {}) as Record<string, unknown>;
      const config = (data.config ?? {}) as Record<string, unknown>;
      const cachedCols = Array.isArray(config.columns)
        ? (config.columns as ColumnInfo[]) : null;

      if (cachedCols && cachedCols.length > 0) {
        setSourceGroups((prev) =>
          prev.map((p, i) => i === idx ? { ...p, columns: cachedCols, loading: false } : p)
        );
        return;
      }
      if (!g.connectionId || !g.tableName) {
        setSourceGroups((prev) =>
          prev.map((p, i) => i === idx ? { ...p, loading: false } : p)
        );
        return;
      }
      setLoadingCount((c) => c + 1);
      const parts = g.tableName.split(".");
      const table = parts[parts.length - 1];
      const schema = parts.length > 1 ? parts[0] : undefined;
      schemaApi.getColumns(g.connectionId, table, schema)
        .then((cols) => {
          setSourceGroups((prev) =>
            prev.map((p, i) => i === idx ? { ...p, columns: cols, loading: false } : p)
          );
        })
        .catch(() => {
          setSourceGroups((prev) =>
            prev.map((p, i) => i === idx ? { ...p, loading: false } : p)
          );
        })
        .finally(() => setLoadingCount((c) => c - 1));
    });
  }, [nodeId, nodes, edges]);

  // ── 연결된 모든 T_JDBC_OUTPUT 탐색 (BFS) ──────────────────────
  useEffect(() => {
    // ROW 엣지 forward BFS
    const rowEdgesBySource: Record<string, string[]> = {};
    edges.forEach((e) => {
      const lt = (e.data as Record<string, unknown>)?.linkType as string | undefined;
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
          });
          continue; // Output 아래는 더 탐색 안 함
        }
      }
      (rowEdgesBySource[cur] || []).forEach((t) => queue.push(t));
    }

    setOutputTabs(foundOutputs);

    // 초기 활성 탭: initialOutputNodeId 우선, 없으면 첫 번째
    const firstId = initialOutputNodeId ?? foundOutputs[0]?.id ?? "";
    setActiveOutputId(firstId);

    // 매핑 초기화: currentMappingsByOutput에서 로드, 없으면 빈 배열
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
            targetName: (raw.targetName as string) || (raw.outputColumn as string) || "",
            expression: (raw.expression as string) || "",
            type: (raw.type as string) || "VARCHAR",
          };
        });
      } else {
        initial[o.id] = [];
      }
    });
    setMappingsByOutput(initial);

    // 각 Output의 타겟 컬럼맵 로드
    foundOutputs.forEach((out) => {
      const node = nodes.find((n) => n.id === out.id);
      if (!node) return;
      const data = (node.data ?? {}) as Record<string, unknown>;
      const cfg = (data.config ?? {}) as Record<string, unknown>;
      const cachedCols = Array.isArray(cfg.columns) ? (cfg.columns as ColumnInfo[]) : null;

      if (cachedCols && cachedCols.length > 0) {
        const map = new Map<string, string>();
        cachedCols.forEach((c) => map.set(c.columnName.toLowerCase(), c.dataType));
        setTargetMapsByOutput((prev) => ({ ...prev, [out.id]: map }));
        return;
      }

      const connId = cfg.connectionId as string;
      const tableName = cfg.tableName as string;
      if (!connId || !tableName) return;

      const parts = tableName.split(".");
      const table = parts[parts.length - 1];
      const schema = parts.length > 1 ? parts[0] : undefined;
      schemaApi.getColumns(connId, table, schema)
        .then((cols) => {
          const map = new Map<string, string>();
          cols.forEach((c) => map.set(c.columnName.toLowerCase(), c.dataType));
          setTargetMapsByOutput((prev) => ({ ...prev, [out.id]: map }));
        })
        .catch(() => {});
    });
  }, [nodeId, nodes, edges, initialOutputNodeId]);

  // ── sourceGroups 로드 후 sourceNodeId 미해결 행 보완 ─────────
  useEffect(() => {
    const allLoaded = sourceGroups.length > 0 && sourceGroups.every((g) => !g.loading);
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
  const activeTargetMap = targetMapsByOutput[activeOutputId] ?? new Map<string, string>();

  const allSourceCols = sourceGroups.flatMap((g) =>
    g.columns.map((c) => ({ nodeId: g.nodeId, nodeLabel: g.nodeLabel, col: c, color: g.color }))
  );

  // ── Auto Map (현재 활성 탭 기준) ──────────────────────────────
  const handleAutoMap = () => {
    const ts = Date.now();
    if (activeTargetMap.size > 0) {
      const auto: MappingRow[] = Array.from(activeTargetMap.entries()).map(
        ([targetCol, targetType], idx) => {
          const matched = allSourceCols.find(
            ({ col }) => col.columnName.toLowerCase() === targetCol
          );
          if (matched) {
            return buildAutoMappings(matched.nodeId, [matched.col], activeTargetMap)[0];
          }
          return {
            id: `auto-empty-${targetCol}-${ts}-${idx}`,
            sourceNodeId: "",
            sourceColumn: "",
            targetName: targetCol,
            expression: "",
            type: targetType,
          };
        }
      );
      setActiveMappings(auto);
    } else {
      const auto: MappingRow[] = allSourceCols.map(({ nodeId: nid, col }) =>
        buildAutoMappings(nid, [col], activeTargetMap)[0]
      );
      setActiveMappings(auto);
    }
    setSelectedSourceCol(null);
  };

  const handleSourceClick = (nid: string, colName: string) => {
    if (selectedSourceCol?.nodeId === nid && selectedSourceCol?.col === colName) {
      setSelectedSourceCol(null);
    } else {
      setSelectedSourceCol({ nodeId: nid, col: colName });
    }
  };

  const handleAddRow = () => {
    if (selectedSourceCol) {
      const g = sourceGroups.find((g) => g.nodeId === selectedSourceCol.nodeId);
      const col = g?.columns.find((c) => c.columnName === selectedSourceCol.col);
      setActiveMappings([
        ...activeMappings,
        {
          id: `map-${Date.now()}`,
          sourceNodeId: selectedSourceCol.nodeId,
          sourceColumn: selectedSourceCol.col,
          targetName: selectedSourceCol.col.toLowerCase(),
          expression: "",
          type: activeTargetMap.get(selectedSourceCol.col.toLowerCase()) ?? col?.dataType ?? "VARCHAR",
        },
      ]);
      setSelectedSourceCol(null);
    } else {
      setActiveMappings([
        ...activeMappings,
        { id: `map-${Date.now()}`, sourceNodeId: "", sourceColumn: "", targetName: "", expression: "", type: "VARCHAR" },
      ]);
    }
  };

  const handleTargetClick = (rowId: string) => {
    if (!selectedSourceCol) return;
    const col = allSourceCols.find(
      (c) => c.nodeId === selectedSourceCol.nodeId && c.col.columnName === selectedSourceCol.col
    );
    setActiveMappings(
      activeMappings.map((m) =>
        m.id === rowId
          ? { ...m, sourceNodeId: selectedSourceCol.nodeId, sourceColumn: selectedSourceCol.col, type: col?.col.dataType ?? m.type }
          : m
      )
    );
    setSelectedSourceCol(null);
  };

  const updateMapping = (id: string, key: keyof MappingRow, value: string) => {
    setActiveMappings(activeMappings.map((m) => (m.id === id ? { ...m, [key]: value } : m)));
  };

  const removeMapping = (id: string) => {
    setActiveMappings(activeMappings.filter((m) => m.id !== id));
  };

  const getSourceColor = (nid: string) =>
    sourceGroups.find((g) => g.nodeId === nid)?.color ?? "#64748b";

  const isMapped = (nid: string, colName: string) =>
    activeMappings.some((m) => m.sourceNodeId === nid && m.sourceColumn === colName);

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

  const writeModeColors: Record<string, { bg: string; text: string }> = {
    INSERT:          { bg: "#dbeafe", text: "#1d4ed8" },
    TRUNCATE_INSERT: { bg: "#fef9c3", text: "#92400e" },
    UPDATE:          { bg: "#dcfce7", text: "#166534" },
    UPSERT:          { bg: "#f3e8ff", text: "#6b21a8" },
  };

  const totalMappings = Object.values(mappingsByOutput).reduce((s, m) => s + m.length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-6xl h-[85vh] rounded-xl shadow-2xl flex flex-col"
        style={{ background: "#ffffff", border: "1px solid #e2e8f0" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0"
          style={{ borderBottom: "1px solid #e2e8f0" }}>
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: "#eff6ff" }}>
              <svg className="w-4 h-4 text-[#2563eb]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#0f172a]">Mapping Editor — {nodeLabel}</p>
              <p className="text-xs text-[#94a3b8]">
                {selectedSourceCol
                  ? `"${selectedSourceCol.col}" 선택됨 — 타겟 행을 클릭하여 연결`
                  : `${outputTabs.length}개 Output · 총 ${totalMappings}개 매핑`}
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded text-[#94a3b8] hover:text-[#374151] hover:bg-[#f1f5f9] transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* LEFT: Source Columns */}
          <div className="w-[240px] flex-shrink-0 flex flex-col" style={{ borderRight: "1px solid #e2e8f0" }}>
            <div className="px-3 py-2 flex-shrink-0" style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <p className="text-xs font-semibold text-[#64748b] uppercase tracking-wider">Source</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingCount > 0 && <div className="flex justify-center py-4"><Spinner size="sm" /></div>}
              {sourceGroups.length === 0 && loadingCount === 0 && (
                <div className="p-4 text-xs text-[#94a3b8] text-center">연결된 Input 노드가 없습니다</div>
              )}
              {sourceGroups.map((group) => (
                <div key={group.nodeId}>
                  <div className="px-3 py-2" style={{
                    background: "#f8fafc",
                    borderBottom: "1px solid #e2e8f0",
                    borderLeft: `3px solid ${group.color}`,
                  }}>
                    <p className="text-xs font-semibold truncate" style={{ color: group.color }}>
                      {group.nodeLabel}
                    </p>
                    <p className="text-[10px] text-[#94a3b8] truncate">
                      {group.tableName || "(테이블 미설정)"}
                    </p>
                  </div>
                  {group.loading ? (
                    <div className="flex justify-center py-3"><Spinner size="sm" /></div>
                  ) : group.columns.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-[#94a3b8]">컬럼 정보 없음</div>
                  ) : (
                    group.columns.map((col) => {
                      const isSelected = selectedSourceCol?.nodeId === group.nodeId && selectedSourceCol.col === col.columnName;
                      const mapped = isMapped(group.nodeId, col.columnName);
                      return (
                        <div key={col.columnName}
                          onClick={() => handleSourceClick(group.nodeId, col.columnName)}
                          className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors select-none
                            ${isSelected ? "bg-[#eff6ff]" : mapped ? "bg-[#f8fafc] opacity-60" : "hover:bg-[#f8fafc]"}`}
                          style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: mapped ? group.color : "#cbd5e1" }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {col.isPrimaryKey && (
                                <svg className="w-2.5 h-2.5 text-[#d29922] flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M21 10h-3.27l-1.44-2.5a1 1 0 00-1.73 0L13.12 10H3a1 1 0 000 2h1.29l1.7 2.95a1 1 0 00.87.5h.28a1 1 0 00.87-.5L9.71 12h4.58l1.7 2.95a1 1 0 00.87.5h.28a1 1 0 00.87-.5L19.71 12H21a1 1 0 000-2z" />
                                </svg>
                              )}
                              <span className="text-xs text-[#374151] truncate font-mono">{col.columnName}</span>
                            </div>
                            <span className="text-[10px] text-[#94a3b8]">{col.dataType}</span>
                          </div>
                          {isSelected && (
                            <svg className="w-3 h-3 text-[#58a6ff] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: Target Mappings (Output 탭) */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Output 탭 헤더 */}
            <div className="flex items-center flex-shrink-0" style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              {/* 탭 버튼 */}
              <div className="flex flex-1 overflow-x-auto">
                {outputTabs.length === 0 ? (
                  <div className="px-4 py-2 text-xs text-[#94a3b8]">
                    T_JDBC_OUTPUT을 ROW 엣지로 연결하세요
                  </div>
                ) : (
                  outputTabs.map((out) => {
                    const isActive = activeOutputId === out.id;
                    const cnt = (mappingsByOutput[out.id] ?? []).length;
                    const wmc = writeModeColors[out.writeMode] ?? { bg: "#f1f5f9", text: "#64748b" };
                    return (
                      <button key={out.id}
                        onClick={() => { setActiveOutputId(out.id); setSelectedSourceCol(null); setShowExprWarning(false); }}
                        className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium flex-shrink-0 transition-colors border-b-2"
                        style={{
                          borderColor: isActive ? "#2563eb" : "transparent",
                          color: isActive ? "#2563eb" : "#64748b",
                          background: isActive ? "#ffffff" : "transparent",
                        }}>
                        <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                        </svg>
                        <span className="truncate max-w-[100px]">{out.tableName || out.label}</span>
                        <span className="text-[9px] px-1 rounded font-medium flex-shrink-0"
                          style={{ background: wmc.bg, color: wmc.text }}>
                          {out.writeMode}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                          style={{
                            background: cnt > 0 ? "#dcfce7" : "#f1f5f9",
                            color: cnt > 0 ? "#16a34a" : "#94a3b8",
                          }}>
                          {cnt}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
              {/* Auto Map / Clear 버튼 */}
              {activeOutputId && (
                <div className="flex items-center gap-2 px-3 flex-shrink-0" style={{ borderLeft: "1px solid #e2e8f0" }}>
                  <button onClick={handleAutoMap}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-[#2563eb]
                      bg-[#eff6ff] border border-[#93c5fd] rounded hover:bg-[#dbeafe] transition-colors">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Auto Map
                  </button>
                  <button onClick={() => setActiveMappings([])}
                    className="px-2.5 py-1.5 text-xs text-[#64748b] hover:text-[#dc2626]
                      bg-[#f8fafc] rounded border border-[#d1d5db] transition-colors">
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* 활성 Output 없을 때 */}
            {!activeOutputId && (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-[#94a3b8]">Output 탭을 선택하세요</p>
              </div>
            )}

            {/* 컬럼 헤더 */}
            {activeOutputId && (
              <>
                <div className="grid grid-cols-[24px_1fr_1fr_1fr_80px_32px] gap-0 px-4 py-1.5
                  text-[10px] font-semibold text-[#64748b] uppercase tracking-wider flex-shrink-0"
                  style={{ borderBottom: "1px solid #e2e8f0", background: "#f1f5f9" }}>
                  <div />
                  <div>Source Column</div>
                  <div>Target Name</div>
                  <div>Expression</div>
                  <div>Type</div>
                  <div />
                </div>

                {/* 매핑 행 */}
                <div className="flex-1 overflow-y-auto">
                  {activeMappings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ background: "#f1f5f9", border: "1px solid #e2e8f0" }}>
                        <svg className="w-5 h-5 text-[#94a3b8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                      </div>
                      <p className="text-xs text-[#94a3b8]">
                        소스 컬럼 선택 후 행 추가 또는 Auto Map을 클릭하세요
                      </p>
                    </div>
                  ) : (
                    <>
                      {activeTargetMap.size > 0 && (
                        <datalist id="target-cols-datalist">
                          {Array.from(activeTargetMap.keys()).map((col) => (
                            <option key={col} value={col} />
                          ))}
                        </datalist>
                      )}
                      {activeMappings.map((m) => {
                        const color = m.sourceNodeId ? getSourceColor(m.sourceNodeId) : "#94a3b8";
                        const isClickTarget = !!selectedSourceCol;
                        return (
                          <div key={m.id}
                            onClick={() => isClickTarget && handleTargetClick(m.id)}
                            className={`grid grid-cols-[24px_1fr_1fr_1fr_80px_32px] gap-0 items-center
                              px-4 py-1.5 group transition-colors
                              ${isClickTarget ? "cursor-pointer hover:bg-[#eff6ff]" : "hover:bg-[#f8fafc]"}`}
                            style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <div>
                              <span className="w-2 h-2 rounded-full block" style={{ backgroundColor: color }} />
                            </div>
                            {/* Source Column */}
                            <div className="pr-2">
                              <select
                                value={`${m.sourceNodeId}::${m.sourceColumn}`}
                                onChange={(e) => {
                                  const parts = e.target.value.split("::");
                                  updateMapping(m.id, "sourceNodeId", parts[0]);
                                  updateMapping(m.id, "sourceColumn", parts.slice(1).join("::"));
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full bg-transparent text-xs text-[#374151] font-mono focus:outline-none border-0 cursor-pointer">
                                <option value="::">-- 선택 --</option>
                                {!m.sourceNodeId && m.sourceColumn && (
                                  <option value={`::${m.sourceColumn}`}>{m.sourceColumn}</option>
                                )}
                                {sourceGroups.map((g) => (
                                  <optgroup key={g.nodeId} label={g.nodeLabel}>
                                    {g.columns.map((c) => (
                                      <option key={c.columnName} value={`${g.nodeId}::${c.columnName}`}>
                                        {c.columnName}
                                      </option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            </div>
                            {/* Target Name */}
                            <div className="pr-2">
                              <input
                                list={activeTargetMap.size > 0 ? "target-cols-datalist" : undefined}
                                value={m.targetName}
                                onChange={(e) => updateMapping(m.id, "targetName", e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="target_column"
                                className={`w-full bg-transparent text-xs font-mono
                                  focus:outline-none border-b border-transparent focus:border-[#2563eb] py-0.5
                                  ${activeTargetMap.size > 0 && m.targetName && !activeTargetMap.has(m.targetName.toLowerCase())
                                    ? "text-[#dc2626]" : "text-[#374151]"}`}
                              />
                            </div>
                            {/* Expression */}
                            <div className="pr-2">
                              <input
                                value={m.expression}
                                onChange={(e) => updateMapping(m.id, "expression", e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="UPPER(col)"
                                className="w-full bg-transparent text-xs text-[#7c3aed] font-mono
                                  focus:outline-none border-b border-transparent focus:border-[#2563eb] py-0.5"
                              />
                            </div>
                            {/* Type */}
                            <div className="pr-2">
                              <select value={m.type}
                                onChange={(e) => updateMapping(m.id, "type", e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full bg-transparent text-xs text-[#64748b] focus:outline-none border-0 cursor-pointer">
                                {["VARCHAR","INTEGER","BIGINT","DECIMAL","DATE","TIMESTAMP","BOOLEAN","CLOB","BLOB"].map((t) => (
                                  <option key={t} value={t}>{t}</option>
                                ))}
                              </select>
                            </div>
                            {/* Delete */}
                            <div className="flex justify-center">
                              <button
                                onClick={(e) => { e.stopPropagation(); removeMapping(m.id); }}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded
                                  text-[#94a3b8] hover:text-[#dc2626] hover:bg-[#fef2f2] transition-all">
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
                  <button onClick={handleAddRow}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-xs text-[#64748b]
                      hover:text-[#2563eb] hover:bg-[#eff6ff] transition-colors border-t border-[#e2e8f0]">
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

        {/* 경고 배너 */}
        {showExprWarning && (
          <div className="flex items-start gap-3 px-5 py-3 flex-shrink-0"
            style={{ borderTop: "1px solid #fbbf24/40", background: "#fffbeb" }}>
            <svg className="w-4 h-4 text-[#d29922] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p className="text-xs text-[#d29922]">모든 ROW에 표현식을 적용할 경우 성능저하를 유발할 수 있습니다.</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0"
          style={{ borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
          <p className="text-xs text-[#94a3b8]">
            {outputTabs.length}개 Output · 활성 탭 {activeMappings.length}개 매핑
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose}
              className="px-4 py-2 text-sm text-[#64748b] hover:text-[#374151] transition-colors">
              취소
            </button>
            <button onClick={handleApply}
              className="px-5 py-2 text-sm font-medium rounded-md bg-[#232b37] hover:bg-[#2e3847] text-white transition-colors">
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
