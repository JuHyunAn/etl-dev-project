import React, { useEffect, useState, useMemo } from "react";
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
  "#2563eb",
  "#16a34a",
  "#7c3aed",
  "#ea580c",
  "#ca8a04",
  "#dc2626",
  "#0ea5e9",
  "#22c55e",
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-6xl h-[75vh] rounded-xl shadow-2xl flex flex-col"
        style={{ background: "#ffffff", border: "1px solid #e2e8f0" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 flex-shrink-0"
          style={{ borderBottom: "1px solid #e2e8f0" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-7 h-7 rounded flex items-center justify-center"
              style={{ background: "#eff6ff" }}
            >
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
                  ? `"${selectedSourceCol.col}" 선택됨 — 타겟 행을 클릭하여 연결`
                  : `${outputTabs.length}개 Output · 총 ${totalMappings}개 매핑`}
              </p>
            </div>
          </div>
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

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* LEFT: Source Columns */}
          <div
            className="w-[240px] flex-shrink-0 flex flex-col"
            style={{ borderRight: "1px solid #e2e8f0" }}
          >
            <div
              className="px-3 py-2 flex-shrink-0"
              style={{
                borderBottom: "1px solid #e2e8f0",
                background: "#f8fafc",
              }}
            >
              <p className="text-xs font-semibold text-[#64748b] uppercase tracking-wider">
                Source
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
                  <div
                    className="px-3 py-2"
                    style={{
                      background: "#f8fafc",
                      borderBottom: "1px solid #e2e8f0",
                      borderLeft: `3px solid ${group.color}`,
                    }}
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
                          className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors select-none
                            ${isSelected ? "bg-[#eff6ff]" : mapped ? "bg-[#f8fafc] opacity-60" : "hover:bg-[#f8fafc]"}`}
                          style={{ borderBottom: "1px solid #f1f5f9" }}
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
            {/* Output 탭 헤더 */}
            <div
              className="flex items-center flex-shrink-0"
              style={{
                borderBottom: "1px solid #e2e8f0",
                background: "#f8fafc",
              }}
            >
              <div className="flex flex-1 overflow-x-auto">
                {outputTabs.length === 0 ? (
                  <div className="px-4 py-2 text-xs text-[#94a3b8]">
                    T_JDBC_OUTPUT을 ROW 엣지로 연결하세요
                  </div>
                ) : (
                  outputTabs.map((out) => {
                    const isActive = activeOutputId === out.id;
                    const cnt = (mappingsByOutput[out.id] ?? []).length;
                    const wmc = writeModeColors[out.writeMode] ?? {
                      bg: "#f1f5f9",
                      text: "#64748b",
                    };
                    return (
                      <button
                        key={out.id}
                        onClick={() => {
                          setActiveOutputId(out.id);
                          setSelectedSourceCol(null);
                          setShowExprWarning(false);
                        }}
                        className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium flex-shrink-0 transition-colors border-b-2"
                        style={{
                          borderColor: isActive ? "#2563eb" : "transparent",
                          color: isActive ? "#2563eb" : "#64748b",
                          background: isActive ? "#ffffff" : "transparent",
                        }}
                      >
                        <svg
                          className="w-3 h-3 flex-shrink-0"
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
                        <span className="truncate max-w-[100px]">
                          {out.tableName || out.label}
                        </span>
                        <span
                          className="text-[9px] px-1 rounded font-medium flex-shrink-0"
                          style={{ background: wmc.bg, color: wmc.text }}
                        >
                          {out.writeMode}
                        </span>
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                          style={{
                            background: cnt > 0 ? "#dcfce7" : "#f1f5f9",
                            color: cnt > 0 ? "#16a34a" : "#94a3b8",
                          }}
                        >
                          {cnt}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              {/* 버튼 영역 */}
              {activeOutputId && (
                <div
                  className="flex items-center gap-2 px-3 flex-shrink-0"
                  style={{ borderLeft: "1px solid #e2e8f0" }}
                >
                  {/* Auto Map */}
                  <button
                    onClick={handleAutoMap}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-[#2563eb]
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

                  {/* Enhancements 드롭다운 */}
                  <div
                    className="relative"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => setShowEnhDropdown((v) => !v)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-[#ca8a04]
                        bg-[#fefce8] border border-[#fde68a] rounded hover:bg-[#fef9c3] transition-colors"
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
                          d="M5 3l14 9-14 9V3z"
                        />
                      </svg>
                      Enhancements ▾
                    </button>
                    {showEnhDropdown && (
                      <div
                        className="absolute right-0 top-full mt-1 w-64 rounded-lg shadow-xl z-20"
                        style={{
                          background: "#ffffff",
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        {BULK_ENHANCEMENTS.map((enh) => (
                          <button
                            key={enh.id}
                            onClick={() => handleApplyBulkEnh(enh.id)}
                            className="flex flex-col w-full px-3 py-2 text-left hover:bg-[#f8fafc] transition-colors"
                            style={{ borderBottom: "1px solid #f1f5f9" }}
                          >
                            <span className="text-xs font-medium text-[#374151]">
                              {enh.label}
                            </span>
                            <span className="text-[10px] text-[#94a3b8]">
                              {enh.description}
                            </span>
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            setActiveMappings(
                              activeMappings.map((m) => ({
                                ...m,
                                expression: "",
                              })),
                            );
                            setShowEnhDropdown(false);
                          }}
                          className="flex flex-col w-full px-3 py-2 text-left hover:bg-[#fef2f2] transition-colors"
                        >
                          <span className="text-xs font-medium text-[#dc2626]">
                            Expression 초기화
                          </span>
                          <span className="text-[10px] text-[#94a3b8]">
                            전체 행의 Expression을 비웁니다
                          </span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Clear */}
                  <button
                    onClick={() => setActiveMappings([])}
                    className="px-2.5 py-1.5 text-xs text-[#64748b] hover:text-[#dc2626]
                      bg-[#f8fafc] rounded border border-[#d1d5db] transition-colors"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {!activeOutputId && (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-[#94a3b8]">Output 탭을 선택하세요</p>
              </div>
            )}

            {activeOutputId && (
              <>
                {/* 컬럼 헤더 */}
                <div
                  className="grid grid-cols-[24px_1fr_1fr_1fr_90px_24px_32px] gap-0 px-4 py-1.5
                  text-[10px] font-semibold text-[#64748b] uppercase tracking-wider flex-shrink-0"
                  style={{
                    borderBottom: "1px solid #e2e8f0",
                    background: "#f1f5f9",
                  }}
                >
                  <div />
                  <div>Source Column</div>
                  <div>Target Column</div>
                  <div>Expression</div>
                  <div>Type</div>
                  <div />
                  <div />
                </div>

                {/* 매핑 행 */}
                <div className="flex-1 overflow-y-auto">
                  {activeMappings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{
                          background: "#f1f5f9",
                          border: "1px solid #e2e8f0",
                        }}
                      >
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
                        const color = m.sourceNodeId
                          ? getSourceColor(m.sourceNodeId)
                          : "#94a3b8";
                        const isClickTarget = !!selectedSourceCol;

                        // Tier 1: 타입 불일치 감지
                        const srcType = getSourceType(
                          m.sourceNodeId,
                          m.sourceColumn,
                        );
                        const tgtType =
                          activeTargetMap.get(m.targetName.toLowerCase()) ??
                          m.type;
                        const castResult =
                          srcType && m.sourceColumn
                            ? resolveCast(srcType, tgtType, m.sourceColumn)
                            : {
                                castRequired: false,
                                expression: "",
                                severity: "none" as const,
                                warning: undefined,
                              };

                        const rowBg =
                          castResult.severity === "warning"
                            ? "#fffbeb"
                            : castResult.severity === "danger"
                              ? "#fef2f2"
                              : undefined;

                        // Tier 2: Enhancement 목록
                        const enhList =
                          ENHANCEMENTS[normalizeType(m.type)] ?? [];

                        return (
                          <div
                            key={m.id}
                            onClick={() => {
                              if (isClickTarget) handleTargetClick(m.id);
                              setPopoverRowId(null);
                            }}
                            className={`grid grid-cols-[24px_1fr_1fr_1fr_90px_24px_32px] gap-0 items-center
                              px-4 py-1.5 group transition-colors
                              ${isClickTarget ? "cursor-pointer hover:bg-[#eff6ff]" : "hover:bg-[#f8fafc]"}`}
                            style={{
                              borderBottom: "1px solid #f1f5f9",
                              background: rowBg,
                            }}
                          >
                            {/* 색상 점 */}
                            <div>
                              <span
                                className="w-2 h-2 rounded-full block"
                                style={{ backgroundColor: color }}
                              />
                            </div>

                            {/* Source Column */}
                            <div className="pr-2">
                              <select
                                value={`${m.sourceNodeId}::${m.sourceColumn}`}
                                onChange={(e) => {
                                  const parts = e.target.value.split("::");
                                  updateMapping(m.id, "sourceNodeId", parts[0]);
                                  updateMapping(
                                    m.id,
                                    "sourceColumn",
                                    parts.slice(1).join("::"),
                                  );
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full bg-transparent text-xs text-[#374151] font-mono focus:outline-none border-0 cursor-pointer"
                              >
                                <option value="::">-- 선택 --</option>
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
                                list={
                                  activeTargetMap.size > 0
                                    ? "target-cols-datalist"
                                    : undefined
                                }
                                value={m.targetName}
                                onChange={(e) =>
                                  updateMapping(
                                    m.id,
                                    "targetName",
                                    e.target.value,
                                  )
                                }
                                onClick={(e) => e.stopPropagation()}
                                placeholder="target_column"
                                className={`w-full bg-transparent text-xs font-mono
                                  focus:outline-none border-b border-transparent focus:border-[#2563eb] py-0.5
                                  ${
                                    activeTargetMap.size > 0 &&
                                    m.targetName &&
                                    !activeTargetMap.has(
                                      m.targetName.toLowerCase(),
                                    )
                                      ? "text-[#dc2626]"
                                      : "text-[#374151]"
                                  }`}
                              />
                            </div>

                            {/* Expression */}
                            <div className="pr-2">
                              <input
                                value={m.expression}
                                onChange={(e) =>
                                  updateMapping(
                                    m.id,
                                    "expression",
                                    e.target.value,
                                  )
                                }
                                onClick={(e) => e.stopPropagation()}
                                placeholder="expression"
                                className={`w-full bg-transparent text-xs text-[#7c3aed] font-mono
                                  focus:outline-none border-b border-transparent focus:border-[#2563eb] py-0.5
                                  ${
                                    !m.sourceColumn && !m.expression
                                      ? "placeholder:text-[#dc2626]"
                                      : "placeholder:text-[#94a3b8]"
                                  }`}
                              />
                            </div>

                            {/* Type + cast 경고 아이콘 */}
                            <div className="pr-1 flex items-center gap-0.5 overflow-hidden">
                              <select
                                value={m.type}
                                onChange={(e) =>
                                  updateMapping(m.id, "type", e.target.value)
                                }
                                onClick={(e) => e.stopPropagation()}
                                className="flex-1 min-w-0 bg-transparent text-xs text-[#64748b] focus:outline-none border-0 cursor-pointer"
                              >
                                {!ALL_KNOWN_TYPES.has(m.type) && (
                                  <option value={m.type}>{m.type}</option>
                                )}
                                {TYPE_COMMON.map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                                {(!targetDbType ||
                                  targetDbType === "POSTGRESQL") && (
                                  <optgroup label="─── PostgreSQL ───">
                                    {TYPE_POSTGRESQL.map((t) => (
                                      <option key={t} value={t}>
                                        {t}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                {(!targetDbType ||
                                  targetDbType === "ORACLE") && (
                                  <optgroup label="──── Oracle ────">
                                    {TYPE_ORACLE.map((t) => (
                                      <option key={t} value={t}>
                                        {t}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                {(!targetDbType ||
                                  targetDbType === "MARIADB") && (
                                  <optgroup label="── MariaDB / MySQL ──">
                                    {TYPE_MARIADB.map((t) => (
                                      <option key={t} value={t}>
                                        {t}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                {(!targetDbType ||
                                  targetDbType === "MSSQL") && (
                                  <optgroup label="──── MS SQL ────">
                                    {TYPE_MSSQL.map((t) => (
                                      <option key={t} value={t}>
                                        {t}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                              </select>
                              {castResult.severity !== "none" && (
                                <button
                                  title={castResult.warning ?? "타입 변환 필요"}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (castResult.expression) {
                                      updateMapping(
                                        m.id,
                                        "expression",
                                        castResult.expression,
                                      );
                                    }
                                  }}
                                  className="flex-shrink-0 text-sm leading-none hover:opacity-70 transition-opacity cursor-pointer"
                                >
                                  {castResult.severity === "danger"
                                    ? "❌"
                                    : castResult.severity === "warning"
                                      ? "⚠️"
                                      : "ℹ️"}
                                </button>
                              )}
                            </div>

                            {/* 💡 Enhancement 팝오버 */}
                            {/* <div className="flex justify-center relative" onMouseDown={(e) => e.stopPropagation()}>
                              {enhList.length > 0 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPopoverRowId(popoverRowId === m.id ? null : m.id);
                                  }}
                                  title="Expression 추천"
                                  className="text-sm leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                                  style={{ color: "#ca8a04" }}
                                >
                                  💡
                                </button>
                              )}
                              {popoverRowId === m.id && (
                                <div
                                  className="absolute right-0 bottom-full mb-1 w-52 rounded-lg shadow-xl z-30"
                                  style={{ background: "#ffffff", border: "1px solid #e2e8f0" }}
                                >
                                  <div className="px-3 py-1.5" style={{ borderBottom: "1px solid #f1f5f9" }}>
                                    <p className="text-[10px] font-semibold text-[#64748b] uppercase">
                                      {normalizeType(m.type)} 표현식 추천
                                    </p>
                                  </div>
                                  {enhList.map((enh) => (
                                    <button
                                      key={enh.label}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const col = m.sourceColumn || m.targetName;
                                        if (col) updateMapping(m.id, "expression", enh.apply(col));
                                        setPopoverRowId(null);
                                      }}
                                      className="flex items-center justify-between w-full px-3 py-1.5 text-left hover:bg-[#f8fafc] transition-colors"
                                      style={{ borderBottom: "1px solid #f1f5f9" }}
                                    >
                                      <span className="text-xs font-mono text-[#374151]">{enh.label}</span>
                                      <span className="text-[10px] text-[#94a3b8]">{enh.description}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div> */}

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
                      })}
                    </>
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
                      ? `"${selectedSourceCol.col}" 행 추가`
                      : "행 추가"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 경고 배너 */}
        {showExprWarning && (
          <div
            className="flex items-start gap-3 px-5 py-3 flex-shrink-0"
            style={{ borderTop: "1px solid #fbbf24/40", background: "#fffbeb" }}
          >
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
              모든 ROW에 표현식을 적용할 경우 성능저하를 유발할 수 있습니다.
            </p>
          </div>
        )}

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-3 flex-shrink-0"
          style={{ borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}
        >
          <p className="text-xs text-[#94a3b8]">
            {outputTabs.length}개 Output · 활성 탭 {activeMappings.length}개
            매핑
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
              className="px-5 py-2 text-sm font-medium rounded-md bg-[#232b37] hover:bg-[#2e3847] text-white transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
