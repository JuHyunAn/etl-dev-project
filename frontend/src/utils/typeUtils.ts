// ── Type Family 정규화 ────────────────────────────────────────────

export type TypeFamily =
  | 'STRING' | 'INTEGER' | 'DECIMAL' | 'DATE'
  | 'TIMESTAMP' | 'BOOLEAN' | 'BINARY' | 'JSON' | 'UNKNOWN';

const TYPE_FAMILIES: Record<TypeFamily, string[]> = {
  STRING:    ['VARCHAR', 'CHAR', 'TEXT', 'NVARCHAR', 'NCHAR',
              'CHARACTER VARYING', 'CLOB', 'BPCHAR', 'VARCHAR2',
              'NCLOB', 'LONG', 'TINYTEXT', 'MEDIUMTEXT', 'LONGTEXT'],
  INTEGER:   ['INT', 'INTEGER', 'SMALLINT', 'BIGINT', 'TINYINT',
              'INT2', 'INT4', 'INT8', 'SERIAL', 'BIGSERIAL',
              'SMALLSERIAL', 'MEDIUMINT', 'NUMBER'],
  DECIMAL:   ['DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'REAL',
              'DOUBLE PRECISION', 'FLOAT4', 'FLOAT8', 'MONEY'],
  DATE:      ['DATE'],
  TIMESTAMP: ['TIMESTAMP', 'TIMESTAMPTZ', 'TIMESTAMP WITH TIME ZONE',
              'TIMESTAMP WITHOUT TIME ZONE', 'DATETIME', 'DATETIME2',
              'SMALLDATETIME'],
  BOOLEAN:   ['BOOLEAN', 'BOOL', 'BIT'],
  BINARY:    ['BYTEA', 'BLOB', 'BINARY', 'VARBINARY', 'RAW',
              'LONGBLOB', 'MEDIUMBLOB', 'TINYBLOB'],
  JSON:      ['JSON', 'JSONB'],
  UNKNOWN:   [],
};

export function normalizeType(rawType: string): TypeFamily {
  const t = rawType.toUpperCase().replace(/\(.*\)/, '').trim();
  for (const [family, types] of Object.entries(TYPE_FAMILIES)) {
    if (types.includes(t)) return family as TypeFamily;
  }
  // Oracle NUMBER(p,s): scale > 0이면 DECIMAL, 아니면 INTEGER
  if (t === 'NUMBER') {
    const match = rawType.match(/\(\d+\s*,\s*(\d+)\)/);
    if (match && parseInt(match[1]) > 0) return 'DECIMAL';
    return 'INTEGER';
  }
  return 'UNKNOWN';
}

// ── Tier 1: Safe Cast (타입 불일치 감지) ─────────────────────────

export type CastResult = {
  castRequired: boolean;
  expression: string;
  warning?: string;
  severity: 'none' | 'info' | 'warning' | 'danger';
};

// DB가 안전하게 암묵적 변환하는 조합 (expression 불필요)
const SAFE_IMPLICIT_CASTS = new Set<string>([
  'INTEGER->DECIMAL',
  'INTEGER->STRING',
  'DECIMAL->STRING',
  'DATE->TIMESTAMP',
  'DATE->STRING',
  'TIMESTAMP->STRING',
  'BOOLEAN->INTEGER',
  'BOOLEAN->STRING',
  'INTEGER->BOOLEAN',
]);

// 위험한 변환 (데이터 손실 또는 런타임 에러 가능)
const LOSSY_CASTS: Record<string, string> = {
  'DECIMAL->INTEGER':  '소수점 이하 손실 가능',
  'STRING->INTEGER':   '숫자가 아닌 값이 있으면 에러 발생',
  'STRING->DECIMAL':   '숫자가 아닌 값이 있으면 에러 발생',
  'STRING->DATE':      '날짜 포맷이 맞지 않으면 에러 발생',
  'STRING->TIMESTAMP': '날짜/시간 포맷이 맞지 않으면 에러 발생',
  'STRING->BOOLEAN':   'DB마다 변환 규칙이 다름',
  'TIMESTAMP->DATE':   '시간 정보 손실',
};

// 불가능한 변환
const INCOMPATIBLE_CASTS = new Set<string>([
  'BINARY->INTEGER',
  'BINARY->DATE',
  'JSON->INTEGER',
  'JSON->DATE',
  'JSON->BOOLEAN',
]);

