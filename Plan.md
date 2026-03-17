# Expression Builder 구현 계획

> **목적**: tMap의 Expression 셀에 `...` 버튼을 추가하고, 클릭 시 확장 편집 팝업을 제공한다.
> 긴 표현식 작성, 소스 컬럼 클릭 삽입, SQL 함수 스니펫 선택을 지원하여 Expression 작성 UX를 개선한다.

---

## 배경 및 결정 요약

빌더.md 분석 결과, Talend의 Expression Builder 기능 중 **현재 미구현이면서 실사용 가치가 높은 항목**은 다음 하나다:

- **개별 Expression 확장 편집 팝업** (`...` 버튼 → 별도 편집 영역)

나머지(배치 편집, Evaluate, 전체 코드 편집 탭)는 현재 수준에서 불필요하거나 이미 대안이 존재한다.

---

## 구현 범위

### In Scope
1. Expression 셀에 `...` 버튼 추가
2. `ExpressionBuilderPopup` 컴포넌트 신규 생성
3. 팝업 내 3-영역 레이아웃:
   - **좌측**: 소스 컬럼 목록 (클릭 → expression에 삽입)
   - **중앙**: 확장 textarea 편집 영역
   - **우측**: SQL 함수 스니펫 팔레트 (String / Date / Number / Null 카테고리)
4. Context 변수 삽입 지원 (`${변수명}` 형태)
5. OK / Cancel 저장

### Out of Scope
- 구문 검사(Evaluate)
- 샘플 데이터 미리보기
- 전체 tMap 표현식 코드 뷰(하단 탭)

---

## Step 1 — UI 설계 확정

**팝업 레이아웃** (`w-[55vw] h-[55vh]`)

```
┌─────────────────────────────────────────────────────────────┐
│ Expression Builder — [타겟 컬럼명]              [X 닫기]     │
├──────────────┬──────────────────────────┬───────────────────┤
│              │                          │                   │
│ 소스 컬럼     │   textarea               │ 함수 팔레트        │
│ (클릭→삽입)  │   (expression 편집)       │ (클릭→삽입)        │
│              │                          │                   │
│ [Context 변수]│                          │ String / Date /   │
│              │                          │ Number / Null     │
│              │                          │                   │
├──────────────┴──────────────────────────┴───────────────────┤
│  현재 값: [expression preview]          [Cancel] [OK]        │
└─────────────────────────────────────────────────────────────┘
```

**결정 사항:**
- 팝업은 tMap 모달 위에 z-index로 띄움 (fixed overlay)
- 소스 컬럼 삽입 시 커서 위치에 텍스트 삽입 (커서 없으면 끝에 추가)
- 함수 삽입 시 `FUNCTION(|)` 형태 삽입 후 인자 위치로 커서 이동
- OK 클릭 시 기존 Expression 인풋 값 업데이트

---

## Step 2 — 함수 스니펫 정의

`frontend/src/utils/expressionSnippets.ts` 신규 파일 생성

```typescript
// 카테고리 / 함수명 / 템플릿 / 설명
export const SNIPPETS = {
  String: [
    { label: 'TRIM',           template: 'TRIM($col)',                  desc: '앞뒤 공백 제거' },
    { label: 'UPPER',          template: 'UPPER($col)',                  desc: '대문자 변환' },
    { label: 'LOWER',          template: 'LOWER($col)',                  desc: '소문자 변환' },
    { label: 'SUBSTR',         template: 'SUBSTR($col, 1, 10)',          desc: '문자열 자르기' },
    { label: 'REPLACE',        template: "REPLACE($col, ' ', '')",       desc: '문자열 치환' },
    { label: 'CONCAT',         template: "CONCAT($col, '')",             desc: '문자열 연결' },
    { label: 'COALESCE(→ \'\')' , template: "COALESCE($col, '')",        desc: 'NULL → 빈 문자열' },
  ],
  Number: [
    { label: 'COALESCE(→ 0)', template: 'COALESCE($col, 0)',            desc: 'NULL → 0' },
    { label: 'ABS',            template: 'ABS($col)',                    desc: '절대값' },
    { label: 'ROUND',          template: 'ROUND($col, 2)',               desc: '반올림(2자리)' },
    { label: 'FLOOR',          template: 'FLOOR($col)',                  desc: '내림' },
    { label: 'CEIL',           template: 'CEIL($col)',                   desc: '올림' },
    { label: 'CAST INT',       template: 'CAST($col AS INTEGER)',        desc: '정수 변환' },
    { label: 'CAST DECIMAL',   template: 'CAST($col AS DECIMAL(18,4))',  desc: '소수 변환' },
  ],
  Date: [
    { label: 'CAST DATE',      template: 'CAST($col AS DATE)',           desc: '날짜 변환' },
    { label: 'CURRENT_DATE',   template: 'CURRENT_DATE',                 desc: '오늘 날짜' },
    { label: 'NOW()',          template: 'NOW()',                        desc: '현재 시각' },
    { label: 'COALESCE(→TODAY)', template: 'COALESCE($col, CURRENT_DATE)', desc: 'NULL → 오늘' },
    { label: 'DATE_TRUNC day', template: "DATE_TRUNC('day', $col)",      desc: '날짜 절삭(일)' },
    { label: 'DATE_TRUNC month', template: "DATE_TRUNC('month', $col)",  desc: '날짜 절삭(월)' },
  ],
  Null: [
    { label: 'COALESCE',       template: 'COALESCE($col, )',             desc: 'NULL 대체' },
    { label: 'NULLIF',         template: 'NULLIF($col, )',               desc: '값이 같으면 NULL' },
    { label: 'IS NULL 체크',   template: 'CASE WHEN $col IS NULL THEN  ELSE $col END', desc: 'NULL 분기' },
  ],
};
```

