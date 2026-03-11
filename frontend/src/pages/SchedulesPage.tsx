import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { schedulesApi, projectsApi, jobsApi } from "../api";
import { Spinner } from "../components/ui";
import type {
  Schedule, ScheduleStep, ScheduleExecutionDetail, Job, ScheduleCreateRequest, ContextVar,
} from "../types";

// Job의 irJson에서 context 변수 목록 추출
function getJobContextVars(job: Job | undefined): { key: string; defaultValue: string; description: string }[] {
  if (!job?.irJson) return [];
  try {
    const ir = JSON.parse(job.irJson);
    if (!ir.context) return [];
    return Object.entries(ir.context as Record<string, string | ContextVar>).map(([key, v]) => {
      const cv = typeof v === "string" ? { value: v } : v;
      return {
        key,
        defaultValue: (cv as ContextVar).defaultValue ?? (cv as ContextVar).value ?? "",
        description:  (cv as ContextVar).description ?? "",
      };
    });
  } catch { return []; }
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────
function fmtDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function fmtMs(startedAt?: string, finishedAt?: string) {
  if (!startedAt || !finishedAt) return null;
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

const STATUS_COLOR: Record<string, string> = {
  SUCCESS: "#22c55e", FAILED: "#ef4444", RUNNING: "#3b82f6",
  PARTIAL: "#f59e0b", CANCELLED: "#94a3b8", PENDING: "#94a3b8", SKIPPED: "#cbd5e1",
};
const CRON_PRESETS = [
  { label: "매 시간", value: "0 0 * * * ?" },
  { label: "매일 06:00", value: "0 0 6 * * ?" },
  { label: "매일 자정", value: "0 0 0 * * ?" },
  { label: "매주 월요일", value: "0 0 0 ? * MON" },
  { label: "매월 1일", value: "0 0 0 1 * ?" },
];

function StatusDot({ status, size = "sm" }: { status: string; size?: "sm" | "md" }) {
  const sz = size === "md" ? "w-3.5 h-3.5" : "w-2.5 h-2.5";
  return <span className={`inline-block ${sz} rounded-full flex-shrink-0`} style={{ background: STATUS_COLOR[status] ?? "#94a3b8" }} title={status} />;
}

// ─── Pipeline DAG 뷰 ───────────────────────────────────────────────────────────
function PipelineView({ steps, jobMap }: { steps: ScheduleStep[]; jobMap: Record<string, string> }) {
  if (steps.length === 0)
    return <p className="text-xs text-center py-8" style={{ color: "#94a3b8" }}>등록된 Step이 없습니다.</p>;

  const sorted = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
  const stepById = Object.fromEntries(sorted.map((s) => [s.id, s]));

  // 노드 위치 계산 (의존관계 없으면 세로, 있으면 의존 관계 고려)
  const CARD_W = 220, CARD_H = 56, GAP_Y = 48, GAP_X = 260, OFFSET_X = 16, OFFSET_Y = 16;
  type Pos = { x: number; y: number };
  const positions: Record<string, Pos> = {};

  // 의존 없는 루트 step들 먼저 배치
  const roots = sorted.filter((s) => !s.dependsOnStepId);
  const nonRoots = sorted.filter((s) => s.dependsOnStepId);

  // 단순 세로 배치 (의존 관계 있어도 순서대로)
  sorted.forEach((s, i) => {
    if (!s.dependsOnStepId) {
      positions[s.id] = { x: OFFSET_X, y: OFFSET_Y + i * (CARD_H + GAP_Y) };
    } else {
      const depPos = positions[s.dependsOnStepId];
      if (depPos) {
        // 형제 확인 (같은 부모를 가진 step이 있으면 옆으로)
        const siblings = nonRoots.filter((x) => x.dependsOnStepId === s.dependsOnStepId && x.id !== s.id);
        const siblingIdx = nonRoots.filter((x) => x.dependsOnStepId === s.dependsOnStepId).indexOf(s);
        if (siblings.length > 0 && s.runCondition === "ON_FAILURE") {
          positions[s.id] = { x: OFFSET_X + GAP_X, y: depPos.y };
        } else {
          positions[s.id] = { x: OFFSET_X, y: OFFSET_Y + i * (CARD_H + GAP_Y) };
        }
      } else {
        positions[s.id] = { x: OFFSET_X, y: OFFSET_Y + i * (CARD_H + GAP_Y) };
      }
    }
  });

  const svgH = Math.max(...Object.values(positions).map((p) => p.y + CARD_H + OFFSET_Y), 120);
  const svgW = Math.max(...Object.values(positions).map((p) => p.x + CARD_W + OFFSET_X), 280);

  const COND_COLOR: Record<string, string> = {
    ON_SUCCESS: "#22c55e", ON_FAILURE: "#ef4444", ON_COMPLETE: "#94a3b8",
  };

  return (
    <div className="relative overflow-x-auto">
      <svg width={svgW} height={svgH} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", zIndex: 1 }}>
        {sorted.map((step) => {
          if (!step.dependsOnStepId) return null;
          const from = positions[step.dependsOnStepId];
          const to = positions[step.id];
          if (!from || !to) return null;
          const x1 = from.x + CARD_W / 2;
          const y1 = from.y + CARD_H;
          const x2 = to.x + CARD_W / 2;
          const y2 = to.y;
          const midY = (y1 + y2) / 2;
          const color = COND_COLOR[step.runCondition] ?? "#94a3b8";
          return (
            <g key={`edge-${step.id}`}>
              <path
                d={x1 === x2
                  ? `M ${x1} ${y1} L ${x2} ${y2}`
                  : `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeDasharray={step.runCondition === "ON_FAILURE" ? "4 3" : undefined}
              />
              {/* 화살표 */}
              <polygon
                points={`${x2},${y2} ${x2 - 5},${y2 - 8} ${x2 + 5},${y2 - 8}`}
                fill={color}
              />
              {/* 조건 레이블 */}
              <text x={(x1 + x2) / 2 + 4} y={(y1 + y2) / 2 - 3} fontSize="9" fill={color} fontWeight="500">
                {step.runCondition}
              </text>
            </g>
          );
        })}
      </svg>

      <div style={{ position: "relative", zIndex: 2, width: svgW, height: svgH }}>
        {sorted.map((step) => {
          const pos = positions[step.id];
          if (!pos) return null;
          return (
            <div
              key={step.id}
              style={{
                position: "absolute",
                left: pos.x,
                top: pos.y,
                width: CARD_W,
                height: CARD_H,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "0 12px",
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  width: 24, height: 24, borderRadius: "50%",
                  background: "#eff6ff", color: "#2563eb",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                }}
              >
                {step.stepOrder}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {jobMap[step.jobId] ?? "Unknown Job"}
                </p>
                <p style={{ fontSize: 10, color: "#94a3b8" }}>
                  {step.retryCount > 0 ? `retry ${step.retryCount}× · ` : ""}
                  {step.timeoutSeconds}s timeout
                </p>
              </div>
              {!step.enabled && (
                <span style={{ fontSize: 9, background: "#fef2f2", color: "#dc2626", borderRadius: 4, padding: "1px 5px" }}>off</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 실행 이력 (GitHub Actions 스타일) ──────────────────────────────────────────
function ExecutionHistory({ scheduleId }: { scheduleId: string }) {
  const [execs, setExecs] = useState<ScheduleExecutionDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set([/* 첫번째 자동 오픈 */]));

  useEffect(() => {
    setLoading(true);
    schedulesApi.listExecutions(scheduleId)
      .then((data) => {
        setExecs(data);
        if (data.length > 0) setOpenIds(new Set([data[0].id]));
      })
      .catch(() => setExecs([]))
      .finally(() => setLoading(false));
  }, [scheduleId]);

  const toggle = (id: string) => setOpenIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (loading) return <div className="flex justify-center py-8"><Spinner size="md" /></div>;
  if (execs.length === 0) return <p className="text-xs text-center py-8" style={{ color: "#94a3b8" }}>실행 이력 없음</p>;

  return (
    <div className="space-y-2">
      {execs.map((exec, runIdx) => {
        const isOpen = openIds.has(exec.id);
        const dur = fmtMs(exec.startedAt, exec.finishedAt);
        return (
          <div key={exec.id} className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0" }}>
            <button
              onClick={() => toggle(exec.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
              style={{ background: isOpen ? "#f8fafc" : "#ffffff" }}
              onMouseEnter={(e) => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = "#f8fafc"; }}
              onMouseLeave={(e) => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = "#ffffff"; }}
            >
              <span className="text-[10px] w-3" style={{ color: "#94a3b8" }}>{isOpen ? "▼" : "▶"}</span>
              <StatusDot status={exec.status} size="md" />
              <span className="flex-1 text-xs font-medium" style={{ color: "#0f172a" }}>
                Run #{execs.length - runIdx} — {fmtDate(exec.startedAt)}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#f1f5f9", color: "#64748b" }}>
                {exec.triggerType}
              </span>
              <span className="text-xs tabular-nums" style={{ color: "#64748b" }}>
                {exec.completedSteps}/{exec.totalSteps ?? "?"} steps
              </span>
              {dur && <span className="text-xs tabular-nums" style={{ color: "#94a3b8" }}>{dur}</span>}
              <span className="text-xs font-semibold w-16 text-right" style={{ color: STATUS_COLOR[exec.status] ?? "#64748b" }}>
                {exec.status}
              </span>
            </button>

            {isOpen && (
              <div style={{ borderTop: "1px solid #f1f5f9", background: "#fafafa" }}>
                {exec.stepExecutions.length === 0
                  ? <p className="text-xs px-8 py-3" style={{ color: "#94a3b8" }}>step 정보 없음</p>
                  : exec.stepExecutions
                      .slice()
                      .sort((a, b) => a.stepOrder - b.stepOrder)
                      .map((se, i, arr) => {
                        const stepDur = fmtMs(se.startedAt, se.finishedAt);
                        return (
                          <div
                            key={se.id}
                            className="flex items-start gap-3 px-5 py-2.5"
                            style={{ borderBottom: i < arr.length - 1 ? "1px solid #f1f5f9" : undefined }}
                          >
                            <div className="flex flex-col items-center flex-shrink-0 mt-0.5" style={{ width: 12 }}>
                              <StatusDot status={se.status} />
                              {i < arr.length - 1 && <div className="w-px flex-1 mt-1" style={{ background: "#e2e8f0", minHeight: 14 }} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-medium" style={{ color: "#374151" }}>Step {se.stepOrder}</span>
                                <span className="text-[10px]" style={{ color: STATUS_COLOR[se.status] ?? "#64748b" }}>{se.status}</span>
                                {se.retryAttempt > 0 && (
                                  <span className="text-[10px] px-1.5 rounded" style={{ background: "#fef9c3", color: "#854d0e" }}>
                                    retry #{se.retryAttempt}
                                  </span>
                                )}
                                {stepDur && <span className="ml-auto text-xs tabular-nums" style={{ color: "#94a3b8" }}>{stepDur}</span>}
                              </div>
                              {se.errorMessage && (
                                <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: "#ef4444" }}>{se.errorMessage}</p>
                              )}
                            </div>
                          </div>
                        );
                      })
                }
                {exec.errorSummary && (
                  <div className="px-5 py-2" style={{ borderTop: "1px solid #fecaca", background: "#fef2f2" }}>
                    <p className="text-[11px]" style={{ color: "#dc2626" }}>{exec.errorSummary}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── 스케줄 설정 편집 탭 ──────────────────────────────────────────────────────
function SettingsTab({
  schedule, allJobs, onSaved,
}: {
  schedule: Schedule; allJobs: Job[]; onSaved: (s: Schedule) => void;
}) {
  const [name, setName] = useState(schedule.name);
  const [description, setDescription] = useState(schedule.description ?? "");
  const [cron, setCron] = useState(schedule.cronExpression);
  const [timezone, setTimezone] = useState(schedule.timezone);
  const [alertCondition, setAlertCondition] = useState(schedule.alertCondition ?? "NONE");
  const [alertChannel, setAlertChannel] = useState(schedule.alertChannel ?? "");
  const [steps, setSteps] = useState(
    schedule.steps.map((s) => {
      let contextOverrides: Record<string, string> = {};
      try { contextOverrides = JSON.parse(s.contextOverrides || "{}"); } catch {}
      return {
        jobId: s.jobId, stepOrder: s.stepOrder,
        dependsOnStepOrder: s.dependsOnStepId
          ? (schedule.steps.find((x) => x.id === s.dependsOnStepId)?.stepOrder ?? null)
          : null,
        runCondition: s.runCondition,
        timeoutSeconds: s.timeoutSeconds, retryCount: s.retryCount,
        retryDelaySeconds: s.retryDelaySeconds, enabled: s.enabled,
        contextOverrides,
      };
    })
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);

  const addStep = () => setSteps((s) => [
    ...s,
    { jobId: "", stepOrder: s.length + 1, dependsOnStepOrder: null, runCondition: "ON_SUCCESS", timeoutSeconds: 3600, retryCount: 0, retryDelaySeconds: 60, enabled: true, contextOverrides: {} },
  ]);
  const removeStep = (i: number) => setSteps((s) => s.filter((_, idx) => idx !== i).map((x, idx) => ({ ...x, stepOrder: idx + 1 })));

  const handleSave = async () => {
    if (!name.trim()) { setErr("이름을 입력하세요."); return; }
    setSaving(true); setErr("");
    try {
      const updated = await schedulesApi.update(schedule.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        cronExpression: cron.trim(),
        timezone,
        alertCondition,
        alertChannel: alertChannel.trim() || undefined,
        steps: steps.filter((s) => s.jobId).map((s) => {
          // 빈 값은 제외하고 JSON 직렬화
          const overrides = Object.fromEntries(Object.entries(s.contextOverrides).filter(([, v]) => v.trim()));
          return {
            jobId: s.jobId,
            stepOrder: s.stepOrder,
            dependsOnStepOrder: s.dependsOnStepOrder ?? undefined,
            runCondition: s.runCondition,
            timeoutSeconds: s.timeoutSeconds,
            retryCount: s.retryCount,
            retryDelaySeconds: s.retryDelaySeconds,
            contextOverrides: Object.keys(overrides).length > 0 ? JSON.stringify(overrides) : undefined,
          };
        }),
      });
      onSaved(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 기본 정보 */}
      <div className="p-4 rounded-xl space-y-3" style={{ border: "1px solid #e2e8f0" }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>Workflow Details</p>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "#374151" }}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ border: "1px solid #d1d5db", background: "#f8fafc", color: "#0f172a" }} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "#374151" }}>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-y"
            style={{ border: "1px solid #d1d5db", background: "#f8fafc", color: "#0f172a" }} />
        </div>
      </div>

      {/* Cron */}
      <div className="p-4 rounded-xl space-y-3" style={{ border: "1px solid #e2e8f0" }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>Run Configuration</p>
        <div className="flex gap-2 flex-wrap">
          {CRON_PRESETS.map((p) => (
            <button key={p.value} onClick={() => setCron(p.value)}
              className="px-2 py-0.5 rounded text-xs"
              style={{ border: "1px solid #e2e8f0", background: cron === p.value ? "#eff6ff" : "#f8fafc", color: cron === p.value ? "#2563eb" : "#64748b" }}>
              {p.label}
            </button>
          ))}
        </div>
        <input value={cron} onChange={(e) => setCron(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none"
          style={{ border: "1px solid #d1d5db", background: "#f8fafc", color: "#0f172a" }} />
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "#374151" }}>Timezone</label>
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ border: "1px solid #d1d5db", background: "#f8fafc", color: "#0f172a" }}>
            <option value="Asia/Seoul">Asia/Seoul (KST)</option>
            <option value="UTC">UTC</option>
            <option value="America/New_York">America/New_York (EST)</option>
          </select>
        </div>
      </div>

      {/* Steps */}
      <div className="p-4 rounded-xl space-y-3" style={{ border: "1px solid #e2e8f0" }}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>RUN STEP</p>
          <button onClick={addStep} className="text-xs px-2 py-1 rounded" style={{ background: "#eff6ff", color: "#2563eb" }}>
            + Add
          </button>
        </div>
        {steps.length === 0 && <p className="text-xs" style={{ color: "#94a3b8" }}>Step이 없습니다.</p>}
        {steps.map((step, i) => {
          const selectedJob = allJobs.find((j) => j.id === step.jobId);
          const ctxVars = getJobContextVars(selectedJob);
          const hasCtxVars = ctxVars.length > 0;

          return (
            <div key={i} className="rounded-lg space-y-2" style={{ border: "1px solid #e2e8f0", overflow: "hidden" }}>
              {/* Step 헤더 */}
              <div className="flex items-center gap-2 px-3 pt-3 pb-2" style={{ background: "#f8fafc" }}>
                <span className="text-xs font-mono w-4 text-center flex-shrink-0" style={{ color: "#94a3b8" }}>{i + 1}</span>
                <select value={step.jobId}
                  onChange={(e) => setSteps((s) => s.map((x, idx) => idx === i ? { ...x, jobId: e.target.value, contextOverrides: {} } : x))}
                  className="flex-1 px-2 py-1.5 rounded text-xs outline-none"
                  style={{ border: "1px solid #d1d5db", background: "#ffffff", color: "#0f172a" }}>
                  <option value="">Job 선택</option>
                  {allJobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
                </select>
                <button onClick={() => removeStep(i)} className="text-xs" style={{ color: "#ef4444" }}>✕</button>
              </div>
              {/* Step 옵션 */}
              <div className="flex gap-2 flex-wrap px-3">
                <div className="flex-1 min-w-[120px]">
                  <label className="text-[10px]" style={{ color: "#94a3b8" }}>Upstream Step</label>
                  <select value={step.dependsOnStepOrder ?? ""}
                    onChange={(e) => setSteps((s) => s.map((x, idx) => idx === i ? { ...x, dependsOnStepOrder: e.target.value ? Number(e.target.value) : null } : x))}
                    className="w-full px-2 py-1 rounded text-xs outline-none mt-0.5"
                    style={{ border: "1px solid #d1d5db", background: "#ffffff", color: "#0f172a" }}>
                    <option value="">없음</option>
                    {steps.filter((_, idx) => idx < i).map((s, idx) => (
                      <option key={idx} value={s.stepOrder}>Step {s.stepOrder}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-[110px]">
                  <label className="text-[10px]" style={{ color: step.dependsOnStepOrder ? "#94a3b8" : "#cbd5e1" }}>Run Condition</label>
                  <select value={step.runCondition}
                    disabled={!step.dependsOnStepOrder}
                    onChange={(e) => setSteps((s) => s.map((x, idx) => idx === i ? { ...x, runCondition: e.target.value as "ON_SUCCESS" | "ON_FAILURE" | "ON_COMPLETE" } : x))}
                    className="w-full px-2 py-1 rounded text-xs outline-none mt-0.5"
                    style={{
                      border: "1px solid #e2e8f0",
                      background: step.dependsOnStepOrder ? "#ffffff" : "#f8fafc",
                      color: step.dependsOnStepOrder ? "#0f172a" : "#94a3b8",
                      cursor: step.dependsOnStepOrder ? "auto" : "not-allowed",
                    }}>
                    <option value="ON_SUCCESS">ON_SUCCESS</option>
                    <option value="ON_FAILURE">ON_FAILURE</option>
                    <option value="ON_COMPLETE">ON_COMPLETE</option>
                  </select>
                </div>
                <div style={{ width: 70 }}>
                  <label className="text-[10px]" style={{ color: "#94a3b8" }}>Retry</label>
                  <input type="number" min={0} max={5} value={step.retryCount}
                    onChange={(e) => setSteps((s) => s.map((x, idx) => idx === i ? { ...x, retryCount: parseInt(e.target.value) || 0 } : x))}
                    className="w-full px-2 py-1 rounded text-xs outline-none mt-0.5"
                    style={{ border: "1px solid #d1d5db", background: "#ffffff", color: "#0f172a" }} />
                </div>
              </div>
              {/* Context Overrides */}
              {step.jobId && (
                <div className="px-3 pb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-medium" style={{ color: "#64748b" }}>
                      Context Overrides
                      {!hasCtxVars && <span className="ml-1 font-normal" style={{ color: "#94a3b8" }}>(이 Job에 정의된 context 변수 없음)</span>}
                    </label>
                  </div>
                  {hasCtxVars ? (
                    <div className="space-y-1">
                      {ctxVars.map(({ key, defaultValue, description }) => (
                        <div key={key} className="flex items-center gap-2">
                          <div className="flex items-center gap-1 min-w-[140px] flex-shrink-0">
                            <span className="font-mono text-[10px]" style={{ color: "#ef4444" }}>context.</span>
                            <span className="font-mono text-[10px] font-medium" style={{ color: "#0f172a" }}>{key}</span>
                          </div>
                          <input
                            value={step.contextOverrides[key] ?? ""}
                            onChange={(e) => setSteps((s) => s.map((x, idx) => idx === i
                              ? { ...x, contextOverrides: { ...x.contextOverrides, [key]: e.target.value } }
                              : x))}
                            placeholder={defaultValue || "값 미입력 시 Job 정의값 사용"}
                            className="flex-1 px-2 py-1 rounded text-[11px] font-mono outline-none"
                            style={{ border: "1px solid #d1d5db", background: "#ffffff", color: "#0f172a" }} />
                          {description && (
                            <span className="text-[9px] flex-shrink-0" style={{ color: "#94a3b8" }} title={description}>{description}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px]" style={{ color: "#cbd5e1" }}>context 변수를 Job에 추가하면 여기서 실행마다 오버라이드할 수 있습니다.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 알림 */}
      <div className="p-4 rounded-xl" style={{ border: "1px solid #e2e8f0" }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748b" }}>Alert Settings</p>
        <div className="flex flex-col gap-2 mb-3">
          {([
            { value: "NONE",          label: "없음",         desc: "" },
            { value: "ON_FAILURE",    label: "On Failure",   desc: "실패 시" },
            { value: "ON_SUCCESS",    label: "On Success",   desc: "성공 시" },
            { value: "ON_COMPLETION", label: "On Completion",desc: "성공/실패 무관 완료 시" },
          ] as const).map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="alertCondition"
                value={opt.value}
                checked={alertCondition === opt.value}
                onChange={() => setAlertCondition(opt.value)}
              />
              <span className="text-xs" style={{ color: "#374151" }}>
                {opt.label} <span style={{ color: "#94a3b8" }}> &nbsp;&nbsp; {opt.desc}</span>
              </span>
            </label>
          ))}
        </div>
        <div>
          <label className="text-[10px] block mb-1" style={{ color: "#94a3b8" }}>
            수신 이메일 <span style={{ color: "#cbd5e1" }}>(NONE 선택 시 발송 안 됨)</span>
          </label>
          <input
            type="email"
            value={alertChannel}
            onChange={(e) => setAlertChannel(e.target.value)}
            placeholder="alert@example.com"
            disabled={alertCondition === "NONE"}
            className="w-full text-xs rounded px-2 py-1.5"
            style={{
              border: "1px solid #d1d5db",
              background: alertCondition === "NONE" ? "#f8fafc" : "#ffffff",
              color: alertCondition === "NONE" ? "#94a3b8" : "#0f172a",
            }}
          />
        </div>
      </div>

      {err && <p className="text-xs" style={{ color: "#ef4444" }}>{err}</p>}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 text-sm rounded-lg text-white disabled:opacity-50"
          style={{ background: saving ? "#94a3b8" : saved ? "#16a34a" : "#2563eb" }}
        >
          {saving ? "저장 중..." : saved ? "✓ 저장됨" : "변경사항 저장"}
        </button>
      </div>
    </div>
  );
}

// ─── 스케줄 상세 패널 ──────────────────────────────────────────────────────────
function ScheduleDetail({
  schedule, allJobs, jobMap, onToggle, onTrigger, onDelete, onSaved,
}: {
  schedule: Schedule; allJobs: Job[]; jobMap: Record<string, string>;
  onToggle: (id: string, enabled: boolean) => void;
  onTrigger: (id: string) => Promise<void>;
  onDelete: (id: string) => void;
  onSaved: (s: Schedule) => void;
}) {
  const [tab, setTab] = useState<"pipeline" | "history" | "settings">("pipeline");
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  const handleTrigger = async () => {
    setTriggerLoading(true);
    try {
      await onTrigger(schedule.id);
      setHistoryKey((k) => k + 1);
      setTab("history");
    } finally {
      setTriggerLoading(false);
    }
  };

  const tabs = [
    { key: "pipeline", label: "파이프라인" },
    { key: "history", label: "실행 이력" },
    { key: "settings", label: "설정" },
  ] as const;

  return (
    <div className="h-full flex flex-col" style={{ background: "#ffffff" }}>
      {/* 헤더 */}
      <div className="px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid #e2e8f0" }}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: schedule.enabled ? "#22c55e" : "#94a3b8" }} />
              <p className="text-base font-bold" style={{ color: "#0f172a" }}>{schedule.name}</p>
              {schedule.consecutiveFailures > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#fef2f2", color: "#dc2626" }}>
                  {schedule.consecutiveFailures} consecutive fails
                </span>
              )}
            </div>
            <p className="text-xs font-mono" style={{ color: "#64748b" }}>{schedule.cronExpression}  ({schedule.timezone})</p>
            <div className="flex gap-3 mt-1 text-[11px]" style={{ color: "#94a3b8" }}>
              {schedule.lastFiredAt && <span>마지막: {fmtDate(schedule.lastFiredAt)}</span>}
              {schedule.nextFireAt && <span>다음: {fmtDate(schedule.nextFireAt)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            <button onClick={() => onToggle(schedule.id, !schedule.enabled)}
              className="px-3 py-1.5 text-xs rounded-lg"
              style={{ border: "1px solid #e2e8f0", background: schedule.enabled ? "#fef2f2" : "#f0fdf4", color: schedule.enabled ? "#dc2626" : "#16a34a" }}>
              {schedule.enabled ? "비활성화" : "활성화"}
            </button>
            <button onClick={handleTrigger} disabled={triggerLoading}
              className="px-3 py-1.5 text-xs rounded-lg text-white disabled:opacity-50"
              style={{ background: "#2563eb" }}>
              {triggerLoading ? <Spinner size="sm" /> : "▶ 수동 실행"}
            </button>
            <button onClick={() => onDelete(schedule.id)}
              className="px-3 py-1.5 text-xs rounded-lg"
              style={{ border: "1px solid #fecaca", color: "#dc2626" }}>
              삭제
            </button>
          </div>
        </div>

        {/* 최근 실행 도트 */}
        {schedule.recentExecutions.length > 0 && (
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-[10px]" style={{ color: "#94a3b8" }}>최근</span>
            {schedule.recentExecutions.slice().reverse().map((e) => (
              <StatusDot key={e.id} status={e.status} />
            ))}
          </div>
        )}

        {/* 탭 버튼 */}
        <div className="flex gap-4">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="text-xs pb-1.5 font-medium border-b-2 transition-colors"
              style={{ borderColor: tab === t.key ? "#2563eb" : "transparent", color: tab === t.key ? "#2563eb" : "#94a3b8" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 탭 내용 */}
      <div className="flex-1 overflow-y-auto p-5">
        {tab === "pipeline" && (
          <PipelineView steps={schedule.steps} jobMap={jobMap} />
        )}
        {tab === "history" && (
          <ExecutionHistory key={historyKey} scheduleId={schedule.id} />
        )}
        {tab === "settings" && (
          <SettingsTab schedule={schedule} allJobs={allJobs} onSaved={onSaved} />
        )}
      </div>
    </div>
  );
}

// ─── New Schedule 모달 ──────────────────────────────────────────────────────────
function NewScheduleModal({ onClose, onCreated, allJobs }: {
  onClose: () => void; onCreated: (s: Schedule) => void; allJobs: Job[];
}) {
  const [name, setName] = useState("");
  const [cron, setCron] = useState("0 0 6 * * ?");
  const [timezone, setTimezone] = useState("Asia/Seoul");
  const [enabled, setEnabled] = useState(false);
  const [steps, setSteps] = useState<{ jobId: string; runCondition: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const addStep = () => setSteps((s) => [...s, { jobId: "", runCondition: "ON_SUCCESS" }]);
  const removeStep = (i: number) => setSteps((s) => s.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!name.trim()) { setErr("이름을 입력하세요."); return; }
    if (!cron.trim()) { setErr("Cron을 입력하세요."); return; }
    setSaving(true); setErr("");
    try {
      const req: ScheduleCreateRequest = {
        name: name.trim(), cronExpression: cron.trim(), timezone, enabled,
        steps: steps.filter((s) => s.jobId).map((s, i) => ({ jobId: s.jobId, stepOrder: i + 1, runCondition: s.runCondition })),
      };
      onCreated(await schedulesApi.create(req));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-[520px] max-h-[85vh] overflow-y-auto rounded-xl shadow-2xl"
        style={{ background: "#ffffff", border: "1px solid #e2e8f0" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #e2e8f0" }}>
          <p className="text-sm font-semibold" style={{ color: "#0f172a" }}>New Schedule</p>
          <button onClick={onClose} style={{ color: "#94a3b8" }}>✕</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "#374151" }}>이름 *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Daily ETL"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ border: "1px solid #d1d5db", background: "#f8fafc", color: "#0f172a" }} />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: "#374151" }}>Cron 표현식 *</label>
            <div className="flex gap-1.5 flex-wrap mb-2">
              {CRON_PRESETS.map((p) => (
                <button key={p.value} onClick={() => setCron(p.value)}
                  className="px-2 py-0.5 rounded text-xs"
                  style={{ border: "1px solid #e2e8f0", background: cron === p.value ? "#eff6ff" : "#f8fafc", color: cron === p.value ? "#2563eb" : "#64748b" }}>
                  {p.label}
                </button>
              ))}
            </div>
            <input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 6 * * *"
              className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none"
              style={{ border: "1px solid #d1d5db", background: "#f8fafc", color: "#0f172a" }} />
            <p className="text-[11px] mt-1" style={{ color: "#94a3b8" }}>분 시 일 월 요일</p>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "#374151" }}>Timezone</label>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ border: "1px solid #d1d5db", background: "#f8fafc", color: "#0f172a" }}>
              <option value="Asia/Seoul">Asia/Seoul (KST)</option>
              <option value="UTC">UTC</option>
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium" style={{ color: "#374151" }}>실행 Steps</label>
              <button onClick={addStep} className="text-xs px-2 py-1 rounded" style={{ background: "#eff6ff", color: "#2563eb" }}>+ 추가</button>
            </div>
            {steps.length === 0 && <p className="text-xs py-1" style={{ color: "#94a3b8" }}>Step 없이 생성 가능 (나중에 추가)</p>}
            {steps.map((step, i) => (
              <div key={i} className="flex gap-2 items-center mb-2 p-2 rounded-lg" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <span className="text-xs font-mono w-4 text-center" style={{ color: "#94a3b8" }}>{i + 1}</span>
                <select value={step.jobId}
                  onChange={(e) => setSteps((s) => s.map((x, idx) => idx === i ? { ...x, jobId: e.target.value } : x))}
                  className="flex-1 px-2 py-1.5 rounded text-xs outline-none"
                  style={{ border: "1px solid #d1d5db", background: "#ffffff", color: "#0f172a" }}>
                  <option value="">Job 선택</option>
                  {allJobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
                </select>
                <select value={step.runCondition}
                  onChange={(e) => setSteps((s) => s.map((x, idx) => idx === i ? { ...x, runCondition: e.target.value } : x))}
                  className="px-2 py-1.5 rounded text-xs outline-none" style={{ border: "1px solid #d1d5db", background: "#ffffff", color: "#0f172a", width: 110 }}>
                  <option value="ON_SUCCESS">ON_SUCCESS</option>
                  <option value="ON_FAILURE">ON_FAILURE</option>
                  <option value="ON_COMPLETE">ON_COMPLETE</option>
                </select>
                <button onClick={() => removeStep(i)} style={{ color: "#ef4444" }}>✕</button>
              </div>
            ))}
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span className="text-xs" style={{ color: "#374151" }}>생성 즉시 활성화</span>
          </label>
          {err && <p className="text-xs" style={{ color: "#ef4444" }}>{err}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: "1px solid #e2e8f0" }}>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg" style={{ border: "1px solid #e2e8f0", color: "#64748b" }}>취소</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm rounded-lg text-white disabled:opacity-50" style={{ background: "#2563eb" }}>
            {saving ? "저장 중..." : "생성"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 페이지 ───────────────────────────────────────────────────────────────
export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Schedule | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [jobMap, setJobMap] = useState<Record<string, string>>({});

  const loadSchedules = useCallback(() => {
    setLoading(true);
    schedulesApi.list().then(setSchedules).catch(() => setSchedules([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadSchedules();
    projectsApi.list().then(async (projects) => {
      const lists = await Promise.all(projects.map((p) => jobsApi.list(p.id).catch(() => [])));
      const jobs = lists.flat();
      setAllJobs(jobs);
      setJobMap(Object.fromEntries(jobs.map((j) => [j.id, j.name])));
    }).catch(() => {});
  }, [loadSchedules]);

  // selected 동기화
  useEffect(() => {
    if (selected) {
      const updated = schedules.find((s) => s.id === selected.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(selected)) setSelected(updated);
    }
  }, [schedules]);

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      const updated = await schedulesApi.setEnabled(id, enabled);
      setSchedules((s) => s.map((x) => x.id === id ? updated : x));
      if (selected?.id === id) setSelected(updated);
    } catch {}
  };

  const handleTrigger = async (id: string) => {
    await schedulesApi.trigger(id);
    const updated = await schedulesApi.get(id).catch(() => null);
    if (updated) {
      setSchedules((s) => s.map((x) => x.id === id ? updated : x));
      setSelected(updated);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("스케줄을 삭제하시겠습니까?")) return;
    try {
      await schedulesApi.delete(id);
      setSchedules((s) => s.filter((x) => x.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch {}
  };

  const handleSaved = (updated: Schedule) => {
    setSchedules((s) => s.map((x) => x.id === updated.id ? updated : x));
    setSelected(updated);
  };

  return (
    <div className="h-full flex flex-col" style={{ background: "#ffffff" }}>
      {/* 헤더 */}
      <div className="px-6 py-4 flex items-center justify-between flex-shrink-0" style={{ borderBottom: "1px solid #e2e8f0" }}>
        <div>
          <h1 className="text-xl font-bold" style={{ color: "#0f172a" }}>Actions</h1>
          <p className="text-sm mt-0.5" style={{ color: "#64748b" }}>
            {schedules.length}개의 스케줄 · {schedules.filter((s) => s.enabled).length}개 활성
          </p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg text-white"
          style={{ background: "#2563eb" }}>
          <span className="text-base leading-none">+</span> New workflow
        </button>
      </div>

      {/* 바디 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 목록 패널 */}
        <div className="flex-shrink-0 overflow-y-auto" style={{ width: 320, borderRight: "1px solid #e2e8f0", background: "#fafafa" }}>
          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : schedules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 px-6 text-center">
              <svg className="w-10 h-10 mb-1 opacity-30" fill="none" viewBox="0 0 24 24" stroke="#94a3b8">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium" style={{ color: "#94a3b8" }}>스케줄 없음</p>
              <button onClick={() => setShowNew(true)} className="text-xs mt-1 px-3 py-1.5 rounded-lg text-white" style={{ background: "#2563eb" }}>
                첫 스케줄 만들기
              </button>
            </div>
          ) : (
            <>
              {/* 요약 헤더 */}
              <div className="px-4 py-2.5" style={{ borderBottom: "1px solid #f1f5f9" }}>
                <div className="flex text-[10px] font-semibold uppercase tracking-wider gap-4" style={{ color: "#94a3b8" }}>
                  <span className="flex-1">All workflows</span>
                  <span>Recent Runs</span>
                </div>
              </div>
              <div>
                {schedules.map((sch) => {
                  const isActive = selected?.id === sch.id;
                  return (
                    <button key={sch.id} onClick={() => setSelected(sch)}
                      className="w-full px-4 py-3.5 text-left transition-colors"
                      style={{ background: isActive ? "#eff6ff" : undefined, borderBottom: "1px solid #f1f5f9" }}
                      onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "#f8fafc"; }}
                      onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = ""; }}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: sch.enabled ? "#22c55e" : "#94a3b8" }} />
                        <p className="text-xs font-semibold flex-1 truncate" style={{ color: "#0f172a" }}>{sch.name}</p>
                        {sch.consecutiveFailures > 0 && (
                          <span className="text-[9px] px-1.5 rounded-full" style={{ background: "#fef2f2", color: "#dc2626" }}>
                            {sch.consecutiveFailures}x fail
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-mono mb-1.5" style={{ color: "#64748b" }}>
                        {sch.cronExpression}
                        {sch.nextFireAt && (
                          <span className="ml-2 font-sans" style={{ color: "#94a3b8" }}>→ {fmtDate(sch.nextFireAt)}</span>
                        )}
                      </p>
                      <div className="flex items-center justify-between">
                        <p className="text-[10px]" style={{ color: "#94a3b8" }}>
                          {sch.steps.length} step{sch.steps.length !== 1 ? "s" : ""}
                        </p>
                        {sch.recentExecutions.length > 0 && (
                          <div className="flex gap-1">
                            {sch.recentExecutions.slice().reverse().slice(0, 8).map((e) => (
                              <StatusDot key={e.id} status={e.status} />
                            ))}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* 상세 패널 */}
        <div className="flex-1 overflow-hidden">
          {selected ? (
            <ScheduleDetail
              schedule={selected}
              allJobs={allJobs}
              jobMap={jobMap}
              onToggle={handleToggle}
              onTrigger={handleTrigger}
              onDelete={handleDelete}
              onSaved={handleSaved}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: "#94a3b8" }}>
              <svg className="w-12 h-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-center">
                <p className="text-sm font-medium mb-1">스케줄을 선택하세요</p>
                <p className="text-xs">좌측 목록에서 스케줄을 클릭하면 상세 정보가 표시됩니다.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {showNew && (
        <NewScheduleModal
          onClose={() => setShowNew(false)}
          allJobs={allJobs}
          onCreated={(s) => { setSchedules((prev) => [s, ...prev]); setSelected(s); setShowNew(false); }}
        />
      )}
    </div>
  );
}
