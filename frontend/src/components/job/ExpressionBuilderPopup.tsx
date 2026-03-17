import React, { useRef, useState, useCallback } from "react";
import type { ColumnInfo } from "../../types";
import { SNIPPETS, SNIPPET_CATEGORIES, applySnippet } from "../../utils/expressionSnippets";

interface SourceGroup {
  nodeId: string;
  nodeLabel: string;
  columns: ColumnInfo[];
  color: string;
}

interface Props {
  targetName: string;
  initialExpression: string;
  sourceNodeId: string;
  sourceColumn: string;
  sourceGroups: SourceGroup[];
  contextVars: string[];
  onApply: (expr: string) => void;
  onClose: () => void;
}

export default function ExpressionBuilderPopup({
  targetName,
  initialExpression,
  sourceNodeId,
  sourceColumn,
  sourceGroups,
  contextVars,
  onApply,
  onClose,
}: Props) {
  const [expr, setExpr] = useState(initialExpression);
  const [activeCategory, setActiveCategory] = useState<string>(SNIPPET_CATEGORIES[0]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cursorRef = useRef<{ start: number; end: number }>({ start: initialExpression.length, end: initialExpression.length });

  // textarea 커서 위치 저장
  const handleTextareaSelect = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    cursorRef.current = { start: ta.selectionStart, end: ta.selectionEnd };
  };

  // 커서 위치에 텍스트 삽입
  const insertAtCursor = useCallback((text: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setExpr(prev => prev + text);
      return;
    }
    const { start, end } = cursorRef.current;
    const current = ta.value;
    const newVal = current.slice(0, start) + text + current.slice(end);
    setExpr(newVal);
    // 커서 위치 업데이트 (삽입 후 끝으로)
    const newCursor = start + text.length;
    cursorRef.current = { start: newCursor, end: newCursor };
    // DOM 커서 이동 (비동기로 적용)
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newCursor, newCursor);
    });
  }, []);

  // 소스 컬럼 삽입: nodeLabel.colName
  const insertSourceCol = (nodeLabel: string, colName: string) => {
    insertAtCursor(`${nodeLabel}.${colName}`);
  };

  // 스니펫 삽입: $col → sourceColumn 치환
  const insertSnippet = (template: string) => {
    insertAtCursor(applySnippet(template, sourceColumn));
  };

  // Context 변수 삽입
  const insertContextVar = (varName: string) => {
    insertAtCursor(`\${${varName}}`);
  };

  const handleOk = () => onApply(expr.trim());

  // 카테고리 색상
  const categoryColors: Record<string, string> = {
    String: "#2563eb",
    Number: "#7c3aed",
    Date:   "#16a34a",
    Null:   "#dc2626",
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Popup */}
      <div
        className="relative flex flex-col rounded-xl shadow-2xl overflow-hidden"
        style={{ width: "55vw", height: "55vh", background: "#f8fafc", border: "1px solid #e2e8f0" }}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"
          style={{ background: "#f1f5f9", borderBottom: "1px solid #e2e8f0" }}
        >
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: "#388bfd22" }}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "#388bfd" }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <span className="text-xs font-semibold" style={{ color: "#1e293b" }}>Expression Builder</span>
            <span className="text-[10px] px-2 py-0.5 rounded font-mono" style={{ background: "#e0f2fe", color: "#0369a1" }}>
              → {targetName || "(컬럼 미선택)"}
            </span>
            {sourceColumn && (
              <span className="text-[10px]" style={{ color: "#94a3b8" }}>
                소스: <span className="font-mono" style={{ color: "#FE6703" }}>{sourceColumn}</span>
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded transition-colors hover:bg-black/5" style={{ color: "#64748b" }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Body: 3-panel ── */}
        <div className="flex-1 flex min-h-0">

          {/* LEFT: 소스 컬럼 + Context 변수 */}
          <div
            className="w-[22%] flex-shrink-0 flex flex-col overflow-hidden"
            style={{ borderRight: "1px solid #e2e8f0", background: "#ffffff" }}
          >
            <div className="px-2 py-1.5 flex-shrink-0" style={{ borderBottom: "1px solid #f1f5f9", background: "#f8fafc" }}>
              <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "#94a3b8" }}>소스 컬럼</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {sourceGroups.length === 0 && (
                <p className="px-2 py-3 text-[10px] text-center" style={{ color: "#94a3b8" }}>연결된 소스 없음</p>
              )}
              {sourceGroups.map(group => (
                <div key={group.nodeId}>
                  {/* group header */}
                  <div
                    className="px-2 py-1 flex items-center gap-1.5 sticky top-0"
                    style={{ background: group.color + "18", borderLeft: `2px solid ${group.color}`, borderBottom: `1px solid ${group.color}33` }}
                  >
                    <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: group.color }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                    </svg>
                    <span className="text-[10px] font-semibold truncate" style={{ color: group.color }}>{group.nodeLabel}</span>
                  </div>
                  {/* columns */}
                  {group.columns.map(col => (
                    <div
                      key={col.columnName}
                      className="flex items-center justify-between px-2 py-0.5 cursor-pointer select-none"
                      style={{ borderBottom: "1px solid #f8fafc", height: 24 }}
                      onMouseEnter={e => (e.currentTarget.style.background = group.color + "15")}
                      onMouseLeave={e => (e.currentTarget.style.background = "")}
                      onClick={() => insertSourceCol(group.nodeLabel, col.columnName)}
                    >
                      <span className="text-[10px] font-mono truncate" style={{ color: col.columnName === sourceColumn && group.nodeId === sourceNodeId ? group.color : "#334155" }}>
                        {col.columnName}
                      </span>
                      <span className="text-[9px] flex-shrink-0 ml-1" style={{ color: "#94a3b8" }}>
                        {col.dataType.split("(")[0]}
                      </span>
                    </div>
                  ))}
                </div>
              ))}

              {/* Context 변수 */}
              {contextVars.length > 0 && (
                <div>
                  <div
                    className="px-2 py-1 flex items-center gap-1.5 sticky top-0"
                    style={{ background: "#f0f9ff", borderLeft: "2px solid #0284c7", borderBottom: "1px solid #bae6fd", marginTop: 4 }}
                  >
                    <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "#0284c7" }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    <span className="text-[10px] font-semibold" style={{ color: "#0284c7" }}>Context</span>
                  </div>
                  {contextVars.map(v => (
                    <div
                      key={v}
                      className="flex items-center px-2 py-0.5 cursor-pointer select-none"
                      style={{ borderBottom: "1px solid #f8fafc", height: 24 }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#e0f2fe")}
                      onMouseLeave={e => (e.currentTarget.style.background = "")}
                      onClick={() => insertContextVar(v)}
                    >
                      <span className="text-[10px] font-mono" style={{ color: "#0369a1" }}>${"{" + v + "}"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* CENTER: textarea */}
          <div className="flex-1 flex flex-col min-w-0" style={{ background: "#ffffff" }}>
            <div className="px-2 py-1.5 flex-shrink-0" style={{ borderBottom: "1px solid #f1f5f9", background: "#f8fafc" }}>
              <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "#94a3b8" }}>Expression</span>
            </div>
            <textarea
              ref={textareaRef}
              value={expr}
              onChange={e => setExpr(e.target.value)}
              onSelect={handleTextareaSelect}
              onKeyUp={handleTextareaSelect}
              onClick={handleTextareaSelect}
              spellCheck={false}
              autoFocus
              placeholder={sourceColumn ? `예: TRIM(${sourceColumn})` : "예: TRIM(col_name)"}
              className="flex-1 w-full p-3 font-mono text-[12px] resize-none focus:outline-none"
              style={{
                color: "#1e293b",
                background: "#ffffff",
                caretColor: "#1e293b",
                lineHeight: 1.6,
              }}
            />
          </div>

          {/* RIGHT: 함수 스니펫 팔레트 */}
          <div
            className="w-[28%] flex-shrink-0 flex flex-col overflow-hidden"
            style={{ borderLeft: "1px solid #e2e8f0", background: "#ffffff" }}
          >
            {/* 카테고리 탭 */}
            <div className="flex flex-shrink-0" style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              {SNIPPET_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className="flex-1 py-1.5 text-[9px] font-semibold transition-colors border-b-2"
                  style={{
                    borderColor: activeCategory === cat ? (categoryColors[cat] ?? "#388bfd") : "transparent",
                    color: activeCategory === cat ? (categoryColors[cat] ?? "#388bfd") : "#94a3b8",
                    background: activeCategory === cat ? (categoryColors[cat] ?? "#388bfd") + "0f" : "transparent",
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* 스니펫 목록 */}
            <div className="flex-1 overflow-y-auto">
              {(SNIPPETS[activeCategory] ?? []).map(s => (
                <div
                  key={s.label}
                  className="px-2 py-1.5 cursor-pointer select-none"
                  style={{ borderBottom: "1px solid #f1f5f9" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#f8fafc")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}
                  onClick={() => insertSnippet(s.template)}
                >
                  <p className="text-[10px] font-semibold font-mono" style={{ color: "#1e293b" }}>{s.label}</p>
                  <p className="text-[9px] mt-0.5" style={{ color: "#94a3b8" }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div
          className="flex items-center gap-3 px-4 py-2 flex-shrink-0"
          style={{ borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}
        >
          {/* expression 미리보기 */}
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <span className="text-[9px] flex-shrink-0 font-semibold uppercase tracking-wider" style={{ color: "#94a3b8" }}>Preview</span>
            <span
              className="text-[10px] font-mono truncate"
              style={{ color: expr.trim() ? "#7c3aed" : "#94a3b8" }}
            >
              {expr.trim() || "(비어있음 — passthrough)"}
            </span>
          </div>

          {/* 버튼 */}
          <button
            onClick={onClose}
            className="px-3 py-1 rounded text-[11px] transition-colors"
            style={{ background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#e2e8f0")}
            onMouseLeave={e => (e.currentTarget.style.background = "#f1f5f9")}
          >
            Cancel
          </button>
          <button
            onClick={handleOk}
            className="px-3 py-1 rounded text-[11px] font-medium transition-colors"
            style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#dcfce7")}
            onMouseLeave={e => (e.currentTarget.style.background = "#f0fdf4")}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