**`$col` 규칙**: 삽입 시 현재 row의 `sourceColumn` (연결된 소스 컬럼명)으로 자동 치환.
연결이 없으면 `$col` 그대로 삽입하여 사용자가 직접 수정.

---

## Step 3 — ExpressionBuilderPopup 컴포넌트 구현

**파일**: `frontend/src/components/job/ExpressionBuilderPopup.tsx` (신규)

### Props
```typescript
interface Props {
  rowId: string
  targetName: string            // 타겟 컬럼명 (헤더 표시)
  initialExpression: string     // 현재 expression 값
  sourceNodeId: string          // 연결된 소스 노드 ID
  sourceColumn: string          // 연결된 소스 컬럼명
  sourceGroups: SourceGroup[]   // 전체 소스 그룹 (컬럼 목록)
  contextVars: string[]         // JobIR context 변수명 목록
  onApply: (expr: string) => void
  onClose: () => void
}
```

### 구현 포인트

1. **textarea ref** — 커서 위치 기억 (`selectionStart` / `selectionEnd`)
2. **삽입 함수** — `insertAtCursor(text: string)`
   - `textarea.value` 기준으로 selectionStart/End 사이에 text 삽입
   - 삽입 후 커서를 삽입 텍스트 끝으로 이동
3. **소스 컬럼 클릭** — `nodeLabel.colName` 형태로 삽입 (`row1.emp_name`)
4. **스니펫 클릭** — `$col`을 `sourceColumn`으로 치환 후 삽입
5. **Context 변수 클릭** — `${변수명}` 형태로 삽입

---

## Step 4 — MappingEditorModal.tsx 수정

### 4-1. `...` 버튼 추가

Expression `<input>` 오른쪽에 `...` 버튼 추가.

```
│ flex-1 [expression input  ····················] [...] │
```

- Expression div를 `flex` row로 변경
- input은 `flex-1`, `...` 버튼은 `w-5 flex-shrink-0`
- 버튼 클릭 → `openBuilderRowId` state set

### 4-2. State 추가

```typescript
const [openBuilderRowId, setOpenBuilderRowId] = useState<string | null>(null);
```

### 4-3. ExpressionBuilderPopup 마운트

매핑 rows 렌더링 영역 하단에 조건부 렌더링:
```typescript
{openBuilderRowId && (() => {
  const m = activeMappings.find(r => r.id === openBuilderRowId);
  return m ? (
    <ExpressionBuilderPopup
      rowId={m.id}
      targetName={m.targetName}
      initialExpression={m.expression}
      sourceNodeId={m.sourceNodeId}
      sourceColumn={m.sourceColumn}
      sourceGroups={sourceGroups}
      contextVars={Object.keys(contextVarsMeta)}  // JobIR context
      onApply={expr => { updateMapping(m.id, 'expression', expr); setOpenBuilderRowId(null); }}
      onClose={() => setOpenBuilderRowId(null)}
    />
  ) : null;
})()}
```

### 4-4. contextVarsMeta 전달

현재 `MappingEditorModal`의 Props에 `contextVars?: string[]` 추가.
`JobDesignerPage`에서 `ir.context`의 키 목록을 전달.

---

## Step 5 — JobDesignerPage.tsx 수정

`MappingEditorModal`을 열 때 `contextVars` prop 전달:

```typescript
<MappingEditorModal
  ...
  contextVars={Object.keys(currentIr?.context ?? {})}
/>
```

---

## 변경 파일 목록

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `frontend/src/utils/expressionSnippets.ts` | **신규** | SQL 함수 스니펫 정의 |
| `frontend/src/components/job/ExpressionBuilderPopup.tsx` | **신규** | Expression Builder 팝업 컴포넌트 |
| `frontend/src/components/job/MappingEditorModal.tsx` | **수정** | `...` 버튼, openBuilderRowId state, 팝업 마운트, contextVars prop |
| `frontend/src/pages/JobDesignerPage.tsx` | **수정** | contextVars 전달 |

---

## 완료 기준

- [ ] Expression 셀에 `...` 버튼이 표시되고 클릭 시 팝업이 열림
- [ ] 소스 컬럼 클릭 시 `nodeLabel.colName` 형태로 textarea 커서 위치에 삽입됨
- [ ] 함수 스니펫 클릭 시 `$col` → `sourceColumn`으로 치환되어 삽입됨
- [ ] Context 변수 클릭 시 `${변수명}` 삽입됨
- [ ] OK 클릭 시 tMap Expression 셀에 반영됨
- [ ] Cancel / X 클릭 시 변경 없이 닫힘

---

## 우선순위 및 의존성

```
Step 2 (스니펫 정의)
  └── Step 3 (팝업 컴포넌트)
        └── Step 4 (모달 연결)
              └── Step 5 (페이지 props 전달)
```

Step 2 → 3 → 4 → 5 순으로 순차 진행. 각 Step은 독립적으로 커밋 가능.


### 테마 일관성

BUILDER 팝업창이나 내부 UI/UX 색상이나 스타일 등은 tMap을 따라서 진행