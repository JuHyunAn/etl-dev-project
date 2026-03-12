# tMap Expression Strategy — 3-Tier 구현 가이드

> **목적**: tMap Auto Map 시 타입 기반 Expression 자동 삽입으로 인한 에러를 근본적으로 제거하고, ETL 글로벌 표준에 맞는 매핑 전략으로 전환한다.
>
> **핵심 원칙**: "기본은 비우고(passthrough), 필요할 때만 채운다."
>
> Talend, Informatica, DataStage 모두 Auto Map 시 expression 없이 소스 컬럼명만 타겟에 매핑한다. TRIM/COALESCE 등은 사용자가 명시적으로 추가하는 것이지, 시스템이 강제하는 것이 아니다.

---

## 1. 현재 문제

### 1-1. Expression 자동 삽입 문제

- Auto Map 클릭 시 컬럼 TYPE을 보고 TRIM, UPPER, COALESCE 등을 자동 삽입
- 1:1 동일 타입 매핑에서도 불필요한 expression이 붙어 에러 발생
- DB 방언(PostgreSQL/Oracle/MariaDB)을 고려하지 않은 함수 사용
- 에러 발생 시 어떤 expression이 원인인지 추적 어려움

### 1-2. TYPE 열 문제

- `company_id`가 소스에서 `bigserial`인데 TYPE 드롭다운이 `VARCHAR`로 설정됨 → `UPPER(col)` 적용 시 에러
- `founded_date`가 소스에서 `date`인데 `UPPER(col)` 적용 → 의미 없음
- TYPE 드롭다운이 수동 선택이라 타겟 테이블의 실제 컬럼 타입과 무관하게 설정됨
- Auto Map 시 TYPE을 소스 타입도 타겟 타입도 아닌 임의 값으로 설정

### 1-3. 현재 UI 구조 (참고)

```
┌─ Mapping Editor — Map ──────────────────────────────────────────────┐
│ SOURCE              │ 타겟 테이블 헤더       [Auto Map] [Clear]     │
│                     │                                               │
│ DB Input            │ SOURCE COLUMN  TARGET NAME  EXPRESSION  TYPE  │
│  src.company        │ company_id     company_id   UPPER(col)  VARCHAR│
│   ↳ company_id      │ company_name   company_name UPPER(col)  VARCHAR│
│     bigserial       │ ...                                           │
│   ↳ company_name    │                                               │
│     varchar         │                                               │
│   ↳ founded_date    │                                               │
│     date            │                                               │
│   ...               │                                               │
└─────────────────────┴───────────────────────────────────────────────┘
```

**핵심 포인트**: 좌측 SOURCE 패널에 소스 타입(bigserial, varchar, date 등)이 이미 표시되어 있으므로, 매핑 테이블에 Src Type 열을 추가하면 정보 중복이다. **기존 4열 구조를 유지**하되, TYPE 열의 **동작만** 변경한다.

---

## 2. 3-Tier Expression 전략

```
Tier 0: Passthrough  — 기본값. 표현식 없음, 컬럼명만 매핑, TYPE은 타겟 기준 자동 설정
Tier 1: Safe Cast    — 소스↔타겟 타입 불일치 시에만 자동 감지 + 제안
Tier 2: Enhancement  — 사용자가 버튼/메뉴로 선택 적용 (TRIM, COALESCE 등)
```

---

## 3. Tier 0 — Passthrough (Default)

### 3-1. 동작

Auto Map 클릭 시:
1. 소스 컬럼 → 타겟 매핑 (이름 매칭)
2. **Expression은 빈 문자열**
3. **TYPE은 타겟 테이블 컬럼의 실제 타입으로 자동 설정**

### 3-2. TYPE 자동 결정 로직

```typescript
// Auto Map 시 TYPE 결정 우선순위:
//
// 1순위: 타겟 테이블의 columns 정보가 있으면 → 타겟 컬럼 타입 사용
// 2순위: 타겟 정보 없으면 → 소스 컬럼 타입 복사 (임시)
// 3순위: 소스 없는 행 (batch_id, ods_loaded_at 등) → 타겟 컬럼 타입 사용

function resolveType(
  sourceColumn: ColumnInfo | undefined,
  targetColumn: ColumnInfo | undefined,
): string {
  // 타겟 컬럼 정보가 있으면 항상 타겟 우선
  if (targetColumn?.dataType) {
    return targetColumn.dataType;
  }
  // 타겟 없으면 소스 타입 복사 (임시 fallback)
  if (sourceColumn?.dataType) {
    return sourceColumn.dataType;
  }
  // 둘 다 없으면 기본값
  return 'VARCHAR';
}
```

