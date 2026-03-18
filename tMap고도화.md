## tMap 고도화 가이드 (Agent용)

ETL Platform의 tMap 관련 기능(Var, Expression Builder, 검증 등)을 개발할 때 **항상 이 문서를 기준**으로 삼는다.  
Talend tMap을 레퍼런스로 하되, 현재 아키텍처(SQL Pushdown + FAP 인메모리 엔진)에 맞게 축약/조정한 설계다.

---

## 1. tMap + Var 전체 구조 개요

- 기본 구조

  - Input Row  
    ↓  
  - **Var (중간 계산 / 변환)**  
    ↓  
  - Output Row

- 특징
  - 모든 계산은 **row 단위**로 수행된다.
  - Var는 **tMap 내부에서만** 사용된다 (다른 컴포넌트에서 직접 접근 불가).
  - Output 컬럼은 **Input 컬럼 + Var + Context**를 조합해 구성된다.

예시 (의도만 설명):

- `Var.total_salary = row.salary + row.bonus`
- `Var.grade = Var.total_salary > 7000 ? "A" : "B"`
- Output:
  - `total_salary = Var.total_salary`
  - `vip_flag = Var.total_salary > 7000`

---

## 2. Var(중간변수)의 역할과 필요성

### 2.1 역할

Talend 기준으로 Var는 단순 편의가 아니라 **변환 로직을 계층화하는 핵심 레이어**다.

- **중간 계산 결과 캐시**
  - 복잡한 식을 여러 Output 컬럼에서 쓰고 싶을 때, Var에 한 번 정의해서 재사용.
- **조건/분기 로직 캡슐화**
  - “급여 + 보너스 → 등급 → VIP 여부” 등 여러 단계를 Var로 나눠 표현.
- **복잡한 표현식 분해(가독성/유지보수)**
  - 한 줄짜리 거대한 Expression 대신, 의미 있는 단위 Var 여러 개로 나눈다.
- **멀티 Output에서 공통 사용**
  - tMap이 여러 Output을 가질 때, Var는 공통 계산 레이어로 쓰인다.

### 2.2 실무 패턴 예시

#### 예시 1: 급여/등급 계산

- 입력 테이블 `EMPLOYEE`
  - `emp_id, dept_code, salary, bonus`

- Var 정의
  - `Var.total_salary = row.salary + row.bonus`
  - `Var.salary_grade = Var.total_salary > 7000 ? "A" : Var.total_salary > 5000 ? "B" : "C"`

- Output 매핑 (EMPLOYEE_DW)
  - `emp_id       = row.emp_id`
  - `total_salary = Var.total_salary`
  - `salary_grade = Var.salary_grade`

#### 예시 2: 코드 → 라벨 변환

- Var 정의
  - `Var.dept_name = row.dept_code.equals("D01") ? "HR" : row.dept_code.equals("D02") ? "IT" : "ETC"`

- Output
  - `dept_name = Var.dept_name`

### 2.3 권장 구성 순서

Var 영역은 보통 다음 순서로 쌓는 것이 좋다.

1. **데이터 정제** (`Var.clean_name`, `Var.trimmed_code`)
2. **계산 로직** (`Var.total_salary`)
3. **비즈니스 조건** (`Var.vip_flag`, `Var.salary_grade`)
4. **코드 변환** (`Var.dept_name`, `Var.status_label`)

---

## 3. Expression DSL 기본 원칙

현재 엔진은 **SQL Pushdown** 과 **FAP(Fetch-and-Process)** 두 경로를 가진다.  
Expression DSL은 두 경로 모두에서 안전하게 동작하는 범위만 1차 지원 대상으로 삼는다.

### 3.1 지원 패턴(1차)

- **컬럼 참조**
  - `col.colName`
  - `col.table_col` (테이블 alias가 필요하면 향후 확장)
- **Var 참조**
  - `var.varName`
- **Context 참조**
  - `ctx.VAR_NAME`
- **문자열 함수**
  - `TRIM(x)`
  - `UPPER(x)`
