export type AiProvider = 'claude' | 'openai' | 'gemini'

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
      { id: 'gemini-2.5-flash',   label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-flash-lite',     label: 'Gemini 2.5 Flash Lite' },
      { id: 'gemini-2.0-flash',   label: 'Gemini 2.0 Flash' },
    ],
  },
}

export const ENV_KEYS: Record<AiProvider, string> = {
  claude: import.meta.env.VITE_CLAUDE_API_KEY ?? '',
  openai: import.meta.env.VITE_OPENAI_API_KEY ?? '',
  gemini: import.meta.env.VITE_GEMINI_API_KEY ?? '',
}

export const DEFAULT_PROVIDER = (import.meta.env.VITE_AI_DEFAULT_PROVIDER ?? 'claude') as AiProvider

// ── System Prompt ─────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an ETL pipeline design assistant for a visual ETL tool (similar to Talend Open Studio).
The user will describe what data pipeline they need, and you will help design it.

Available ETL component types:
- T_JDBC_INPUT    : Read data from a database table or SQL query
- T_JDBC_OUTPUT   : Write data to a database table
- T_MAP           : Map/transform columns between source and target
- T_FILTER_ROW    : Filter rows by a SQL-like condition
- T_AGGREGATE_ROW : Group by and aggregate (SUM, COUNT, AVG, etc.)
- T_SORT_ROW      : Sort rows by specified columns
- T_JOIN          : Join two data streams (INNER, LEFT, RIGHT, FULL)
- T_CONVERT_TYPE  : Convert column data types
- T_REPLACE       : Replace column values by rules
- T_UNION_ROW     : Union two or more data streams
- T_LOG_ROW       : Log/monitor the data passing through
- T_PRE_JOB       : Execute before the main job
- T_POST_JOB      : Execute after the main job
- T_SLEEP         : Add delay between components

When asked to create an ETL pipeline, always respond with:
1. A brief explanation of the pipeline design
2. A JSON code block with this exact structure:

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

Edges use 0-based array indices (0 = first node, 1 = second node, ...).
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

// ── Public API ────────────────────────────────────────────────

export async function sendAiMessage(messages: AiMessage[], config: AiConfig): Promise<string> {
  if (!config.apiKey) throw new Error('API 키가 설정되지 않았습니다. .env 파일에 키를 입력해주세요.')
  switch (config.provider) {
    case 'claude': return callClaude(messages, config)
    case 'openai': return callOpenAI(messages, config)
    case 'gemini': return callGemini(messages, config)
  }
}

// Extract JSON node config from AI response text
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
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1]) as AiGraphSpec
    if (!Array.isArray(parsed.nodes)) return null
    return parsed
  } catch {
    return null
  }
}