### 3-3. Auto Map 결과 예시

타겟 테이블 `ods.ods_company`의 columns 정보가 로드된 상태에서 Auto Map 실행 시:

```typescript
// Before (현재)
{ sourceColumn: "company_id",  targetName: "company_id",  expression: "UPPER(col)", type: "VARCHAR" }
{ sourceColumn: "founded_date", targetName: "founded_date", expression: "UPPER(col)", type: "VARCHAR" }

// After (변경)
{ sourceColumn: "company_id",  targetName: "company_id",  expression: "", type: "bigint"    }  // 타겟 실제 타입
{ sourceColumn: "founded_date", targetName: "founded_date", expression: "", type: "date"      }  // 타겟 실제 타입
{ sourceColumn: "",             targetName: "batch_id",     expression: "", type: "varchar"   }  // 소스 없음, 타겟 타입
{ sourceColumn: "",             targetName: "ods_loaded_at", expression: "", type: "timestamp" }  // 소스 없음, 타겟 타입
```

### 3-4. 타겟 컬럼 정보 접근 방법

MappingEditorModal은 이미 연결된 Output 노드의 정보를 알고 있다.
타겟 테이블의 columns는 Output 노드의 `config.columns`에 저장되어 있으므로 추가 API 호출 없이 접근 가능.

```typescript
// MappingEditorModal.tsx 내부

// 연결된 Output 노드 찾기 (기존 로직 활용)
const outputNode = nodes.find(n => 
  edges.some(e => e.source === selectedNode.id && e.target === n.id)
  && (n.data.type === 'T_JDBC_OUTPUT')
);

// 타겟 컬럼 맵 구성 (이름 → ColumnInfo)
const targetColumnsMap: Record<string, ColumnInfo> = {};
if (outputNode?.data?.config?.columns) {
  for (const col of outputNode.data.config.columns) {
    targetColumnsMap[col.columnName.toLowerCase()] = col;
  }
}

// Auto Map 시 활용
function autoMap(sourceColumns: ColumnInfo[]) {
  return sourceColumns.map(srcCol => {
    const tgtCol = targetColumnsMap[srcCol.columnName.toLowerCase()];
    return {
      sourceColumn: srcCol.columnName,
      targetName: tgtCol?.columnName ?? srcCol.columnName,
      expression: '',                           // Tier 0: 비움
      type: resolveType(srcCol, tgtCol),        // 타겟 우선
    };
  });
}
```

### 3-5. 기존 Auto Map 로직 제거 대상

현재 `MappingEditorModal.tsx`의 Auto Map에서 아래 로직을 **전부 제거**:

- VARCHAR → `TRIM(col)` 자동 삽입
- `_id`/`_cd`/`_code` 접미사 → `UPPER(TRIM(col))` 자동 삽입
- NUMERIC/INT/DECIMAL → `COALESCE(col, 0)` 자동 삽입
- DATE → `CAST(col AS DATE)` 자동 삽입

**변경 후**: Auto Map은 이름 매칭 + 타겟 기준 TYPE 설정 + expression 비움만 수행.

### 3-6. SQL Pushdown 컴파일 규칙

```
expression이 비어있으면 → SELECT 컬럼명 그대로 사용
expression이 있으면   → SELECT expression AS targetName
```

---

## 4. Tier 1 — Safe Cast (타입 불일치 감지)

### 목적

소스 컬럼과 타겟 컬럼의 타입이 다를 때 **감지 + 경고 + CAST 제안**.
자동 삽입이 아니라 **TYPE 셀에 ⚠️ 경고 표시 + 클릭 시 적용** 방식.

소스 타입은 좌측 SOURCE 패널에 이미 표시되므로, 별도 Src Type 열을 추가하지 않고 TYPE(타겟) 셀의 아이콘만으로 불일치를 표현한다.

### 4-1. 타입 정규화 함수

DB마다 같은 의미의 타입명이 다르므로 계열(family)로 통합한다.

```typescript
// 파일 위치: frontend/src/utils/typeUtils.ts (신규)

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
```

### 4-2. 타입 호환성 판정