- **널 처리**
  - `COALESCE(x, default)`
- **캐스팅**
  - `CAST(x AS TYPE)`
- **리터럴**
  - 문자열: `'ABC'`
  - 숫자: `123`, `3.14`

> 이 외의 복잡한 함수/패턴은 **표면적으로는 허용될 수 있지만, 에이전트는 기본 DSL 범위를 벗어나는 예시/스니펫을 새로 만들지 않는다.**  
> DSL 확장은 별도 설계/검토 후에만 진행한다.

### 3.2 Prefix 규칙 (중요)

컬럼 vs Var vs Context를 구분하기 위해 **prefix를 강제**한다.

- 컬럼: `col.컬럼명`  
  예: `col.order_date`, `col.first_name`
- Var: `var.변수명`  
  예: `var.order_date_key`, `UPPER(var.full_name)`
- Context: `ctx.이름`  
  예: `ctx.BIZ_DT`, `ctx.BATCH_NO`

표현식 예:

```text
CAST(col.order_date AS INTEGER)
TRIM(col.first_name) || ' ' || TRIM(col.last_name)
UPPER(var.full_name)
COALESCE(col.status, 'UNKNOWN')
ctx.BIZ_DT
```

**장점**

- Parser/Validator 구현이 단순해진다.
- 어떤 토큰이 컬럼/Var/Context인지 즉시 판단 가능.
- DSL을 확장해도 prefix 체계만 유지하면 안정적으로 파싱 가능하다.

> 에이전트는 **새 Expression을 생성/수정할 때 항상 prefix를 붙여야 한다.**  
> 레거시 표현식(예: `order_date`만 있는 형태)을 발견하면, 점진적으로 `col.order_date` 식으로 마이그레이션하는 방향을 권장한다.

### 3.3 FAP/Pushdown 공통 제약

- FAP(`FetchAndProcessExecutor.evaluateExpression`)가 지원하지 않는 연산은,  
  Pushdown에서도 **스니펫/예시 차원에서 사용하지 않는다.**
- 향후 DSL 확장은:
  1. FAP 평가기 → 2. Pushdown Compiler → 3. Builder/스니펫 순으로 동기 확장한다.

---

## 4. Var JSON 스키마 및 ID 설계

### 4.1 IR(JSON) 스키마 (tMap 노드 단위)

`JobIR.nodes[].config` 안에 `vars` 배열을 둔다:

```json
{
  "id": "T_MAP-1234",
  "type": "T_MAP",
  "label": "주문 매핑",
  "config": {
    "vars": [
      {
        "id": "var-1",
        "name": "order_date_key",
        "type": "INTEGER",
        "expression": "CAST(col.order_date AS INTEGER)"
      },
      {
        "id": "var-2",
        "name": "full_name",
        "type": "VARCHAR",
        "expression": "TRIM(col.first_name) || ' ' || TRIM(col.last_name)"
      }
    ],
    "outputMappings": {
      "T_JDBC_OUTPUT-1": [
        {
          "id": "map-1",
          "sourceNodeId": "T_JDBC_INPUT-1",
          "sourceColumn": "order_id",
          "targetName": "order_id",
          "expression": "col.order_id",
          "type": "INTEGER"
        },
        {
          "id": "map-2",
          "sourceNodeId": "T_JDBC_INPUT-1",
          "sourceColumn": "order_date",
          "targetName": "order_date_key",
          "expression": "var.order_date_key",
          "type": "INTEGER"
        }
      ]
    }
  }
}
```

### 4.2 필드 설명

- `id` (Var 레벨)
  - UI Drag & Drop / diff 추적용 **안정적인 식별자**.
  - 예: `"var-" + uuid` 혹은 `"var-" + 증가번호`.
- `name`
  - 사용자가 보는 Var 이름. Expression에서는 `var.name` 으로 참조.
  - 규칙: `^[A-Za-z_][A-Za-z0-9_]*$` (숫자로 시작 금지).
