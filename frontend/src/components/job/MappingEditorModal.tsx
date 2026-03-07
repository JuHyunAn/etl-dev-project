import React, { useEffect, useState } from "react";
import { schemaApi } from "../../api";
import { Spinner } from "../ui";
import type { Node, Edge } from "@xyflow/react";
import type { ColumnInfo } from "../../types";
import {
  type MappingRow,
  getAutoExpression,
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

const ROW_COLORS = [
  "#2563eb",
  "#16a34a",
  "#7c3aed",
  "#ea580c",
  "#ca8a04",
  "#dc2626",
  "#0ea5e9",
  "#22c55e",
  "#a855f7",
  "#f97316",
];

interface Props {
  nodeId: string;
  nodeLabel: string;
  nodes: Node[];
  edges: Edge[];
  currentMappings: MappingRow[];
  onApply: (mappings: MappingRow[]) => void;
  onClose: () => void;
}

export default function MappingEditorModal({
  nodeId,
  nodeLabel,
  nodes,
  edges,
  currentMappings,
  onApply,
  onClose,
}: Props) {
  const [sourceGroups, setSourceGroups] = useState<SourceGroup[]>([]);
  // id/sourceNodeId 없는 AI 패치 JSON도 안전하게 초기화
  // outputColumn(파생 컬럼) → targetName 변환 포함
  const [mappings, setMappings] = useState<MappingRow[]>(() =>
    currentMappings.map((m, i) => {
      const raw = m as unknown as Record<string, unknown>;
      return {
        id: (raw.id as string) || `map-loaded-${i}-${Date.now()}`,
        sourceNodeId: (raw.sourceNodeId as string) || "",
        sourceColumn: (raw.sourceColumn as string) || "",
        targetName:
          (raw.targetName as string) || (raw.outputColumn as string) || "",
        expression: (raw.expression as string) || "",
        type: (raw.type as string) || "VARCHAR",
      };
    }),
  );
  const [selectedSourceCol, setSelectedSourceCol] = useState<{
    nodeId: string;
    col: string;
  } | null>(null);
  const [loadingCount, setLoadingCount] = useState(0);
  // 타겟 테이블 컬럼명(소문자) → dataType 맵
  const [targetColumnMap, setTargetColumnMap] = useState<Map<string, string>>(
    new Map(),
  );
  // 모든 컬럼 expression 작성 시 내부 경고 표시
  const [showExprWarning, setShowExprWarning] = useState(false);

  // Find nodes connected as inputs to this T_MAP node
  useEffect(() => {
    const inputEdges = edges.filter((e) => e.target === nodeId);
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

    // Load columns: use cached columns from node config first, fall back to API
    groups.forEach((g, idx) => {
      const node = nodes.find((n) => n.id === g.nodeId);
      const data = (node?.data ?? {}) as Record<string, unknown>;
      const config = (data.config ?? {}) as Record<string, unknown>;
      const cachedCols = Array.isArray(config.columns)
        ? (config.columns as import("../../types").ColumnInfo[])
        : null;

      if (cachedCols && cachedCols.length > 0) {
        // Use pre-loaded columns from node config — no API call needed
        setSourceGroups((prev) =>
          prev.map((p, i) =>
            i === idx ? { ...p, columns: cachedCols, loading: false } : p,
          ),
        );
        return;
      }

      if (!g.connectionId || !g.tableName) {
        setSourceGroups((prev) =>
          prev.map((p, i) => (i === idx ? { ...p, loading: false } : p)),
        );
        return;
      }

      setLoadingCount((c) => c + 1);
      const parts = g.tableName.split(".");
      const table = parts[parts.length - 1];
      const schema = parts.length > 1 ? parts[0] : undefined;
      schemaApi
        .getColumns(g.connectionId, table, schema)
        .then((cols) => {
          setSourceGroups((prev) =>
            prev.map((p, i) =>
              i === idx ? { ...p, columns: cols, loading: false } : p,
            ),
          );
        })
        .catch(() => {
          setSourceGroups((prev) =>
            prev.map((p, i) => (i === idx ? { ...p, loading: false } : p)),
          );
        })
        .finally(() => setLoadingCount((c) => c - 1));
    });
  }, [nodeId, nodes, edges]);

  // tMap 아웃풋 연결된 T_JDBC_OUTPUT 노드에서 타겟 컬럼 로드
  useEffect(() => {
    const outputEdges = edges.filter((e) => e.source === nodeId);
    for (const edge of outputEdges) {
      const node = nodes.find((n) => n.id === edge.target);
      const data = (node?.data ?? {}) as Record<string, unknown>;
      if (data.componentType !== "T_JDBC_OUTPUT") continue;

      const config = (data.config ?? {}) as Record<string, unknown>;
      const cachedCols = Array.isArray(config.columns)
        ? (config.columns as ColumnInfo[])
        : null;

      if (cachedCols && cachedCols.length > 0) {
        const map = new Map<string, string>();
        cachedCols.forEach((c) =>
          map.set(c.columnName.toLowerCase(), c.dataType),
        );
        setTargetColumnMap(map);
        return;
      }

      const connectionId = config.connectionId as string;
      const tableName = config.tableName as string;
      if (!connectionId || !tableName) continue;

      const parts = tableName.split(".");
      const table = parts[parts.length - 1];
      const schema = parts.length > 1 ? parts[0] : undefined;
      schemaApi
        .getColumns(connectionId, table, schema)
        .then((cols) => {
          const map = new Map<string, string>();
          cols.forEach((c) => map.set(c.columnName.toLowerCase(), c.dataType));
          setTargetColumnMap(map);
        })
        .catch(() => {});
      break; // 첫 번째 T_JDBC_OUTPUT만 사용
    }
  }, [nodeId, nodes, edges]);

  // sourceGroups 컬럼 로드 완료 후, sourceNodeId 없는 행(AI 패치 등)을 자동 매핑
  useEffect(() => {
    const allLoaded =
      sourceGroups.length > 0 && sourceGroups.every((g) => !g.loading);
    if (!allLoaded) return;
    setMappings((prev) =>
      prev.map((m) => {
        if (m.sourceNodeId || !m.sourceColumn) return m;
        for (const g of sourceGroups) {
          if (g.columns.some((c) => c.columnName === m.sourceColumn)) {
            return { ...m, sourceNodeId: g.nodeId };
          }
        }
        return m;
      }),
    );
  }, [sourceGroups]);

  const allSourceCols = sourceGroups.flatMap((g) =>
    g.columns.map((c) => ({
      nodeId: g.nodeId,
      nodeLabel: g.nodeLabel,
      col: c,
      color: g.color,
    })),
  );

  const handleAutoMap = () => {
    const auto: MappingRow[] = allSourceCols.map(
      ({ nodeId: nid, col }) =>
        buildAutoMappings(nid, [col], targetColumnMap)[0],
    );
    setMappings(auto);
    setSelectedSourceCol(null);
  };

  const handleSourceClick = (nodeId: string, colName: string) => {
    if (
      selectedSourceCol?.nodeId === nodeId &&
      selectedSourceCol?.col === colName
    ) {
      setSelectedSourceCol(null);
    } else {
      setSelectedSourceCol({ nodeId, col: colName });
    }
  };

  const handleAddRow = () => {
    if (selectedSourceCol) {
      const existingGroup = sourceGroups.find(
        (g) => g.nodeId === selectedSourceCol.nodeId,
      );
      const col = existingGroup?.columns.find(
        (c) => c.columnName === selectedSourceCol.col,
      );
      setMappings((prev) => [
        ...prev,
        {
          id: `map-${Date.now()}`,
          sourceNodeId: selectedSourceCol.nodeId,
          sourceColumn: selectedSourceCol.col,
          targetName: selectedSourceCol.col.toLowerCase(),
          expression: "",
          type:
            targetColumnMap.get(selectedSourceCol.col.toLowerCase()) ??
            col?.dataType ??
            "VARCHAR",
        },
      ]);
      setSelectedSourceCol(null);
    } else {
      setMappings((prev) => [
        ...prev,
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
    const col = allSourceCols.find(
      (c) =>
        c.nodeId === selectedSourceCol.nodeId &&
        c.col.columnName === selectedSourceCol.col,
    );
    setMappings((prev) =>
      prev.map((m) =>
        m.id === rowId
          ? {
              ...m,
              sourceNodeId: selectedSourceCol.nodeId,
              sourceColumn: selectedSourceCol.col,
              type: col?.col.dataType ?? m.type,
            }
          : m,
      ),
    );
    setSelectedSourceCol(null);
  };

  const updateMapping = (id: string, key: keyof MappingRow, value: string) => {
    setMappings((prev) =>
      prev.map((m) => (m.id === id ? { ...m, [key]: value } : m)),
    );
  };

  const removeMapping = (id: string) => {
    setMappings((prev) => prev.filter((m) => m.id !== id));
  };

  const getSourceColor = (nodeId: string) => {
    return sourceGroups.find((g) => g.nodeId === nodeId)?.color ?? "#64748b";
  };

  const isMapped = (nodeId: string, colName: string) =>
    mappings.some(
      (m) => m.sourceNodeId === nodeId && m.sourceColumn === colName,
    );

  const handleApply = () => {
    if (
      mappings.length > 0 &&
      mappings.every((m) => m.expression.trim() !== "") &&
      !showExprWarning
    ) {
      setShowExprWarning(true);
      return;
    }
    onApply(mappings);
    onClose();
  };

  const downloadSample = () => {
    const sample =
      mappings.length > 0
        ? mappings.map(({ id, ...rest }) => rest)
        : [
            {
              sourceNodeId: "",
              sourceColumn: "COL_A",
              targetName: "col_a",
              expression: "",
              type: "VARCHAR",
            },
          ];
    const blob = new Blob([JSON.stringify(sample, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mapping.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-5xl h-[80vh] rounded-xl shadow-2xl flex flex-col"
        style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0" style={{ borderBottom: '1px solid #e2e8f0' }}>
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: '#eff6ff' }}>
              <svg
                className="w-4 h-4 text-[#2563eb]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#0f172a]">
                Mapping Editor — {nodeLabel}
              </p>
              <p className="text-xs text-[#94a3b8]">
                {selectedSourceCol
                  ? `"${selectedSourceCol.col}" 선택됨 — 타겟 행을 클릭하여 연결하거나 [+ 행 추가] 클릭`
                  : "소스 컬럼 클릭 → 타겟 행 클릭으로 매핑 연결"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadSample}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#64748b]
                hover:text-[#374151] bg-[#f8fafc] rounded-md border border-[#d1d5db] transition-colors"
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
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              JSON 다운로드
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded text-[#94a3b8] hover:text-[#374151] hover:bg-[#f1f5f9] transition-colors"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* LEFT: Source Columns */}
          <div className="w-[260px] flex-shrink-0 flex flex-col" style={{ borderRight: '1px solid #e2e8f0' }}>
            <div className="px-3 py-2" style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <p className="text-xs font-semibold text-[#64748b] uppercase tracking-wider">
                Source Columns
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingCount > 0 && (
                <div className="flex justify-center py-4">
                  <Spinner size="sm" />
                </div>
              )}
              {sourceGroups.length === 0 && loadingCount === 0 && (
                <div className="p-4 text-xs text-[#94a3b8] text-center">
                  연결된 Input 노드가 없습니다
                </div>
              )}
              {sourceGroups.map((group) => (
                <div key={group.nodeId}>
                  {/* Node header */}
                  <div
                    className="px-3 py-2"
                    style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}
                    style={{ borderLeft: `3px solid ${group.color}` }}
                  >
                    <p
                      className="text-xs font-semibold truncate"
                      style={{ color: group.color }}
                    >
                      {group.nodeLabel}
                    </p>
                    <p className="text-[10px] text-[#94a3b8] truncate">
                      {group.tableName || "(테이블 미설정)"}
                    </p>
                  </div>
                  {group.loading ? (
                    <div className="flex justify-center py-3">
                      <Spinner size="sm" />
                    </div>
                  ) : group.columns.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-[#94a3b8]">
                      컬럼 정보 없음
                    </div>
                  ) : (
                    group.columns.map((col) => {
                      const isSelected =
                        selectedSourceCol?.nodeId === group.nodeId &&
                        selectedSourceCol.col === col.columnName;
                      const mapped = isMapped(group.nodeId, col.columnName);
                      return (
                        <div
                          key={col.columnName}
                          onClick={() =>
                            handleSourceClick(group.nodeId, col.columnName)
                          }
                          className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer
                            transition-colors select-none
                            ${
                              isSelected
                                ? "bg-[#eff6ff]"
                                : mapped
                                  ? "bg-[#f8fafc] opacity-60"
                                  : "hover:bg-[#f8fafc]"
                            }`}
                          style={{ borderBottom: '1px solid #f1f5f9' }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{
                              backgroundColor: mapped ? group.color : "#cbd5e1",
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {col.isPrimaryKey && (
                                <svg
                                  className="w-2.5 h-2.5 text-[#d29922] flex-shrink-0"
                                  fill="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path d="M21 10h-3.27l-1.44-2.5a1 1 0 00-1.73 0L13.12 10H3a1 1 0 000 2h1.29l1.7 2.95a1 1 0 00.87.5h.28a1 1 0 00.87-.5L9.71 12h4.58l1.7 2.95a1 1 0 00.87.5h.28a1 1 0 00.87-.5L19.71 12H21a1 1 0 000-2z" />
                                </svg>
                              )}
                              <span className="text-xs text-[#374151] truncate font-mono">
                                {col.columnName}
                              </span>
                            </div>
                            <span className="text-[10px] text-[#94a3b8]">
                              {col.dataType}
                            </span>
                          </div>
                          {isSelected && (
                            <svg
                              className="w-3 h-3 text-[#58a6ff] flex-shrink-0"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5l7 7-7 7"
                              />
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

          {/* RIGHT: Target Mappings */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <p className="text-xs font-semibold text-[#64748b] uppercase tracking-wider">
                Target Mappings
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAutoMap}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-[#2563eb]
                    bg-[#eff6ff] border border-[#93c5fd] rounded hover:bg-[#dbeafe] transition-colors"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  Auto Map
                </button>
                <button
                  onClick={() => setMappings([])}
                  className="px-2.5 py-1 text-xs text-[#64748b] hover:text-[#dc2626]
                    bg-[#f8fafc] rounded border border-[#d1d5db] transition-colors"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Column Headers */}
            <div
              className="grid grid-cols-[28px_1fr_1fr_1fr_80px_32px] gap-0 px-4 py-1.5 text-[10px] font-semibold text-[#64748b] uppercase tracking-wider flex-shrink-0"
              style={{ borderBottom: '1px solid #e2e8f0', background: '#f1f5f9' }}
            >
              <div />
              <div>Source Column</div>
              <div>Target Name</div>
              <div>Expression</div>
              <div>Type</div>
              <div />
            </div>

            {/* Mapping Rows */}
            <div className="flex-1 overflow-y-auto">
              {mappings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: '#f1f5f9', border: '1px solid #e2e8f0' }}>
                    <svg
                      className="w-5 h-5 text-[#94a3b8]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                      />
                    </svg>
                  </div>
                  <p className="text-xs text-[#94a3b8]">
                    소스 컬럼을 선택하거나 Auto Map을 클릭하세요
                  </p>
                </div>
              ) : (
                mappings.map((m, idx) => {
                  const color = m.sourceNodeId
                    ? getSourceColor(m.sourceNodeId)
                    : "#94a3b8";
                  const isClickTarget = !!selectedSourceCol;
                  return (
                    <div
                      key={m.id}
                      onClick={() => isClickTarget && handleTargetClick(m.id)}
                      className={`grid grid-cols-[28px_1fr_1fr_1fr_80px_32px] gap-0 items-center
                        px-4 py-1.5 group transition-colors
                        ${isClickTarget ? "cursor-pointer hover:bg-[#eff6ff]" : "hover:bg-[#f8fafc]"}`}
                      style={{ borderBottom: '1px solid #f1f5f9' }}
                    >
                      {/* Color dot + index */}
                      <div className="flex items-center">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: color }}
                        />
                      </div>

                      {/* Source Column */}
                      <div className="pr-2">
                        <select
                          value={`${m.sourceNodeId}::${m.sourceColumn}`}
                          onChange={(e) => {
                            const parts = e.target.value.split("::");
                            const nid = parts[0];
                            const col = parts.slice(1).join("::");
                            updateMapping(m.id, "sourceNodeId", nid);
                            updateMapping(m.id, "sourceColumn", col);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full bg-transparent text-xs text-[#374151] font-mono
                            focus:outline-none border-0 cursor-pointer"
                        >
                          <option value="::">-- 선택 --</option>
                          {/* sourceNodeId 미해결 상태(AI 패치 직후)에서 컬럼명 표시 */}
                          {!m.sourceNodeId && m.sourceColumn && (
                            <option value={`::${m.sourceColumn}`}>
                              {m.sourceColumn}
                            </option>
                          )}
                          {sourceGroups.map((g) => (
                            <optgroup key={g.nodeId} label={g.nodeLabel}>
                              {g.columns.map((c) => (
                                <option
                                  key={c.columnName}
                                  value={`${g.nodeId}::${c.columnName}`}
                                >
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
                          value={m.targetName}
                          onChange={(e) =>
                            updateMapping(m.id, "targetName", e.target.value)
                          }
                          onClick={(e) => e.stopPropagation()}
                          placeholder="target_column"
                          className="w-full bg-transparent text-xs text-[#374151] font-mono
                            focus:outline-none border-b border-transparent focus:border-[#2563eb] py-0.5"
                        />
                      </div>

                      {/* Expression */}
                      <div className="pr-2">
                        <input
                          value={m.expression}
                          onChange={(e) =>
                            updateMapping(m.id, "expression", e.target.value)
                          }
                          onClick={(e) => e.stopPropagation()}
                          placeholder="UPPER(col), COALESCE(...)"
                          className="w-full bg-transparent text-xs text-[#7c3aed] font-mono
                            focus:outline-none border-b border-transparent focus:border-[#2563eb] py-0.5"
                        />
                      </div>

                      {/* Type */}
                      <div className="pr-2">
                        <select
                          value={m.type}
                          onChange={(e) =>
                            updateMapping(m.id, "type", e.target.value)
                          }
                          onClick={(e) => e.stopPropagation()}
                          className="w-full bg-transparent text-xs text-[#64748b]
                            focus:outline-none border-0 cursor-pointer"
                        >
                          {[
                            "VARCHAR",
                            "INTEGER",
                            "BIGINT",
                            "DECIMAL",
                            "DATE",
                            "TIMESTAMP",
                            "BOOLEAN",
                            "CLOB",
                            "BLOB",
                          ].map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Delete */}
                      <div className="flex justify-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeMapping(m.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded
                            text-[#94a3b8] hover:text-[#dc2626] hover:bg-[#fef2f2] transition-all"
                        >
                          <svg
                            className="w-3 h-3"
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
                    </div>
                  );
                })
              )}

              {/* Add Row */}
              <button
                onClick={handleAddRow}
                className="flex items-center gap-2 w-full px-4 py-2.5 text-xs text-[#64748b]
                  hover:text-[#2563eb] hover:bg-[#eff6ff] transition-colors border-t border-[#e2e8f0]"
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
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                {selectedSourceCol
                  ? `"${selectedSourceCol.col}" 매핑 행 추가`
                  : "행 추가"}
              </button>
            </div>
          </div>
        </div>

        {/* 경고 배너 */}
        {showExprWarning && (
          <div
            className="flex items-start justify-between gap-3 px-5 py-3 border-t border-[#fbbf24]/40
            bg-[#fffbeb] flex-shrink-0"
          >
            <div className="flex items-start gap-2">
              <svg
                className="w-4 h-4 text-[#d29922] flex-shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                />
              </svg>
              <p className="text-xs text-[#d29922]">
                모든 ROW에 표현식을 적용할 경우, 성능저하를 유발할 수 있습니다.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* <button
                onClick={() => setShowExprWarning(false)}
                className="px-2.5 py-1 text-xs text-[#8b949e] hover:text-[#e6edf3] transition-colors">
                취소
              </button>
              <button
                onClick={() => { onApply(mappings); onClose() }}
                className="px-3 py-1 text-xs font-medium rounded bg-[#d29922] hover:bg-[#e3b341] text-black transition-colors">
                그래도 적용
              </button> */}
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-3 border-t border-[#e2e8f0] flex-shrink-0
          bg-[#f8fafc]"
        >
          <p className="text-xs text-[#94a3b8]">
            {mappings.length}개 매핑 · 소스 컬럼 선택 후 타겟 행 클릭으로 연결
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-[#64748b] hover:text-[#374151] transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleApply}
              className="px-5 py-2 text-sm font-medium rounded-md
                bg-[#232b37] hover:bg-[#2e3847] text-white transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