```typescript
// 파일 위치: frontend/src/utils/typeUtils.ts (이어서)

export type CastResult = {
  castRequired: boolean;
  expression: string;      // CAST 표현식 (필요 시)
  warning?: string;        // 경고 메시지
  severity: 'none' | 'info' | 'warning' | 'danger';
};

// DB가 안전하게 암묵적 변환하는 조합 (expression 불필요)
const SAFE_IMPLICIT_CASTS = new Set<string>([
  'INTEGER->DECIMAL',     // int → numeric: 손실 없음
  'INTEGER->STRING',      // int → varchar: 안전
  'DECIMAL->STRING',      // numeric → varchar: 안전
  'DATE->TIMESTAMP',      // date → timestamp: 안전
  'DATE->STRING',         // date → varchar: 안전
  'TIMESTAMP->STRING',    // timestamp → varchar: 안전
  'BOOLEAN->INTEGER',     // bool → int: 안전
  'BOOLEAN->STRING',      // bool → varchar: 안전
  'INTEGER->BOOLEAN',     // int → bool: PostgreSQL 지원
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
  colName: string
): CastResult {
  const srcFamily = normalizeType(sourceType);
  const tgtFamily = normalizeType(targetType);
  
  // 같은 계열 → passthrough
  if (srcFamily === tgtFamily) {
    return { castRequired: false, expression: '', severity: 'none' };
  }
  
  const castKey = `${srcFamily}->${tgtFamily}`;
  
  // 안전한 암묵적 변환 → passthrough (DB가 알아서 처리)
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
  
  // 손실 가능 변환 → CAST 제안 + 경고
  const lossyWarning = LOSSY_CASTS[castKey];
  if (lossyWarning) {
    return {
      castRequired: true,
      expression: `CAST(${colName} AS ${targetType})`,
      warning: lossyWarning,
      severity: 'warning',
    };
  }
  
  // 기타 → CAST 제안 (info 레벨)
  return {
    castRequired: true,
    expression: `CAST(${colName} AS ${targetType})`,
    warning: `${sourceType} → ${targetType} 타입 변환`,
    severity: 'info',
  };
}
```

### 4-3. UI 표시 규칙

TYPE 셀 내부에 아이콘을 표시한다. 별도 Status 열을 추가하지 않고 기존 4열 구조 유지.

| severity | TYPE 셀 표시 | 동작 |
|----------|-------------|------|
| `none` | 타입명만 표시 | passthrough |
| `info` | 타입명 + ℹ️ | hover 시 "Source: bigserial → Target: bigint" 툴팁 |
| `warning` | 타입명 + ⚠️ + 행 연한 주황 하이라이트 | hover 시 경고 메시지 툴팁, 클릭 시 CAST expression 삽입 |
| `danger` | 타입명 + ❌ + 행 연한 빨강 하이라이트 | hover 시 "변환 불가" 메시지, 매핑 재검토 유도 |

**중요**: severity가 `warning`/`danger`여도 **expression을 자동 삽입하지 않는다**.
⚠️ 아이콘 클릭 시 제안된 CAST expression을 expression 필드에 채우는 방식.

---

## 5. Tier 2 — Enhancement (사용자 선택 적용)

### 5-1. 타입별 추천 표현식

```typescript
// 파일 위치: frontend/src/utils/typeUtils.ts (이어서)

export interface Enhancement {
  label: string;
  description: string;
  apply: (colName: string) => string;
}

export const ENHANCEMENTS: Record<TypeFamily, Enhancement[]> = {
  STRING: [
    {
      label: 'TRIM',
      description: '앞뒤 공백 제거',
      apply: (col) => `TRIM(${col})`,
    },
    {
      label: 'UPPER',
      description: '대문자 변환',
      apply: (col) => `UPPER(${col})`,
    },
    {
      label: 'TRIM + UPPER',
      description: '공백 제거 + 대문자',
      apply: (col) => `UPPER(TRIM(${col}))`,
    },
    {
      label: 'NULL → 빈 문자열',
      description: 'NULL을 빈 문자열로 대체',
      apply: (col) => `COALESCE(${col}, '')`,
    },
    {
      label: 'TRIM + NULL 처리',
      description: '공백 제거 + NULL 대체',
      apply: (col) => `COALESCE(TRIM(${col}), '')`,
    },
  ],
  INTEGER: [
    {
      label: 'NULL → 0',
      description: 'NULL을 0으로 대체',
      apply: (col) => `COALESCE(${col}, 0)`,
    },
    {
      label: 'ABS',
      description: '절대값',
      apply: (col) => `ABS(${col})`,
    },
  ],
  DECIMAL: [
    {
      label: 'NULL → 0',
      description: 'NULL을 0으로 대체',
      apply: (col) => `COALESCE(${col}, 0)`,
    },
    {
      label: 'ROUND(2)',
      description: '소수점 2자리 반올림',
      apply: (col) => `ROUND(${col}, 2)`,
    },
    {
      label: 'NULL → 0 + ROUND(2)',
      description: 'NULL 대체 + 반올림',
      apply: (col) => `ROUND(COALESCE(${col}, 0), 2)`,
    },
  ],
  DATE: [
    {
      label: 'NULL → 오늘',
      description: 'NULL을 현재 날짜로 대체',
      apply: (col) => `COALESCE(${col}, CURRENT_DATE)`,
    },
  ],
  TIMESTAMP: [
    {
      label: 'NULL → 현재시각',
      description: 'NULL을 현재 시각으로 대체',
      apply: (col) => `COALESCE(${col}, NOW())`,
    },
    {
      label: '날짜만 추출',
      description: '시간 정보 제거 (일 단위 절삭)',
      apply: (col) => `DATE_TRUNC('day', ${col})`,
    },
  ],
  BOOLEAN: [
    {
      label: 'NULL → false',
      description: 'NULL을 false로 대체',
      apply: (col) => `COALESCE(${col}, false)`,
    },
  ],
  BINARY:  [],
  JSON:    [],
  UNKNOWN: [],
};
```