- `type`
  - 결과 타입 문자열. 기존 tMap 타입 리스트(`VARCHAR`, `INTEGER`, `DECIMAL`, `DATE`, `TIMESTAMP`, `BOOLEAN` 등) 재사용.
- `expression`
  - DSL 문자열. `col.*`, `var.*`, `ctx.*` 및 허용 함수만 사용.

> 규칙: `vars` 배열의 순서가 **평가 순서**다.  
> 위 Var는 아래 Var에서 참조 가능하지만, 아래 Var는 위 Var를 참조할 수 없다(순환 참조 금지).

### 4.3 Var ID 도입 이유

- 기존: Var는 `vars[0]`, `vars[1]` 처럼 index 기반으로만 식별.
- 문제:
  - UI에서 Var 순서를 바꾸면 index가 바뀌어 diff 추적이 어렵다.
  - 나중에 AST/툴링을 도입했을 때, “어떤 Var가 어느 Expression을 참조했는지” 추적하기 힘들다.
- 해결:
  - 모든 Var에 `id`를 부여하고, 엔진/검증/툴링은 가능하면 `id`를 기준으로 Var를 추적한다.
  - `name`은 사용자가 수정할 수 있는 label에 가깝게 보고, 내부적으로는 `id`를 더 신뢰한다.

> 에이전트는 Var 관련 JSON을 생성/수정할 때 항상 `id` 필드를 포함해야 한다.

---

## 5. 엔진 레벨 처리 (Pushdown / FAP)

### 5.1 Pushdown 경로 (SqlPushdownCompiler)

개념:

- Var는 SQL CTE/SELECT 레벨의 **중간 컬럼**으로 대응한다.
- 최종 Output Expression에서 `var.xxx`를 쓰면, 컴파일러가 이미 만들어 둔 중간 컬럼을 사용한다.

개략적인 SQL 예시:

```sql
WITH cte_input AS (
  SELECT order_id, order_date, first_name, last_name
  FROM src.orders
),
cte_tmap AS (
  SELECT
    order_id,
    order_date,
    TRIM(first_name) || ' ' || TRIM(last_name)      AS full_name,         -- var.full_name
    CAST(order_date AS INTEGER)                     AS order_date_key     -- var.order_date_key
  FROM cte_input
)
INSERT INTO ods.orders_ods (order_id, full_name, order_date_key)
SELECT
  col.order_id,          -- col. 접두사는 컴파일 시 내부 처리로 대응
  var.full_name,
  var.order_date_key
FROM cte_tmap;
```

에이전트 구현 시:

- tMap 노드의 `vars[]`를 먼저 순서대로 평가하여 **SELECT 리스트에 추가**한다.
- Output 매핑에서 `expression`이 `var.xxx` 인 경우:
  - 별도의 함수 해석 없이, SELECT에서 `xxx` 컬럼을 사용하는 방식으로 컴파일한다.

### 5.2 FAP 경로 (FetchAndProcessExecutor)

개념:

- FAP는 소스 DB에서 Row를 fetch한 뒤 인메모리에서 tMap/Filter/Join 등을 적용한다.
- Var는 이 인메모리 처리의 **중간 값 저장소**가 된다.

흐름:

1. `srcMap = { colName -> 값 }` 생성 (`col.` prefix 제거 or 매핑)
2. `varMap = mutableMapOf<String, Any?>()`
3. `vars` 배열 순서대로:
   - `evaluateExpression(var.expression, srcMap + varMap)` 를 호출해 값을 구한다.
   - `varMap[var.name] = 값`
4. Output Expression 평가 시:
   - `evaluateExpression(expr, srcMap + varMap + ctxMap)` 형태로 호출.

제약:

- FAP의 `evaluateExpression`가 지원하는 패턴을 벗어나지 않도록 DSL/스니펫을 관리한다.
- Var 평가 순서를 반드시 지켜야 한다 (순환/역참조 금지).

---

## 6. UI/UX 레벨 (MappingEditor + Expression Builder)

