import React, { useEffect, useRef, useState } from "react";
import type { Node, Edge } from "@xyflow/react";
import { Spinner } from "../ui";
import {
  AI_MODELS,
  ENV_KEYS,
  DEFAULT_PROVIDER,
  sendAiMessage,
  extractGraphSpec,
  extractPatchSpec,
  type AiMessage,
  type AiProvider,
  type AiGraphSpec,
  type AiPatchSpec,
} from "../../api/ai";
import { schemaApi } from "../../api";
import type {
  Connection,
  TableInfo,
  ColumnInfo,
  ExecutionResult,
} from "../../types";

interface NodeData {
  label: string;
  componentType: string;
  config?: Record<string, unknown>;
}

interface Props {
  onApplyGraph: (spec: AiGraphSpec) => void;
  onPatchNodes: (patches: AiPatchSpec["patches"]) => void;
  connections: Connection[];
  executionResult?: ExecutionResult | null;
  nodes?: Node[];
  edges?: Edge[];
}

const PROVIDER_COLORS: Record<AiProvider, string> = {
  claude: "#bc8cff",
  openai: "#3fb950",
  gemini: "#58a6ff",
  grok: "#374151",
};

function JsonBlock({ raw }: { raw: string }) {
  const [expanded, setExpanded] = React.useState(false);

  // 요약: 포맷에 따라 다르게 표시
  let summary = "JSON";
  try {
    const parsed = JSON.parse(raw) as {
      action?: string;
      patches?: unknown[];
      nodes?: unknown[];
      edges?: unknown[];
    };
    if (parsed.action === "patch" && Array.isArray(parsed.patches)) {
      summary = `수정 제안 ${parsed.patches.length}개 노드`;
    } else if (Array.isArray(parsed.nodes)) {
      summary = `노드 ${parsed.nodes.length}개 · 엣지 ${parsed.edges?.length ?? 0}개`;
    }
  } catch {
    /* ignore */
  }

  return (
    <div
      className="my-2 rounded-md overflow-hidden"
      style={{ border: "1px solid #e2e8f0", background: "#f8fafc" }}
    >
      {/* 헤더 - 항상 표시 */}
      <button
        onClick={() => setExpanded((o) => !o)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-[#f0f4f8] transition-colors group"
      >
        <div className="flex items-center gap-1.5">
          <svg
            className="w-3 h-3 text-[#58a6ff]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
            />
          </svg>
          <span className="text-[10px] font-mono text-[#58a6ff]">JSON</span>
          <span className="text-[10px] text-[#94a3b8]">{summary}</span>
        </div>
        <svg
          className={`w-3 h-3 text-[#94a3b8] transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
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

      {/* 전체 JSON - 펼쳤을 때만 표시 */}
      {expanded && (
        <pre className="px-2.5 pb-2.5 text-[10px] font-mono text-[#2563eb] overflow-x-auto max-h-60 border-t border-[#e2e8f0]">
          {raw}
        </pre>
      )}
    </div>
  );
}

function CodeBlock({ text }: { text: string }) {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (!jsonMatch) return <span className="whitespace-pre-wrap">{text}</span>;

  const before = text.slice(0, text.indexOf("```"));
  const after = text.slice(text.indexOf("```") + jsonMatch[0].length);

  return (
    <>
      {before && <span className="whitespace-pre-wrap">{before}</span>}
      <JsonBlock raw={jsonMatch[1].trim()} />
      {after && <CodeBlock text={after} />}
    </>
  );
}

function buildConnectionContext(
  conn: Connection,
  tables: TableInfo[],
  columnMap: Record<string, ColumnInfo[]>,
): string {
  const tableLines = tables.map((t) => {
    const key = t.schemaName ? `${t.schemaName}.${t.tableName}` : t.tableName;
    const cols = columnMap[key];
    if (cols && cols.length) {
      const colDesc = cols
        .map(
          (c) =>
            `${c.columnName}(${c.dataType}${c.isPrimaryKey ? ",PK" : ""}${!c.nullable ? ",NN" : ""})`,
        )
        .join(", ");
      return `  - ${key}: [${colDesc}]`;
    }
    return `  - ${key}`;
  });

  return `Selected database connection for this pipeline:
Name: "${conn.name}" | id: "${conn.id}" | DB: ${conn.dbType} | host: ${conn.host}:${conn.port} | database: ${conn.database}${conn.schema ? ` | schema: ${conn.schema}` : ""}

Available tables and columns:
${tableLines.join("\n")}

RULES:
- Use ONLY the tables listed above for T_JDBC_INPUT and T_JDBC_OUTPUT nodes.
- Always set "connectionId": "${conn.id}" in the config.
- Use the exact table names (with schema prefix if shown) as the "tableName" value.
- If column info is available, use the actual column names for mappings.`;
}

function buildExecutionContext(result: ExecutionResult, nodes: Node[]): string {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const lines: string[] = [
    "=== ETL Execution Result ===",
    `Overall Status: ${result.status}${result.durationMs ? ` (total ${result.durationMs}ms)` : ""}`,
    "",
    "Node-by-Node Results:",
  ];

  Object.entries(result.nodeResults).forEach(([nodeId, nr]) => {
    const nd = nodeMap.get(nodeId)?.data as NodeData | undefined;
    const label = nd?.label ?? nodeId;
    const icon = nr.status === "SUCCESS" ? "✓" : "✗";
    const rows =
      nr.rowsProcessed !== undefined
        ? `, ${nr.rowsProcessed.toLocaleString()} rows`
        : "";
    const dur = nr.durationMs ? `, ${nr.durationMs}ms` : "";
    lines.push(
      `  ${icon} [${nr.nodeType}] "${label}": ${nr.status}${rows}${dur}`,
    );
    if (nr.errorMessage) lines.push(`      → Error: ${nr.errorMessage}`);
  });

  if (result.logs?.length) {
    lines.push("", "Execution Logs:");
    result.logs.forEach((log) => lines.push(`  ${log}`));
  }

  if (result.errorMessage) {
    lines.push("", `Global Error: ${result.errorMessage}`);
  }

  return lines.join("\n");
}

function buildPipelineContext(nodes: Node[], edges: Edge[]): string {
  if (nodes.length === 0) return "";
  const lines = [
    "=== Current Pipeline (use exact nodeIds when patching) ===",
    "Nodes:",
  ];
  nodes.forEach((n) => {
    const d = n.data as NodeData;
    const cfg = { ...(d.config ?? {}) };
    // columns 배열은 토큰 절약을 위해 개수만 표시
    if (Array.isArray(cfg.columns)) {
      (cfg as Record<string, unknown>).columns =
        `[${(cfg.columns as unknown[]).length} columns loaded]`;
    }
    const cfgStr = Object.keys(cfg).length
      ? `  config: ${JSON.stringify(cfg)}`
      : "";
    lines.push(
      `  nodeId: "${n.id}" | ${d.componentType} | label: "${d.label}"`,
    );
    if (cfgStr) lines.push(`  ${cfgStr}`);
  });
  lines.push("Edges:");
  edges.forEach((e) => {
    const src =
      (nodes.find((n) => n.id === e.source)?.data as NodeData)?.label ??
      e.source;
    const tgt =
      (nodes.find((n) => n.id === e.target)?.data as NodeData)?.label ??
      e.target;
    lines.push(`  "${src}"[${e.source}] → "${tgt}"[${e.target}]`);
  });
  return lines.join("\n");
}

export default function AiAgentPanel({
  onApplyGraph,
  onPatchNodes,
  connections,
  executionResult,
  nodes = [],
  edges = [],
}: Props) {
  const [provider, setProvider] = useState<AiProvider>(DEFAULT_PROVIDER);
  const [model, setModel] = useState(AI_MODELS[DEFAULT_PROVIDER].models[0].id);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [appliedPatches, setAppliedPatches] = useState<Set<number>>(new Set());
  const [flashedPatches, setFlashedPatches] = useState<Set<number>>(new Set());
  const [latestAssistantIdx, setLatestAssistantIdx] = useState<number | null>(
    null,
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  // 커넥션 선택
  const [selectedConnId, setSelectedConnId] = useState<string>("");
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, ColumnInfo[]>>({});
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState("");
  const [tableListOpen, setTableListOpen] = useState(false);

  const selectedConn = connections.find((c) => c.id === selectedConnId) ?? null;

  // 커넥션 선택 시 테이블 + 컬럼 로드
  useEffect(() => {
    if (!selectedConnId) {
      setTables([]);
      setColumnMap({});
      return;
    }
    setSchemaLoading(true);
    setSchemaError("");
    setTables([]);
    setColumnMap({});

    schemaApi
      .listTables(selectedConnId)
      .then(async (tbls) => {
        setTables(tbls);
        // 테이블별 컬럼 병렬 로드
        const results = await Promise.all(
          tbls.map((t) =>
            schemaApi
              .getColumns(
                selectedConnId,
                t.tableName,
                t.schemaName || undefined,
              )
              .then((cols) => ({
                key: t.schemaName
                  ? `${t.schemaName}.${t.tableName}`
                  : t.tableName,
                cols,
              }))
              .catch(() => ({
                key: t.schemaName
                  ? `${t.schemaName}.${t.tableName}`
                  : t.tableName,
                cols: [] as ColumnInfo[],
              })),
          ),
        );
        const map: Record<string, ColumnInfo[]> = {};
        results.forEach((r) => {
          map[r.key] = r.cols;
        });
        setColumnMap(map);
        console.group(
          `[AI Agent] "${connections.find((c) => c.id === selectedConnId)?.name}" 스키마 로드 완료`,
        );
        console.log("테이블 수:", tbls.length);
        tbls.forEach((t) => {
          const key = t.schemaName
            ? `${t.schemaName}.${t.tableName}`
            : t.tableName;
          console.log(`  ${key}:`, map[key]?.map((c) => c.columnName) ?? []);
        });
        console.groupEnd();
      })
      .catch((e) =>
        setSchemaError(e instanceof Error ? e.message : "스키마 로드 실패"),
      )
      .finally(() => setSchemaLoading(false));
  }, [selectedConnId]);

  const apiKey = ENV_KEYS[provider];
  const hasKey = !!apiKey;

  const handleProviderChange = (p: AiProvider) => {
    setProvider(p);
    setModel(AI_MODELS[p].models[0].id);
    setError("");
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const newMessages: AiMessage[] = [
      ...messages,
      { role: "user", content: text.trim() },
    ];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setError("");

    const contextParts: string[] = [];
    if (selectedConn)
      contextParts.push(
        buildConnectionContext(selectedConn, tables, columnMap),
      );
    if (nodes.length > 0) contextParts.push(buildPipelineContext(nodes, edges));
    if (executionResult)
      contextParts.push(buildExecutionContext(executionResult, nodes));
    const systemContext = contextParts.length
      ? contextParts.join("\n\n---\n\n")
      : undefined;

    try {
      const reply = await sendAiMessage(newMessages, {
        provider,
        model,
        apiKey,
        systemContext,
      });
      setMessages((prev) => {
        const updated = [...prev, { role: "assistant", content: reply }];
        setLatestAssistantIdx(updated.length - 1);
        return updated;
      });
      setTimeout(
        () => bottomRef.current?.scrollIntoView({ behavior: "smooth" }),
        50,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => sendMessage(input);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleApply = (content: string) => {
    const spec = extractGraphSpec(content);
    if (!spec) return;

    // T_JDBC_INPUT/OUTPUT 노드 config에 columnMap 데이터 주입
    const enriched = {
      ...spec,
      nodes: spec.nodes.map((n) => {
        if (n.type !== "T_JDBC_INPUT" && n.type !== "T_JDBC_OUTPUT") return n;
        const tableName = (n.config.tableName as string) ?? "";
        const cols =
          columnMap[tableName] ??
          columnMap[tableName.split(".").pop() ?? ""] ??
          [];
        if (!cols.length) return n;
        return { ...n, config: { ...n.config, columns: cols } };
      }),
    };
    onApplyGraph(enriched);
  };

  const clearChat = () => {
    setMessages([]);
    setError("");
  };

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden"
      style={{ background: "#ffffff", borderLeft: "1px solid #e2e8f0" }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 px-3 py-2.5"
        style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <div
              className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold"
              style={{
                backgroundColor: `${PROVIDER_COLORS[provider]}22`,
                color: PROVIDER_COLORS[provider],
              }}
            >
              AI
            </div>
            <span className="text-xs font-semibold text-[#0f172a]">
              AI Agent
            </span>
            {executionResult && (
              <span
                className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-medium ${
                  executionResult.status === "SUCCESS"
                    ? "bg-[#f0fdf4] text-[#16a34a] border border-[#86efac]"
                    : "bg-[#2d0f0f] text-[#f85149] border border-[#3d1a1a]"
                }`}
              >
                {executionResult.status === "SUCCESS"
                  ? "✓ 실행완료"
                  : "✗ 실행실패"}
              </span>
            )}
          </div>
          <button
            onClick={clearChat}
            className="text-[10px] text-[#94a3b8] hover:text-[#64748b] transition-colors"
          >
            대화 초기화
          </button>
        </div>

        {/* Provider + Model 선택 */}
        <div className="flex gap-1.5 mb-2">
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value as AiProvider)}
            className="flex-1 bg-[#f8fafc] border border-[#d1d5db] text-[#374151] rounded text-[10px] px-2 py-1
              focus:outline-none focus:border-[#58a6ff]"
          >
            {(Object.keys(AI_MODELS) as AiProvider[]).map((p) => (
              <option key={p} value={p}>
                {AI_MODELS[p].label}
              </option>
            ))}
          </select>
          <select
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setError("");
            }}
            className="flex-1 bg-[#f8fafc] border border-[#d1d5db] text-[#374151] rounded text-[10px] px-2 py-1
              focus:outline-none focus:border-[#58a6ff]"
          >
            {AI_MODELS[provider].models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* 커넥션 선택 */}
        <div className="mb-1.5">
          <select
            value={selectedConnId}
            onChange={(e) => setSelectedConnId(e.target.value)}
            className="w-full bg-[#f8fafc] border border-[#d1d5db] text-[#374151] rounded text-[10px] px-2 py-1
              focus:outline-none focus:border-[#58a6ff]"
          >
            <option value="">
              DB 커넥션 선택 (선택 시 테이블/컬럼 자동 로드)
            </option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.dbType})
              </option>
            ))}
          </select>
        </div>

        {/* 스키마 로딩 상태 */}
        {schemaLoading && (
          <div className="flex items-center gap-1.5 text-[9px] text-[#94a3b8] py-1">
            <Spinner size="sm" />
            <span>테이블 및 컬럼 로딩 중...</span>
          </div>
        )}
        {schemaError && (
          <p className="text-[9px] text-[#f85149] py-1">{schemaError}</p>
        )}
        {!schemaLoading && !schemaError && tables.length > 0 && (
          <button
            onClick={() => setTableListOpen((o) => !o)}
            className="w-full flex items-center justify-between text-[9px] text-[#3fb950] py-1 hover:text-[#56d364] transition-colors"
          >
            <span>
              ✓ {tables.length}개 테이블 ·{" "}
              {Object.values(columnMap).reduce((s, c) => s + c.length, 0)}개
              컬럼 로드됨
            </span>
            <span>{tableListOpen ? "▲" : "▼"}</span>
          </button>
        )}

        {/* 테이블 목록 펼치기 */}
        {tableListOpen && tables.length > 0 && (
          <div
            className="mt-1 max-h-32 overflow-y-auto rounded"
            style={{ border: "1px solid #e2e8f0", background: "#f8fafc" }}
          >
            {tables.map((t) => {
              const key = t.schemaName
                ? `${t.schemaName}.${t.tableName}`
                : t.tableName;
              const cols = columnMap[key] ?? [];
              return (
                <div
                  key={key}
                  className="px-2 py-1 border-b border-[#e2e8f0] last:border-0"
                >
                  <p className="text-[10px] text-[#79c0ff] font-mono">{key}</p>
                  {cols.length > 0 && (
                    <p className="text-[9px] text-[#94a3b8] truncate">
                      {cols.map((c) => c.columnName).join(", ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* API Key 미설정 경고 */}
        {!hasKey && (
          <div className="mt-2 px-2 py-1.5 rounded bg-[#2d1a07] border border-[#3d2c0a] flex items-start gap-1.5">
            <svg
              className="w-3 h-3 text-[#f0883e] flex-shrink-0 mt-0.5"
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
            <p className="text-[9px] text-[#f0883e] leading-relaxed">
              API 키 미설정. <code className="text-[#ffa657]">.env</code> 파일에
              <br />
              <code className="text-[#ffa657]">
                VITE_{provider.toUpperCase()}_API_KEY
              </code>{" "}
              를 입력하세요.
            </p>
          </div>
        )}
      </div>

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center -mt-16">
            <div
              className="w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center"
              style={{ backgroundColor: `${PROVIDER_COLORS[provider]}22` }}
            >
              <img src="/ai.png" alt="AI" className="w-6 h-6 object-contain" />
            </div>
            <p className="text-[14px] font-medium text-[#64748b]">
              ETL 파이프라인을 설명해주세요
            </p>
            <p className="text-[12px] text-[#94a3b8] mt-1">
              {selectedConn
                ? `"${selectedConn.name}" 커넥션의 테이블을 활용합니다`
                : "DB 커넥션을 선택하면 해당 테이블을 참조합니다."}
            </p>
          </div>
        )}

        {messages.map((msg, msgIdx) => (
          <div
            key={msgIdx}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div
                className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center mr-1.5 mt-0.5 text-[9px] font-bold"
                style={{
                  backgroundColor: `${PROVIDER_COLORS[provider]}22`,
                  color: PROVIDER_COLORS[provider],
                }}
              >
                AI
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-[11px] leading-relaxed
                ${
                  msg.role === "user"
                    ? "bg-[#2563eb] text-white rounded-tr-sm"
                    : "bg-[#f1f5f9] text-[#374151] rounded-tl-sm"
                }
                ${msg.role === "assistant" && msgIdx === latestAssistantIdx ? "ai-msg-highlight" : ""}`}
              onMouseEnter={() => {
                if (msgIdx === latestAssistantIdx) setLatestAssistantIdx(null);
              }}
            >
              {msg.role === "assistant" ? (
                <div>
                  <CodeBlock text={msg.content} />

                  {/* 새 파이프라인 생성 */}
                  {extractGraphSpec(msg.content) && (
                    <button
                      onClick={() => handleApply(msg.content)}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5
                        rounded-md bg-[#238636] hover:bg-[#2ea043] text-white text-[10px] font-medium
                        transition-colors"
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
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      캔버스에 적용
                    </button>
                  )}

                  {/* 기존 파이프라인 패치 */}
                  {(() => {
                    const patch = extractPatchSpec(msg.content);
                    if (!patch) return null;
                    const isApplied = appliedPatches.has(msgIdx);
                    return (
                      <div
                        className="mt-2 rounded-md overflow-hidden"
                        style={{
                          border: "1px solid #e2e8f0",
                          background: "#f8fafc",
                        }}
                      >
                        <div className="px-2.5 py-1.5 bg-[#1f1035] border-b border-[#3d2060] flex items-center gap-1.5">
                          <svg
                            className="w-3 h-3 text-[#bc8cff]"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                          <span className="text-[10px] font-semibold text-[#bc8cff]">
                            수정 제안 — {patch.patches.length}개 노드
                          </span>
                        </div>
                        <div className="divide-y divide-[#e2e8f0]">
                          {patch.patches.map((p, pi) => {
                            const nd = nodes.find((n) => n.id === p.nodeId)
                              ?.data as NodeData | undefined;
                            const label = nd?.label ?? p.nodeId;
                            const changedKeys = Object.keys(p.config ?? {});
                            return (
                              <div key={pi} className="px-2.5 py-2">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="text-[9px] px-1 py-0.5 rounded bg-[#1f1035] text-[#bc8cff] font-mono">
                                    {nd ? (nd as NodeData).componentType : "?"}
                                  </span>
                                  <span className="text-[10px] font-medium text-[#374151]">
                                    {label}
                                  </span>
                                </div>
                                {changedKeys.length > 0 && (
                                  <p className="text-[9px] text-[#94a3b8] font-mono">
                                    수정 키: {changedKeys.join(", ")}
                                  </p>
                                )}
                                {p.reason && (
                                  <p className="text-[9px] text-[#64748b] mt-0.5 leading-relaxed">
                                    {p.reason}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* 적용 버튼 */}
                        <div className="px-2.5 py-1.5 border-t border-[#3d2060]">
                          {!isApplied ? (
                            <button
                              onClick={() => {
                                onPatchNodes(patch.patches);
                                setAppliedPatches((prev) =>
                                  new Set(prev).add(msgIdx),
                                );
                              }}
                              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5
                                rounded-md bg-[#6e40c9] hover:bg-[#8957e5] text-white text-[10px] font-medium
                                transition-colors"
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
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                              파이프라인에 적용
                            </button>
                          ) : (
                            <>
                              {/* 적용 완료 — 재적용 가능 */}
                              <button
                                onClick={() => {
                                  onPatchNodes(patch.patches);
                                  setFlashedPatches((prev) =>
                                    new Set(prev).add(msgIdx),
                                  );
                                  setTimeout(
                                    () =>
                                      setFlashedPatches((prev) => {
                                        const s = new Set(prev);
                                        s.delete(msgIdx);
                                        return s;
                                      }),
                                    700,
                                  );
                                }}
                                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5
                                  rounded-md bg-[#f0fdf4] border border-[#86efac] text-[10px] font-medium text-[#16a34a]
                                  hover:bg-[#6e40c9] hover:border-[#6e40c9] hover:text-white transition-colors group"
                              >
                                <svg
                                  className="w-3 h-3 group-hover:hidden"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                                <span className="group-hover:hidden">
                                  적용 완료
                                </span>
                                <span className="hidden group-hover:inline">
                                  재적용
                                </span>
                              </button>

                              {/* 적용 요약 */}
                              <div className="mt-2 space-y-1">
                                {patch.patches.map((p, pi) => {
                                  const nd = nodes.find(
                                    (n) => n.id === p.nodeId,
                                  )?.data as NodeData | undefined;
                                  const label = nd?.label ?? p.nodeId;
                                  const changedKeys = Object.keys(
                                    p.config ?? {},
                                  );
                                  const isFlashing = flashedPatches.has(msgIdx);
                                  return (
                                    <div
                                      key={`${pi}-${isFlashing}`}
                                      className={`flex items-start gap-1.5 px-1 rounded transition-colors
                                        ${isFlashing ? "bg-[#1a4731] animate-pulse" : ""}`}
                                    >
                                      <span className="text-[#3fb950] text-[10px] flex-shrink-0 mt-px">
                                        ✓
                                      </span>
                                      <div className="min-w-0">
                                        <span className="text-[10px] text-[#374151] font-medium">
                                          {label}
                                        </span>
                                        {changedKeys.length > 0 && (
                                          <span className="text-[9px] text-[#94a3b8] ml-1">
                                            — {changedKeys.join(", ")} 수정됨
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <span className="whitespace-pre-wrap">{msg.content}</span>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start gap-1.5 items-center">
            <div
              className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-[9px] font-bold"
              style={{
                backgroundColor: `${PROVIDER_COLORS[provider]}22`,
                color: PROVIDER_COLORS[provider],
              }}
            >
              AI
            </div>
            <div className="flex items-center gap-1.5 bg-[#f1f5f9] rounded-lg px-3 py-2">
              <Spinner size="sm" />
              <span className="text-[10px] text-[#94a3b8]">생성 중...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="px-3 py-2 rounded-lg bg-[#2d0f0f] border border-[#3d1a1a] text-[10px] text-[#f85149]">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 빠른 액션 버튼 — 항상 표시, 상황에 따라 변경 */}
      <div
        className="flex-shrink-0 px-3 py-2"
        style={{ borderTop: "1px solid #e2e8f0" }}
      >
        <p className="text-[11px] text-[#94a3b8] mb-1.5 uppercase tracking-wider">
          빠른 질문
        </p>
        <div className="flex flex-wrap gap-1.5">
          {!executionResult ? (
            /* 실행 전: 파이프라인 설계 제안 */
            <>
              <button
                onClick={() =>
                  sendMessage(
                    "현재 파이프라인 구조를 검토하고 문제점이나 개선점을 알려줘.",
                  )
                }
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium
                  bg-[#f8fafc] border border-[#d1d5db] text-[#64748b]
                  hover:border-[#2563eb] hover:text-[#2563eb] transition-colors"
              >
                파이프라인 검토
              </button>
              <button
                onClick={() =>
                  sendMessage(
                    "이 파이프라인의 SQL을 최적화하는 방법을 제안해줘.",
                  )
                }
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium
                  bg-[#f8fafc] border border-[#d1d5db] text-[#64748b]
                  hover:border-[#2563eb] hover:text-[#2563eb] transition-colors"
              >
                SQL 최적화
              </button>
              <button
                onClick={() =>
                  sendMessage(
                    "현재 파이프라인에 데이터 검증 단계를 추가하려면 어떻게 해야 해?",
                  )
                }
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium
                  bg-[#f8fafc] border border-[#d1d5db] text-[#64748b]
                  hover:border-[#2563eb] hover:text-[#2563eb] transition-colors"
              >
                검증 단계 추가
              </button>
            </>
          ) : executionResult.status === "FAILED" ? (
            /* 실행 실패 — 자동 수정 활성 */
            <>
              <button
                onClick={() =>
                  sendMessage("이 에러의 원인을 분석하고 해결 방법을 알려줘.")
                }
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium
                  bg-[#fef2f2] border border-[#fca5a5] text-[#dc2626]
                  hover:bg-[#fee2e2] hover:border-[#dc2626] transition-colors"
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
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                  />
                </svg>
                에러 원인 분석
              </button>
              <button
                onClick={() =>
                  sendMessage(
                    "현재 파이프라인 구조를 검토하고 문제점을 설명해줘.",
                  )
                }
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium
                  bg-[#f8fafc] border border-[#d1d5db] text-[#64748b]
                  hover:border-[#94a3b8] transition-colors"
              >
                파이프라인 검토
              </button>
              <button
                onClick={() =>
                  sendMessage(
                    "파이프라인 에러를 분석하고 현재 nodeId를 사용해서 patch JSON으로 즉시 수정해줘.",
                  )
                }
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium
                  bg-[#1f1035] border border-[#3d2060] text-[#bc8cff]
                  hover:bg-[#2a1550] hover:border-[#bc8cff] transition-colors"
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
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                자동 수정
              </button>
            </>
          ) : (
            /* 실행 성공 — 자동 수정 비활성 */
            <>
              <button
                onClick={() =>
                  sendMessage("실행 결과를 분석하고 데이터 흐름을 요약해줘.")
                }
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium
                  bg-[#f0fdf4] border border-[#86efac] text-[#16a34a]
                  hover:bg-[#1a4731] hover:border-[#3fb950] transition-colors"
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
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                결과 분석
              </button>
              <button
                onClick={() =>
                  sendMessage(
                    "현재 파이프라인의 성능을 분석하고 최적화 방안을 제안해줘.",
                  )
                }
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium
                  bg-[#eff6ff] border border-[#93c5fd] text-[#2563eb]
                  hover:bg-[#1a3050] hover:border-[#58a6ff] transition-colors"
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
                최적화 제안
              </button>
              {/* 자동 수정 — SUCCESS 시 비활성 */}
              <button
                disabled
                title="JOB이 실패한 경우에만 사용 가능"
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium
                  bg-[#f1f5f9] border border-[#e2e8f0] text-[#cbd5e1] cursor-not-allowed"
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
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                자동 수정
              </button>
            </>
          )}
        </div>
      </div>

      {/* Input */}
      <div
        className="flex-shrink-0 p-3"
        style={{ borderTop: "1px solid #e2e8f0" }}
      >
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="파이프라인을 설명해주세요... (Enter 전송, Shift+Enter 줄바꿈)"
            rows={3}
            className="flex-1 rounded-lg px-3 py-2 text-[11px] focus:outline-none resize-none leading-relaxed"
            style={{
              background: "#f8fafc",
              border: "1px solid #d1d5db",
              color: "#0f172a",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#2563eb";
              e.target.style.boxShadow = "0 0 0 2px rgba(37,99,235,0.15)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "#d1d5db";
              e.target.style.boxShadow = "";
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors
              ${
                input.trim() && !loading
                  ? "bg-[#2563eb] hover:bg-[#1d4ed8] text-white"
                  : "bg-[#f1f5f9] text-[#cbd5e1] cursor-not-allowed"
              }`}
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
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </div>
        <p className="text-[9px] text-[#94a3b8] mt-1.5 text-center">
          AI가 생성한 JSON 블록의 "캔버스에 적용" 버튼으로 노드를 추가합니다
        </p>
      </div>
    </div>
  );
}
