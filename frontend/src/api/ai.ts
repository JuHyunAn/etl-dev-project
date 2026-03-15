export type AiProvider = 'claude' | 'openai' | 'gemini' | 'grok'

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AiConfig {
  provider: AiProvider
  model: string
  apiKey: string
  systemContext?: string  // 커넥션 정보 등 동적 컨텍스트
}

export const AI_MODELS: Record<AiProvider, { label: string; models: { id: string; label: string }[] }> = {
  claude: {
    label: 'Claude (Anthropic)',
    models: [
      { id: 'claude-sonnet-4-6',           label: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-6',             label: 'Claude Opus 4.6' },
      { id: 'claude-haiku-4-5-20251001',   label: 'Claude Haiku 4.5' },
    ],
  },
  openai: {
    label: 'ChatGPT (OpenAI)',
    models: [
      { id: 'gpt-4o',       label: 'GPT-4o' },
      { id: 'gpt-4o-mini',  label: 'GPT-4o mini' },
      { id: 'gpt-4-turbo',  label: 'GPT-4 Turbo' },
    ],
  },
  gemini: {
    label: 'Gemini (Google)',
    models: [
      { id: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
      { id: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash' },
    ],
  },
  grok: {
    label: 'Grok (xAI)',
    models: [
      { id: 'grok-3',      label: 'Grok 3' },
      { id: 'grok-3-mini', label: 'Grok 3 Mini' },
      { id: 'grok-2-1212', label: 'Grok 2' },
    ],
  },
}

export const ENV_KEYS: Record<AiProvider, string> = {
  claude: import.meta.env.VITE_CLAUDE_API_KEY ?? '',
  openai: import.meta.env.VITE_OPENAI_API_KEY ?? '',
  gemini: import.meta.env.VITE_GEMINI_API_KEY ?? '',
  grok:   import.meta.env.VITE_GROK_API_KEY ?? '',
}

export const DEFAULT_PROVIDER = (import.meta.env.VITE_AI_DEFAULT_PROVIDER ?? 'claude') as AiProvider

// ── System Prompt ─────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert ETL pipeline assistant for a visual ETL tool (similar to Talend Open Studio).

## INTERNAL REVIEW (silent — never show this process to the user)
Before writing any response, silently run this checklist once:
1. Are all nodeIds taken from the provided pipeline context? (never invent IDs)
2. Are all table/column names taken from the provided connection schema? (never invent names)
3. Is every JSON block valid and complete — no truncated arrays or objects?
4. Is the text portion under 5 bullet points? (cut anything redundant)
Only output the final answer after all checks pass.

## Response Format (STRICT)
- No preamble. No "I'll help you..." or "Great question!".
- Lead with the answer. Include reasoning only if it changes the action.
- Max 4 bullet points per text section. Merge or drop if more.
- Use these labels for instant scanning:
  - 🔴 **문제** — critical issue blocking execution
  - 🟡 **주의** — potential issue, not blocking
  - 🟢 **확인** — looks correct
  - 🔧 **수정** — fix applied (patch JSON follows)
  - ℹ️ **참고** — optional context, 1 line max

## 1. New Pipeline Design
One-line summary of what the pipeline does, then JSON only:

\`\`\`json
{
  "nodes": [
    { "type": "T_JDBC_INPUT",  "label": "Read Orders", "config": { "connectionId": "...", "tableName": "orders" } },
    { "type": "T_MAP",         "label": "Transform",   "config": {} },
    { "type": "T_JDBC_OUTPUT", "label": "Write Result","config": { "connectionId": "...", "tableName": "result", "writeMode": "INSERT" } }
  ],
  "edges": [
    { "source": 0, "target": 1 },
    { "source": 1, "target": 2 }
  ]
}
\`\`\`
Edges use 0-based array indices. Always include connectionId from the provided connection context.

### T_MAP with multiple outputs (REQUIRED format when T_MAP → 2+ T_JDBC_OUTPUT)
- Add \`"outputIndex": N\` (0-based) to each edge leaving T_MAP.
- Add \`"mappings"\` in T_MAP config: one entry per output, each with its own column list.
- Each output must only reference columns that exist in the target table — never copy another output's column list.

\`\`\`json
{
  "nodes": [
    { "type": "T_JDBC_INPUT",  "label": "Read src", "config": { "connectionId": "conn-A", "tableName": "schema.src_table" } },
    { "type": "T_MAP", "label": "Split", "config": {
        "mappings": [
          { "outputName": "Output 0", "columns": [
              { "source": "id",   "target": "id",   "dataType": "INTEGER" },
              { "source": "name", "target": "name", "dataType": "VARCHAR" }
          ]},
          { "outputName": "Output 1", "columns": [
              { "source": "id",        "target": "id",          "dataType": "INTEGER" },
              { "source": "name",      "target": "name",        "dataType": "VARCHAR" },
              { "expression": "NOW()", "target": "loaded_at",   "dataType": "TIMESTAMP" }
          ]}
        ]
    }},
    { "type": "T_JDBC_OUTPUT", "label": "Write DB-A", "config": { "connectionId": "conn-A", "tableName": "schema.dst_a", "writeMode": "INSERT" } },
    { "type": "T_JDBC_OUTPUT", "label": "Write DB-B", "config": { "connectionId": "conn-B", "tableName": "schema.dst_b", "writeMode": "INSERT" } }
  ],
  "edges": [
    { "source": 0, "target": 1 },
    { "source": 1, "target": 2, "outputIndex": 0 },
    { "source": 1, "target": 3, "outputIndex": 1 }
  ]
}
\`\`\`

## 2. Pipeline Fix (Patch)
Format:
- 🔴 **문제**: [root cause, 1 sentence]
- 🔧 **수정**: [exact change, 1 sentence]

Then patch JSON immediately after:
\`\`\`json
{
  "action": "patch",
  "patches": [
    {
      "nodeId": "T_MAP-1234567890",
      "config": { "mappings": [] },
      "reason": "AMT 컬럼이 스키마에 없음 → AMOUNT로 수정"
    }
  ]
}
\`\`\`
Rules:
- Use ONLY nodeIds from the pipeline context. Never invent nodeIds.
- Only include config keys that need to change (partial update).
- reason: 1 sentence max.
- If a fix requires a new node, use the nodes/edges format instead and state why in 1 line.

## 3. Review & Analysis
Format:
- 🔴/🟡/🟢 one line per finding (max 4)
- If fixable: append patch JSON immediately after bullets.
- If not fixable at config level: 1 sentence explanation, no patch block.

Always flag explicitly — never silently pass:
- 0-row output from a node that should produce data
- Row count anomaly between connected nodes
- Execution time anomaly
- connectionId mismatch between nodes

## 4. Error Analysis
- 🔴 **원인**: [1 sentence]
- 🔴 **영향 노드**: [list]
- 🔧 **수정**: [exact fix]

Append patch JSON if applicable.

## Available Components
T_JDBC_INPUT · T_JDBC_OUTPUT · T_MAP · T_FILTER_ROW · T_AGGREGATE_ROW · T_SORT_ROW · T_JOIN · T_CONVERT_TYPE · T_REPLACE · T_UNION_ROW · T_LOG_ROW · T_PRE_JOB · T_POST_JOB · T_SLEEP · T_LOOP

Respond in the same language the user uses.`

// ── API Callers ───────────────────────────────────────────────

function buildSystemPrompt(config: AiConfig): string {
  return config.systemContext
    ? `${SYSTEM_PROMPT}\n\n${config.systemContext}`
    : SYSTEM_PROMPT
}

async function callClaude(messages: AiMessage[], config: AiConfig): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-allow-browser': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 16000,
      system: buildSystemPrompt(config),
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `Claude API ${res.status}`)
  }
  const data = await res.json() as { content: { type: string; text: string }[] }
  return data.content.find(c => c.type === 'text')?.text ?? ''
}