### 6.1 MappingEditorModal 안 Var 섹션

권장 구조:

- 좌측: 기존 Input 컬럼 패널 그대로 유지.
- 우측/상단: 탭 또는 블록 형태로:
  - `Variables` 섹션
  - `Mappings` 섹션

Variables 섹션 테이블 컬럼:

- 순서(드래그 핸들) – 위/아래로 순서 변경
- 이름(Name) – `name` 필드, prefix 없이 순수 이름만, `var.`는 Expression 쪽에서 붙임
- 타입(Type) – 기존 타입 리스트 사용
- Expression – 짧은 input + `...` 버튼 (ExpressionBuilderPopup 호출)
- 삭제 – X 아이콘

검증:

- 이름 규칙 위반, 중복 이름, 예약어 사용 시 인라인 에러 표시.
- 순환 참조, 미존재 `col./var./ctx.` 참조는 validate() 단계에서 잡되, 가능하면 UI에서도 경고 아이콘으로 보여줌.

### 6.2 ExpressionBuilderPopup에서 Var 지원

좌측 리소스 패널 구성을 다음처럼 확장:

- Source Columns
- Variables
- Context

동작:

- Variables 블록에 Var 리스트 표시 → 클릭 시 `var.name` 삽입.
- Source Columns는 `col.colName` 삽입.
- Context는 `${VAR}` 패턴 대신 `ctx.VAR` 패턴에 맞춰 가이드(호환성 고려).

플레이스홀더 예:

- Var Expression 편집:
  - `예: TRIM(col.first_name) || ' ' || TRIM(col.last_name)`
- Output Expression 편집:
  - `예: COALESCE(var.full_name, 'UNKNOWN')`

---

## 7. Expression AST 로드맵 (중장기)

현재 Expression은 문자열이며, 정규식/간단 파싱 위주로 처리하고 있다.  
장기적으로는 Expression을 **AST(Abstract Syntax Tree)** 로 전환하는 것이 목표다.

예시 AST:

```json
{
  "type": "function",
  "name": "TRIM",
  "args": [
    {
      "type": "column",
      "name": "first_name"
    }
  ]
}
```

또는:

```json
{
  "type": "binary_op",
  "op": "||",
  "left": {
    "type": "function",
    "name": "TRIM",
    "args": [{ "type": "column", "name": "first_name" }]
  },
  "right": {
    "type": "literal",
    "value": " "
  }
}
```

장점:

- Validation:
  - 사용된 컬럼/Var/Context를 구조적으로 추출 가능,
  - 순환 참조/미존재 참조 검사가 쉬워진다.
- SQL Compiler/FAP:
  - 문자열 파싱 대신 AST → SQL/인메모리 평가기로 구현 가능.
- UX:
  - Builder에서 함수/피연산자를 블록 단위로 편집, 자동 포맷/힌트 제공 등이 쉬워진다.

가이드:

- **단기/MVP**: 문자열 Expression + prefix 규칙 + 간단 검증으로 유지.
- **중장기**: 별도 파서/AST 도입 후, 내부 표현만 AST로 전환하고 JSON 포맷은 호환 계층을 둔다.

---

## 8. Agent 체크리스트 (tMap/Var/Expression 작업 시)

1. **Expression 작성 시 prefix 규칙 준수**
   - 컬럼: `col.`, Var: `var.`, Context: `ctx.`.
2. **Var 정의 시**
   - `id`, `name`, `type`, `expression` 네 필드를 모두 사용.
   - `vars` 배열 순서를 의식해서 의존 관계를 위→아래 방향으로만 구성.
3. **DSL 범위 벗어나는 새로운 함수/패턴은 임의로 추가하지 말 것**
   - 필요시 `tMap고도화.md`/`빌더.md`/`검증기능.md`를 먼저 업데이트하고, FAP/Pushdown/Builder 세 군데를 동시에 고려.
4. **검증/Validate 레이어를 적극 활용**
   - 새 Expression/Var 기능을 추가할 때는:
     - 정적 validate(순환 참조, 미존재 식별자, prefix 누락 등)도 함께 설계.
