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
You have two core capabilities:

## Response Style (STRICT)
- **Be concise.** 3 sentences max per section. No preamble, no pleasantries.
- Use bullet points. Lead with the answer, not the reasoning.
- For code/SQL: show the exact corrected value, not a template.
- Skip "I'll help you..." or "Great question!" type phrases.

## 1. New Pipeline Design
When asked to **create** a new pipeline, output a brief description + JSON:

\`\`\`json
{
  "nodes": [
    { "type": "T_JDBC_INPUT",  "label": "Read Orders", "config": { "tableName": "orders" } },
    { "type": "T_MAP",         "label": "Transform",   "config": {} },
    { "type": "T_JDBC_OUTPUT", "label": "Write Result","config": { "tableName": "result", "writeMode": "INSERT" } }
  ],
  "edges": [
    { "source": 0, "target": 1 },
    { "source": 1, "target": 2 }
  ]
}
\`\`\`
Edges use 0-based array indices.

## 2. Existing Pipeline Fix (Patch)
When the user asks to **fix, modify, auto-correct** the existing pipeline, respond with:
1. Brief analysis (bullets, 3 lines max)
2. Patch JSON using the **exact nodeId** from the pipeline context:

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
- Use ONLY nodeIds that exist in the provided pipeline context.
- Only include config keys that need to change (partial update).
- reason must be one sentence explaining the fix.
- If a fix requires a new node, use the "nodes/edges" format instead and explain why.

## 3. Result Analysis & Review
When the user asks to **analyze results, review, or optimize** the existing pipeline:
1. Concise analysis (bullets, 3 lines max)
2. **CRITICAL**: Never silently ignore suspicious results. If any of these are present, flag them explicitly:
   - Unexpected 0-row outputs from nodes that should produce data
   - Row count mismatch between connected nodes (e.g. JOIN output > inputs)
   - Execution time anomalies
   - Data flow that doesn't match the pipeline's intended structure
3. If fixable issues are found, **append patch JSON** in the same response.
   If no config-level fix is possible (e.g. pure logic/design issue), omit the patch block and explain why.

## 4. Error Analysis
When execution logs show a FAILED status:
- **원인**: [one sentence root cause]
- **영향 노드**: [list affected nodes]
- **수정**: [exact fix description]

Then immediately append the patch JSON block if the fix applies to existing nodes.

## Available ETL Components
T_JDBC_INPUT · T_JDBC_OUTPUT · T_MAP · T_FILTER_ROW · T_AGGREGATE_ROW · T_SORT_ROW · T_JOIN · T_CONVERT_TYPE · T_REPLACE · T_UNION_ROW · T_LOG_ROW · T_PRE_JOB · T_POST_JOB · T_SLEEP

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
      max_tokens: 4096,
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
      max_tokens: 4096,
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
      generationConfig: { maxOutputTokens: 4096 },
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      (err as { error?: { message?: string } }).error?.message ?? `Gemini API ${res.status}`
    )
  }
  const data = await res.json() as {
    candidates: { content: { parts: { text: string }[] } }[]
  }
  return data.candidates[0]?.content.parts[0]?.text ?? ''
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
      max_tokens: 4096,
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
  edges: { source: number; target: number }[]
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
