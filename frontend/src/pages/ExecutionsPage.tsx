import React, { useEffect, useState } from "react";
import { executionApi } from "../api";
import { Badge, Card, Spinner } from "../components/ui";
import type { ExecutionResult, ExecutionStatus, ExecutionSummary } from "../types";

function statusVariant(s: ExecutionStatus): "success" | "error" | "warning" | "blue" | "default" {
  switch (s) {
    case "SUCCESS": return "success";
    case "FAILED":  return "error";
    case "RUNNING": return "blue";
    case "PENDING": return "warning";
    default:        return "default";
  }
}

function fmtDuration(ms?: number) {
  if (!ms) return null;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export default function ExecutionsPage() {
  const [list, setList] = useState<ExecutionSummary[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ExecutionResult | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    executionApi.listAll(page, 20)
      .then(res => {
        setList(res.content);
        setTotalPages(res.totalPages);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  const handleSelect = async (item: ExecutionSummary) => {
    if (selected?.executionId === item.id) { setSelected(null); return; }
    setDetailLoading(true);
    try {
      const detail = await executionApi.getDetail(item.id);
      setSelected(detail);
    } catch {
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto" style={{ background: "#ffffff" }}>
      {/* Header */}
      <div className="px-6 py-5" style={{ borderBottom: "1px solid #e2e8f0" }}>
        <div className="max-w-5xl mx-auto">
          <h1 className="text-xl font-bold" style={{ color: "#0f172a" }}>Run History</h1>
          <p className="text-sm mt-0.5" style={{ color: "#64748b" }}>Job 실행 이력</p>
        </div>
      </div>

      <div className="px-6 py-5">
        <div className="max-w-5xl mx-auto space-y-4">
          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : list.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <p className="text-sm font-medium" style={{ color: "#94a3b8" }}>No executions yet</p>
                <p className="text-xs" style={{ color: "#cbd5e1" }}>Job Designer에서 Job을 실행하면 여기에 기록됩니다.</p>
              </div>
            </Card>
          ) : (
            <>
              {/* 목록 */}
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>Job</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>Started</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>Duration</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((item, idx) => {
                      const isSelected = selected?.executionId === item.id;
                      return (
                        <tr
                          key={item.id}
                          onClick={() => handleSelect(item)}
                          className="cursor-pointer transition-colors"
                          style={{
                            borderBottom: idx < list.length - 1 ? "1px solid #f1f5f9" : undefined,
                            background: isSelected ? "#eff6ff" : undefined,
                          }}
                          onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "#f8fafc"; }}
                          onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = ""; }}
                        >
                          <td className="px-4 py-3">
                            <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium" style={{ color: "#0f172a" }}>{item.jobName}</p>
                            {item.previewMode && (
                              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#fef9c3", color: "#854d0e" }}>Preview</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono" style={{ color: "#64748b" }}>
                            {fmtDate(item.startedAt)}
                          </td>
                          <td className="px-4 py-3 text-xs tabular-nums" style={{ color: "#64748b" }}>
                            {fmtDuration(item.durationMs) ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#f1f5f9", color: "#475569" }}>
                              {item.triggeredBy}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 페이지네이션 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1.5 rounded-lg text-sm disabled:opacity-40"
                    style={{ border: "1px solid #e2e8f0", color: "#374151" }}
                  >← Prev</button>
                  <span className="text-sm" style={{ color: "#64748b" }}>{page + 1} / {totalPages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-3 py-1.5 rounded-lg text-sm disabled:opacity-40"
                    style={{ border: "1px solid #e2e8f0", color: "#374151" }}
                  >Next →</button>
                </div>
              )}

              {/* 상세 */}
              {detailLoading && (
                <div className="flex justify-center py-8"><Spinner size="md" /></div>
              )}
              {selected && !detailLoading && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748b" }}>
                    실행 상세 — {selected.executionId}
                  </p>
                  <ExecutionDetail result={selected} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ExecutionDetail({ result }: { result: ExecutionResult }) {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={statusVariant(result.status)}>{result.status}</Badge>
              <span className="text-xs font-mono" style={{ color: "#94a3b8" }}>{result.executionId}</span>
            </div>
            <p className="text-xs" style={{ color: "#64748b" }}>
              Started: {new Date(result.startedAt).toLocaleString()}
              {result.finishedAt && ` · Finished: ${new Date(result.finishedAt).toLocaleString()}`}
              {result.durationMs && ` · ${fmtDuration(result.durationMs)}`}
            </p>
          </div>
        </div>

        {result.errorMessage && (
          <div className="p-3 rounded-lg text-sm mb-4" style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626" }}>
            {result.errorMessage}
          </div>
        )}

        {Object.keys(result.nodeResults).length > 0 && (
          <div>
            <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: "#64748b" }}>Node Results</p>
            <div className="space-y-2">
              {Object.entries(result.nodeResults).map(([id, r]) => (
                <div key={id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{
                      background: r.status === "SUCCESS" ? "#22c55e" : r.status === "FAILED" ? "#ef4444" : r.status === "RUNNING" ? "#3b82f6" : "#94a3b8"
                    }} />
                    <div>
                      <p className="text-xs font-medium" style={{ color: "#0f172a" }}>{r.nodeType}</p>
                      {r.errorMessage && <p className="text-xs" style={{ color: "#ef4444" }}>{r.errorMessage}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs" style={{ color: "#64748b" }}>
                    {r.rowsProcessed > 0 && <span>{r.rowsProcessed.toLocaleString()} rows</span>}
                    {r.rowsRejected > 0 && <span style={{ color: "#f59e0b" }}>{r.rowsRejected} rejected</span>}
                    {r.durationMs > 0 && <span>{fmtDuration(r.durationMs)}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {result.logs.length > 0 && (
        <Card className="p-5">
          <p className="text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: "#64748b" }}>Execution Logs</p>
          <div className="rounded-lg p-4 font-mono text-xs space-y-1 max-h-80 overflow-y-auto" style={{ background: "#0f172a", border: "1px solid #1e293b" }}>
            {result.logs.map((log, i) => (
              <p key={i} className="leading-relaxed" style={{ color: "#94a3b8" }}>{log}</p>
            ))}
          </div>
        </Card>
      )}

      {Object.values(result.nodeResults).some(r => r.generatedSql) && (
        <Card className="p-5">
          <p className="text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: "#64748b" }}>Generated SQL</p>
          <div className="space-y-3">
            {Object.entries(result.nodeResults).filter(([, r]) => r.generatedSql).map(([id, r]) => (
              <div key={id}>
                <p className="text-xs mb-1" style={{ color: "#94a3b8" }}>{r.nodeType}</p>
                <pre className="rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap" style={{ background: "#0f172a", border: "1px solid #1e293b", color: "#e2e8f0" }}>
                  {r.generatedSql}
                </pre>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