5. **UI/UX 변경 시**
   - `MappingEditorModal`, `ExpressionBuilderPopup`, `PropertiesPanel` 세 파일의 역할 분리를 유지:
     - MappingEditor = 전체 매핑/Var/타입/연결 관리
     - ExpressionBuilder = 단일 Expression 집중 편집
     - PropertiesPanel = Node 레벨 기본 설정/예제 JSON/Loop/Validate 등

tMap 기능 추가 작업

## Var(중간변수)

-----------------------------------
1. Var(중간변수)가 하는 역할
Talend tMap 기준으로 보면 Var는 단순 “편의 기능”이 아니라, 변환 로직을 계층화하는 핵심 레이어다.

중간 계산 결과 캐시
복잡한 식을 Output 컬럼마다 반복해서 쓰지 않고, Var에 한 번 정의해서 여러 Output에서 재사용.
예:
var_fullName = row1.first_name + " " + row1.last_name
Output A, B, C에서 모두 var_fullName 사용.
조건/분기 로직 캡슐화
“고객 등급 → 할인율 → 최종 금액”처럼 여러 단계 로직을 Var들로 나누어 표현.
예:
var_discountRate = row2.tier == "GOLD" ? 0.2 : 0.1
var_discountAmount = row1.amount * var_discountRate
복잡한 표현식 분리(가독성/유지보수)
한 줄에 긴 표현식을 쓰는 대신, Var 여러 개로 나눠 “중간 스텝”을 눈에 보이게 한다.
여러 Output에서 공통 사용
Talend tMap은 Output이 여러 개일 수 있는데, Var는 Output들에 공통으로 적용되는 계산 레이어 역할을 한다.
요약하면:

Input → Var → Output
Output Expression이 “최종 표현식”이라면, Var는 그 이전 단계의 “중간 노드들”이라고 보면 된다.

2. 완전한 Var 기능이 제공해야 할 것들
Talend 기준 + 현재 ETL Platform 구조를 합쳐 보면, “완전한” Var 레이어를 구현하려면 최소 다음을 만족해야 한다.

2.1 데이터 모델 관점(IR)
Var 정의 목록이 IR(JobIR)에 포함
각 tMap 노드에 대해:
vars: [{ name, type, expression }, ...]
순서가 중요 (위 Var가 아래 Var에서 참조될 수 있으므로 위에서 아래로 평가)
Expression DSL 호환
Var Expression도 현재 MappingEditor에서 사용하는 Expression과 같은 DSL을 사용:
컬럼 참조, TRIM/UPPER/COALESCE/CAST 등
Var들끼리 참조 가능:
var2 = var1 + 100

2.2 실행 엔진 관점
Pushdown 경로
Var는 SQL CTE/SELECT 레벨의 중간 컬럼으로 대응:
예:
var_discountRate → CASE WHEN tier='GOLD' THEN 0.2 ELSE 0.1 END AS var_discountRate
var_discountAmount → amount * var_discountRate AS var_discountAmount
최종 Output Expression에서 Var를 쓰면, 컴파일러가 Var들을 순서대로 펼쳐서 SQL에 녹여야 함.
FAP 경로(인메모리)
Var는 Row 변환 파이프라인의 중간 Map에 들어가는 키:
Input Row → (Var1 계산 후 map에 추가) → (Var2 계산) → Output 매핑
FAP의 evaluateExpression에서:
컬럼 Map + Var Map을 함께 보면서 Expression을 평가할 수 있어야 함.
즉, colMap을 (컬럼 + vars) 합친 map으로 확장.