export function resolveCast(
  sourceType: string,
  targetType: string,
  colName: string,
): CastResult {
  const srcFamily = normalizeType(sourceType);
  const tgtFamily = normalizeType(targetType);

  // 같은 계열 → passthrough
  if (srcFamily === tgtFamily) {
    return { castRequired: false, expression: '', severity: 'none' };
  }

  const castKey = `${srcFamily}->${tgtFamily}`;

  // 안전한 암묵적 변환 → passthrough
  if (SAFE_IMPLICIT_CASTS.has(castKey)) {
    return { castRequired: false, expression: '', severity: 'none' };
  }

  // 불가능한 변환
  if (INCOMPATIBLE_CASTS.has(castKey)) {
    return {
      castRequired: true,
      expression: '',
      warning: `${sourceType} → ${targetType}: 변환 불가. 매핑 재검토 필요`,
      severity: 'danger',
    };
  }

  // 손실 가능 변환
  const lossyWarning = LOSSY_CASTS[castKey];
  if (lossyWarning) {
    return {
      castRequired: true,
      expression: `CAST(${colName} AS ${targetType})`,
      warning: lossyWarning,
      severity: 'warning',
    };
  }

  // 기타 타입 변환
  return {
    castRequired: true,
    expression: `CAST(${colName} AS ${targetType})`,
    warning: `${sourceType} → ${targetType} 타입 변환`,
    severity: 'info',
  };
}

// ── Tier 2: Enhancement (사용자 선택 적용) ───────────────────────

export interface Enhancement {
  label: string;
  description: string;
  apply: (colName: string) => string;
}

export const ENHANCEMENTS: Record<TypeFamily, Enhancement[]> = {
  STRING: [
    { label: 'TRIM',           description: '앞뒤 공백 제거',         apply: (col) => `TRIM(${col})` },
    { label: 'UPPER',          description: '대문자 변환',             apply: (col) => `UPPER(${col})` },
    { label: 'TRIM + UPPER',   description: '공백 제거 + 대문자',      apply: (col) => `UPPER(TRIM(${col}))` },
    { label: "NULL → ''",      description: 'NULL을 빈 문자열로 대체', apply: (col) => `COALESCE(${col}, '')` },
    { label: 'TRIM + NULL 처리', description: '공백 제거 + NULL 대체', apply: (col) => `COALESCE(TRIM(${col}), '')` },
  ],
  INTEGER: [
    { label: 'NULL → 0', description: 'NULL을 0으로 대체', apply: (col) => `COALESCE(${col}, 0)` },
    { label: 'ABS',      description: '절대값',            apply: (col) => `ABS(${col})` },
  ],
  DECIMAL: [
    { label: 'NULL → 0',           description: 'NULL을 0으로 대체',       apply: (col) => `COALESCE(${col}, 0)` },
    { label: 'ROUND(2)',            description: '소수점 2자리 반올림',      apply: (col) => `ROUND(${col}, 2)` },
    { label: 'NULL → 0 + ROUND(2)', description: 'NULL 대체 + 반올림',      apply: (col) => `ROUND(COALESCE(${col}, 0), 2)` },
  ],
  DATE: [
    { label: 'NULL → 오늘', description: 'NULL을 현재 날짜로 대체', apply: (col) => `COALESCE(${col}, CURRENT_DATE)` },
  ],
  TIMESTAMP: [
    { label: 'NULL → 현재시각', description: 'NULL을 현재 시각으로 대체',   apply: (col) => `COALESCE(${col}, NOW())` },
    { label: '날짜만 추출',     description: '시간 정보 제거 (일 단위 절삭)', apply: (col) => `DATE_TRUNC('day', ${col})` },
  ],
  BOOLEAN: [
    { label: 'NULL → false', description: 'NULL을 false로 대체', apply: (col) => `COALESCE(${col}, false)` },
  ],
  BINARY:  [],
  JSON:    [],
  UNKNOWN: [],
};

// ── Bulk Enhancement ─────────────────────────────────────────────

export interface BulkEnhancementOption {
  id: string;
  label: string;
  description: string;
  applyTo: TypeFamily[];
  apply: (colName: string, typeFamily: TypeFamily) => string;
}

export const BULK_ENHANCEMENTS: BulkEnhancementOption[] = [
  {
    id: 'trim_strings',
    label: 'Trim strings',
    description: '모든 STRING 컬럼에 TRIM 적용',
    applyTo: ['STRING'],
    apply: (col) => `TRIM(${col})`,
  },
  {
    id: 'null_safe',
    label: 'Null-safe (COALESCE)',
    description: '모든 컬럼에 타입별 기본값으로 NULL 대체',
    applyTo: ['STRING', 'INTEGER', 'DECIMAL', 'BOOLEAN'],
    apply: (col, family) => {
      const defaults: Record<string, string> = {
        STRING: "''", INTEGER: '0', DECIMAL: '0', BOOLEAN: 'false',
      };
      return `COALESCE(${col}, ${defaults[family] ?? 'NULL'})`;
    },
  },
  {
    id: 'upper_codes',
    label: 'Uppercase codes',
    description: '_cd, _code, _id 접미사 STRING 컬럼만 대문자 변환',
    applyTo: ['STRING'],
    apply: (col) => `UPPER(TRIM(${col}))`,
  },
];