### 5-2. 일괄 Enhancement 적용 옵션

"Enhancements" 버튼 클릭 시 드롭다운 체크박스:

```typescript
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
      return `COALESCE(${col}, ${defaults[family] || 'NULL'})`;
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
```

---

## 6. UI 변경사항 — MappingEditorModal.tsx

### 6-1. 기존 열 구조 유지

별도 Src Type 열을 추가하지 않는다. 소스 타입은 좌측 SOURCE 패널에 이미 표시되어 있으므로 정보 중복.

```
유지: │ SOURCE COLUMN │ TARGET NAME │ EXPRESSION │ TYPE │
```

### 6-2. 상단 버튼 영역

```
기존:  [✨ Auto Map]  [Clear]
변경:  [✨ Auto Map]  [Enhancements ▼]  [Clear]
```

- **Auto Map**: Tier 0만 수행 (이름 매칭 + 타겟 기준 TYPE 자동 설정 + expression 비움)
- **Enhancements ▼**: 드롭다운 체크박스 → 선택 항목만 일괄 적용 (Tier 2)

### 6-3. Auto Map 적용 Before / After

**Before (현재)**:
```
SOURCE COLUMN    TARGET NAME     EXPRESSION    TYPE
company_id       company_id      UPPER(col)    VARCHAR  ← 소스 bigserial인데 VARCHAR?
company_name     company_name    UPPER(col)    VARCHAR
business_no      business_no     UPPER(col)    VARCHAR
ceo_name         ceo_name        UPPER(col)    VARCHAR
founded_date     founded_date    UPPER(col)    VARCHAR  ← 소스 date인데 UPPER?
status_cd        status_cd       UPPER(col)    VARCHAR  ← 소스 bpchar
-- 선택 --       batch_id        UPPER(col)    VARCHAR
-- 선택 --       ods_loaded_at   UPPER(col)    VARCHAR  ← 타겟 timestamp인데 VARCHAR?
```

**After (변경)**:
```
SOURCE COLUMN    TARGET NAME     EXPRESSION    TYPE
company_id       company_id                    BIGINT       ← 타겟 실제 타입
company_name     company_name                  VARCHAR      ← 타겟 실제 타입
business_no      business_no                   VARCHAR
ceo_name         ceo_name                      VARCHAR
founded_date     founded_date                  DATE         ← 타겟 실제 타입
status_cd        status_cd                     BPCHAR       ← 타겟 실제 타입
-- 선택 --       batch_id                      VARCHAR      ← 소스 없음, 타겟 타입
-- 선택 --       ods_loaded_at                 TIMESTAMP    ← 소스 없음, 타겟 타입
```

### 6-4. TYPE 셀 내 타입 불일치 표시 (Tier 1)

Auto Map 후, 소스 타입과 TYPE(타겟)을 비교하여 불일치 아이콘을 TYPE 셀 내에 표시:

```
SOURCE COLUMN    TARGET NAME     EXPRESSION    TYPE
emp_id           emp_id                        BIGINT
emp_name         emp_name                      VARCHAR
salary           salary                        NUMERIC       ⚠️  ← 소스 FLOAT8, 타겟 NUMERIC
created_at       reg_date                      DATE          ⚠️  ← 소스 TIMESTAMP, 타겟 DATE
```

- ⚠️ hover → 툴팁: "Source: float8 → Target: numeric (소수점 이하 손실 가능)"
- ⚠️ 클릭 → Expression에 `CAST(salary AS NUMERIC)` 자동 삽입