2.3 UI/UX 관점 (tMap/Builder 쪽)
Var 전용 영역(Variables 탭/섹션)
MappingEditorModal 안에 Input/Output 사이에 Variables 섹션 하나 추가:
각 행: { name, type, expression }
순서 드래그(위/아래) 가능 → 평가 순서 결정
Expression Builder와 연동
Var Expression도 ExpressionBuilderPopup으로 편집:
좌측에는 Input 컬럼/Context/기존 Var들 표시
우측에는 스니펫/함수 팔레트
Output Expression에서는 var.name을 쉽게 선택/삽입할 수 있게 Autocomplete/리스트 제공.
의존성/에러 표시
Var 간 순환 참조(VarA → VarB → VarA) 검출
존재하지 않는 컬럼/Var 참조 시 빌더/validate 단계에서 경고

3. 현재 ETL Platform과의 접점(무엇을 고려해야 하는지)
지금 프로젝트의 특징을 고려하면, Var 구현 전에 아래 포인트들을 명확히 해두는 게 중요하다.

3.1 Expression DSL 범위
이미 FAP에서 지원하는 표현식이 제한적(evaluateExpression 참고):
단순 컬럼명, table.col, UPPER, TRIM, COALESCE, CAST, 리터럴 숫자/문자열, 대소문자 무관 컬럼 조회 등.
Pushdown 쪽은 SQL로 컴파일될 때 DB 방언을 고려해야 한다.
따라서:
Var Expression도 이 DSL 안에서만 사용 가능하게 설계하는 게 안전하다.
나중에 DSL 확장 시 Var/Output이 같이 확장되는 형태.

3.2 성능/컴파일 복잡도
Var가 많아질수록:
Pushdown SQL: SELECT 리스트가 길어지고, nested 표현식이 복잡해짐.
FAP: 각 Row마다 Var들을 순차 평가하므로 CPU 소모 증가.
완성도를 위해서는:
Var 수의 현실적 상한(예: 수십 개 수준)과,
단순 계산/문자열 처리 중심으로 제한하는 것이 좋다.

3.3 Debuggability
Var가 많으면 디버깅이 어려워질 수 있다.

필요 기능:
Preview/Log에서 Var의 중간값을 어느 정도 볼 수 있게(예: tLogRow 확장시 Var 값도 함께 노출)
혹은 Builder에서 “이 Var가 어떤 Output에 사용되는지” 하이라이트/툴팁 제공.
4. 구현 시 필요한 구체 기능 리스트 (요약)
중간변수(Var) 기능을 “완전하게” 구현하려면 최소 다음 기능이 있어야 한다:

IR 레벨

NodeIR의 config 또는 독립 필드에 vars: [{ name, type, expression }]를 정의.
평가 순서가 보장되는 리스트 구조.
엔진 레벨

Pushdown:
컴파일러에서 Var를 중간 컬럼으로 확장(SELECT/CTE에 반영).
Output Expression에서 Var 이름을 실제 SQL 표현식으로 치환.
FAP:
Row 처리 시 Var를 순서대로 계산하고, colMap과 합쳐서 Output Expression 평가.
Validate 레벨

Var 이름 중복/예약어 사용 방지.
존재하지 않는 컬럼/Var 참조 검출.
순환 참조(Var1 → Var2 → Var1) 검출.
UI/UX 레벨

MappingEditorModal에 Variables 섹션 추가:
이름/타입/Expression 편집
순서 변경
ExpressionBuilderPopup에서:
Var 목록 표시 및 삽입
Input/Var/Context를 모두 참조할 수 있도록 좌측 트리 구성.
Output Expression 인풋에서 Var를 쉽게 선택/삽입할 수 있는 UX(간단한 팝오버/Autocomplete 등).
문서/가이드

빌더.md / tMap고도화.md 에:
“Var로 어떤 패턴을 해결하는지” 예시(이름 합치기, 코드→라벨, 조건부 값 등).
지원 Expression DSL 명세.

5. 한 줄 정리
Var는 “Input → Var → Output” 중간 레이어에서, 복잡한 변환을 잘게 쪼개고 재사용하는 역할이다.
완전한 구현을 위해서는 IR/엔진/UI 세 군데에서:
Var 정의/평가 순서,
Expression DSL 호환성,
디버그/검증 기능 까지 함께 설계해야 한다.
원하면 다음 단계로, “이 프로젝트에 맞는 Var 섹션의 정확한 JSON 스키마”나, “MappingEditorModal UI 와이어프레임(필드/버튼 수준)”까지 구체적으로 설계해서 적어줄 수 있다.