async function callOpenAI(messages: AiMessage[], config: AiConfig): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 16000,
      messages: [
        { role: 'system', content: buildSystemPrompt(config) },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `OpenAI API ${res.status}`)
  }
  const data = await res.json() as { choices: { message: { content: string } }[] }
  return data.choices[0]?.message.content ?? ''
}

async function callGemini(messages: AiMessage[], config: AiConfig): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: buildSystemPrompt(config) }] },
      contents: messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      })),
      generationConfig: { maxOutputTokens: 65536 },
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      (err as { error?: { message?: string } }).error?.message ?? `Gemini API ${res.status}`
    )
  }
  const data = await res.json() as {
    candidates: { content: { parts: { text: string }[] }; finishReason: string }[]
  }
  const candidate = data.candidates[0]
  if (candidate?.finishReason === 'MAX_TOKENS') {
    console.warn('[Gemini] 응답이 MAX_TOKENS로 잘렸습니다. maxOutputTokens를 늘리거나 요청 범위를 줄이세요.')
  }
  return candidate?.content.parts[0]?.text ?? ''
}

async function callGrok(messages: AiMessage[], config: AiConfig): Promise<string> {
  const res = await fetch('/xai-proxy/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 16000,
      messages: [
        { role: 'system', content: buildSystemPrompt(config) },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `Grok API ${res.status}`)
  }
  const data = await res.json() as { choices: { message: { content: string } }[] }
  return data.choices[0]?.message.content ?? ''
}

// ── Public API ────────────────────────────────────────────────

export async function sendAiMessage(messages: AiMessage[], config: AiConfig): Promise<string> {
  if (!config.apiKey) throw new Error('API 키가 설정되지 않았습니다. .env 파일에 키를 입력해주세요.')
  switch (config.provider) {
    case 'claude': return callClaude(messages, config)
    case 'openai': return callOpenAI(messages, config)
    case 'gemini': return callGemini(messages, config)
    case 'grok':   return callGrok(messages, config)
  }
}

// ── Graph Spec (new pipeline) ─────────────────────────────────
export interface AiNodeSpec {
  type: string
  label: string
  config: Record<string, unknown>
}
export interface AiGraphSpec {
  nodes: AiNodeSpec[]
  edges: { source: number; target: number; outputIndex?: number }[]
}

export function extractGraphSpec(text: string): AiGraphSpec | null {
  const regex = /```(?:json)?\s*([\s\S]*?)```/g
  let match
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as AiGraphSpec & { action?: string }
      if (parsed.action === 'patch') continue
      if (Array.isArray(parsed.nodes)) return parsed
    } catch { /* 다음 블록 시도 */ }
  }
  return null
}

// ── Patch Spec (existing pipeline fix) ───────────────────────
export interface AiPatchItem {
  nodeId: string
  config?: Record<string, unknown>
  label?: string
  reason?: string
}
export interface AiPatchSpec {
  action: 'patch'
  patches: AiPatchItem[]
}

export function extractPatchSpec(text: string): AiPatchSpec | null {
  const regex = /```(?:json)?\s*([\s\S]*?)```/g
  let match
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as AiPatchSpec
      if (parsed.action === 'patch' && Array.isArray(parsed.patches)) return parsed
    } catch { /* 다음 블록 시도 */ }
  }
  return null
}