### 6-5. 💡 Enhancement 팝오버

각 행 우측 끝에 💡 아이콘. 클릭 시 해당 타입의 Enhancement 목록 표시:

```
┌─────────────────────────────┐
│ STRING 표현식 추천           │
│                              │
│  ▸ TRIM         공백 제거    │
│  ▸ UPPER        대문자       │
│  ▸ TRIM + UPPER             │
│  ▸ NULL → ''    NULL 대체    │
│  ▸ TRIM + NULL 처리          │
│                              │
│ 클릭 시 expression에 삽입    │
└─────────────────────────────┘
```

---

## 7. SQL Pushdown 컴파일 규칙 변경

### 7-1. SqlPushdownAdapter 수정

```
기존: expression이 항상 존재한다고 가정하고 SELECT에 포함
변경: expression 유무에 따라 분기
```

```kotlin
// backend: SqlPushdownAdapter.kt 내 SELECT 절 생성 로직

fun buildSelectExpression(mapping: MapColumn): String {
    val expr = mapping.expression?.trim()
    val srcCol = quoteIdentifier(mapping.sourceColumn)
    val tgtCol = quoteIdentifier(mapping.targetName)
    
    return when {
        // expression 있으면 우선 사용
        !expr.isNullOrEmpty() -> "$expr AS $tgtCol"
        // expression 비어있고 이름이 다르면 alias
        mapping.sourceColumn != mapping.targetName -> "$srcCol AS $tgtCol"
        // 동일하면 그대로
        else -> srcCol
    }
}
```

---

## 8. 구현 파일 목록

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `frontend/src/utils/typeUtils.ts` | **신규** | normalizeType, resolveCast, ENHANCEMENTS, BULK_ENHANCEMENTS |
| `frontend/src/components/job/MappingEditorModal.tsx` | **수정** | Auto Map 로직 변경 (Tier 0 + TYPE 타겟 기준 설정), Enhancements 드롭다운 추가, ⚠️/💡 UI 추가 |
| `frontend/src/types/index.ts` | **수정** | MapColumn 타입에 `castRequired?`, `castWarning?`, `severity?` 필드 추가 (선택) |
| `backend/.../SqlPushdownAdapter.kt` | **수정** | buildSelectExpression 분기 로직 (expression 비어있을 때 passthrough) |

---

## 9. 구현 우선순위

```
Phase 1 (즉시): Auto Map → Tier 0 전환
  - MappingEditorModal.tsx에서 기존 타입→expression 자동 삽입 로직 전부 제거
  - Expression을 빈 문자열로 설정
  - TYPE을 타겟 테이블 컬럼의 실제 타입으로 자동 설정 (resolveType 함수)
  - SqlPushdownAdapter에 expression 빈 경우 passthrough 로직 추가
  → 이것만으로 기존 에러 대부분 해소

Phase 2 (이후): Tier 1 타입 불일치 감지
  - typeUtils.ts 신규 생성 (normalizeType, resolveCast)
  - MappingEditorModal TYPE 셀에 ⚠️ 경고 아이콘 추가
  - 소스/타겟 타입 비교 로직 연결

Phase 3 (이후): Tier 2 Enhancement 메뉴
  - 💡 팝오버 UI 구현
  - Enhancements 드롭다운 일괄 적용 구현
```

---

## 10. 비교 요약

| 관점 | 현재 | 변경 (3-Tier) |
|------|------|---------------|
| Expression | 타입 보고 TRIM/UPPER/COALESCE 자동 삽입 → 에러 | passthrough (비움) → 에러 없음 |
| TYPE 열 | 수동 드롭다운, 타겟 테이블과 무관 | 타겟 테이블 컬럼의 실제 타입으로 자동 설정 |
| 타입 불일치 | 무시하거나 일괄 CAST | 감지 + TYPE 셀 ⚠️ 경고 + CAST 제안 |
| 사용자 제어 | 없음 (전부 자동) | Enhancement를 선택적 적용 |
| DB 방언 | 고려 없음 | normalizeType으로 계열 통합 |
| 디버깅 | 어떤 expression이 에러인지 추적 어려움 | expression 비어있으면 즉시 제외 → 범위 축소 |
| UI 구조 | 4열 (SOURCE COLUMN, TARGET NAME, EXPRESSION, TYPE) | **4열 유지** — 동작만 변경 |
| 글로벌 표준 | 비표준 | Talend/Informatica/DataStage 동일 방식 |