-----------------------------------
1. 개요 (구성)

tMap의 **중간변수(Var)**는 입력 데이터(Input)와 출력 데이터(Output) 사이에서 데이터 변환 로직을 처리하기 위한 임시 변수 영역이다.

# 구조
Input Row
   ↓
Var (중간 계산 / 변환)
   ↓
Output Row

# 특징
row 단위로 계산
tMap 내부에서만 사용
Output 컬럼에서 재사용 가능

예.)
Var.total_salary = row.salary + row.bonus


2. 필요성
중간변수는 필수 기능은 아니지만, 다음 이유로 실무 ETL 설계에서 적극적으로 활용된다.

  1) 가독성 향상
  복잡한 계산 로직을 분리하여 Mapping 구조를 명확하게 유지

    예.)
    Var.total_salary = row.salary + row.bonus
    Var.grade = Var.total_salary > 7000 ? "A" : "B"

  2) 계산 재사용
  동일한 계산을 여러 컬럼에서 사용할 경우 중복 계산 방지

    예.)
    Var.total_salary = row.salary + row.bonus

    Output

    total_salary = Var.total_salary
    vip_flag = Var.total_salary > 7000

  3) 유지보수 용이
  비즈니스 로직 변경 시 한 곳만 수정

    예.)
    Var.vip_condition = Var.total_salary > 8000

  4) 성능 개선
  복잡한 계산을 한 번만 수행


3. 사용 방법
Step 1. Var 영역에 변수 정의

  tMap → 중간영역 → Var Table에 변수 추가

  예.)
  Var.total_salary
  Var.salary_grade
  Var.dept_name

Step 2. 계산 로직 작성

  예.)
  Var.total_salary = row.salary + row.bonus
  Var.salary_grade =
  Var.total_salary > 7000 ? "A"
  : Var.total_salary > 5000 ? "B"
  : "C"

Step 3. Output에서 변수 사용

  Output Mapping

  total_salary = Var.total_salary
  salary_grade = Var.salary_grade

  4. 사용 예시 (회사 테이블)

  입력 테이블
    EMPLOYEE
    emp_id	dept_code	salary	bonus
    100	D01	4000	500
    101	D02	6000	1000

  tMap 중간변수 정의
    Var.total_salary = row.salary + row.bonus
    Var.dept_name =
    row.dept_code.equals("D01") ? "HR"
    : row.dept_code.equals("D02") ? "IT"
    : "ETC"

  Output 매핑
    EMPLOYEE_DW
    column	mapping
    emp_id	row.emp_id
    dept_name	Var.dept_name
    total_salary	Var.total_salary


5. 권장 사용 패턴
실무에서는 다음 순서로 Var 영역을 구성하는 것이 일반적이다.

  1. 데이터 정제
  2. 계산 로직
  3. 비즈니스 조건
  4. 코드 변환
    예.)
      Var.clean_name
      Var.total_salary
      Var.vip_flag
      Var.dept_name


6. 사용 시 주의사항
  1) tMap 내부에서만 사용 가능
    -> Var 변수는 다른 컴포넌트에서 접근 불가
  2) Row 단위 변수
  각 Row마다 값이 새롭게 계산됨
  3) 과도한 중첩 로직 지양
    -> 복잡한 조건은 여러 Var로 분리
        예.)
          좋은 예
            Var.total_salary
            Var.grade
            Var.vip_flag

          나쁜 예
            (row.salary + row.bonus > 7000 ? ...)


7. 요약
  목적 : 데이터 변환 로직 처리
  위치 : tMap Var 영역
  스코프 : Row 단위
  주요 장점 : 가독성 / 재사용 / 성능


✔ 핵심 정리
Var = tMap 내부에서 사용하는 Row 단위 중간 계산 변수