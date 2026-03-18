* AI Agent 요약 내용 Claude 통합 문서

---

### DW 설계 시, AGENT(LLM)이 따라야할 Star Schema 구성에 대한 필수 지침서입니다.

# SCHEMA_GUIDE_DOC.md

**목적:** BI 툴(Power BI 등)용 DW/DM 설계 전용 AGENT 교육 가이드
**통합 출처:** SCHEMA_GUIDE.md · SCHEMA_GUIDE2.md · SCHEMA_GUIDE3.md
**최종 정리일:** 2026년 3월 18일
**기반 방법론:** Kimball Group — Dimensional Modeling Techniques (산업 표준)

---

## 개요: Dimensional Modeling 철학

Dimensional Modeling의 핵심 목적은 단순 데이터 저장이 아니라,
비즈니스 사용자가 쉽게 이해하고 빠르게 분석할 수 있는 구조를 만드는 것이다.

- 분석 최적화 구조 (OLAP 최적)
- 사용자 친화적 (SQL 없이도 속성명으로 분석 가능)
- JOIN 최소화
- BI 도구 친화적 (Power BI, Tableau 등)
- 모든 설계는 비즈니스 담당자와의 collaborative workshop 기반 — 모델러 단독 설계 금지

---

## 1. Kimball 4-Step 설계 프로세스 (AGENT 필수 준수 — 순서 변경 불가)

AGENT는 모든 모델링 작업 시 아래 4단계를 **반드시 이 순서대로** 수행하며 각 단계의 의사결정 근거를 기록해야 한다.

### Step 1: 비즈니스 프로세스 선택 (Select the Business Process)

- **정의:** 분석 대상이 되는 비즈니스 활동(이벤트)을 식별한다.
- **AGENT 수칙:** "무엇을 보고 싶은가?"가 아닌 **"어떤 시스템 이벤트가 데이터를 생성하는가?"** 를 기준으로 정의한다.
  (예: 판매, 재고 이동, 웹 로그 클릭, 주문, 결제)
- 단일 프로세스 선택 → Enterprise Bus Matrix 한 행에 해당

### Step 2: 그레인(Grain) 선언

- **정의:** 사실 테이블의 행(Row) 하나가 물리적으로 무엇을 의미하는지 정의한다.
- **AGENT 수칙:**
  - 가능한 한 가장 상세한 수준(**Atomic Grain**)을 선택한다.
  - "일자별-상점별-상품별 판매 내역" 처럼 구체적으로 명시한다.
  - 그레인이 혼재된 사실 테이블을 설계해서는 **절대 안 된다**.
  - **Grain은 한 번 선언하면 변경하지 않는다.**
- **예시:** "주문 1건", "주문 상품 1개"

### Step 3: 차원 식별 (Identify the Dimensions)

- **정의:** 사실 테이블의 측정값에 컨텍스트(Context)를 제공하는 "누가/언제/어디서/무엇을"을 정의한다.
  (who / what / when / where / why / how)
- **AGENT 수칙:** 그레인이 결정되면 차원은 자연스럽게 도출되어야 한다.
  (예: 날짜, 상품, 매장, 고객, 프로모션 등)

### Step 4: 사실 식별 (Identify the Facts)

- **정의:** 비즈니스 프로세스에서 발생하는 수치적 측정값을 식별한다.
- **AGENT 수칙:**
  - 사실은 반드시 **수치 데이터(Numeric)** 여야 한다. Fact에 문자열 저장 금지.
  - 계산된 필드보다는 **원천 데이터를 우선 적재**한다.

---

## 2. 데이터 계층 구조 (ODS → DW → DM)

### 2.1 ODS (Operational Data Store)

- **목적:** 원천 시스템 데이터의 복제 및 통합 전초 기지
- **설계 규칙:**
  - **1:1 복제:** 원천 시스템의 테이블 구조와 컬럼명을 최대한 유지한다.
  - **메타데이터 추가:** `ETL_LOAD_DATE`, `SOURCE_SYSTEM_ID` 등 관리용 컬럼을 반드시 추가한다.
  - **비즈니스 로직 배제:** 데이터 변환을 최소화하고 정규화된(3NF) 상태를 유지할 수 있다.

### 2.2 DW (Data Warehouse) — Integration Layer

- **목적:** 여러 ODS의 데이터를 전사 관점에서 통합하고 정제
- **설계 규칙:**
  - **데이터 정제:** Null 값 처리, 데이터 형식 통일 (예: Y/N → 1/0)
  - **통합 차원 생성:** 여러 시스템에 흩어진 고객/상품 정보를 하나로 통합 (Conformed Dimension)
  - **이력 관리:** SCD(Slowly Changing Dimension) 로직을 적용하여 과거 데이터를 보존
  - **Surrogate Key 생성:** 운영 시스템 PK와 분리된 DW 전용 키 생성

### 2.3 DM (Data Mart) — Star Schema Layer

- **목적:** BI 툴에서 직접 참조하는 분석용 최적화 레이어 (특정 부서용 subset)
- **설계 규칙:**
  - **스타 스키마 구조:** 중앙의 Fact Table과 이를 둘러싼 Dimension Table로 구성
  - **비정규화(Denormalized):** 조인 횟수를 줄이기 위해 차원 테이블은 완전히 비정규화(Flat Table)
  - Conformed Dimension 재사용

---

## 3. Fact Table 설계 규칙

### 3.1 Fact Table 종류

| 유형 | 설명 |
|------|------|
| Transaction Fact | 트랜잭션 발생 시점의 이벤트 기록 |
| Periodic Snapshot | 일정 주기로 상태를 캡처 (예: 주간 재고) |
| Accumulating Snapshot | 수명주기 전체의 누적 상태 추적 |
| Factless Fact Table | 측정값 없이 이벤트 발생 여부만 기록 |
| Aggregated Fact Table | 집계된 요약 데이터 |
| Consolidated Fact Table | 여러 프로세스를 통합한 테이블 |

### 3.2 Measure (측정값) 유형 — 반드시 구분

| 유형 | 설명 | 예시 |
|------|------|------|
| **Additive (가산적)** | 모든 차원에서 합산 가능 | 매출액, 수량 |
| **Semi-additive (반가산적)** | 특정 차원(시간)에서는 합산 무의미 | 재고 잔액, 통장 잔고 |
| **Non-additive (비가산적)** | 합산 불가 → 평균·비율로 처리 | 단위 가격, 할인율 |

### 3.3 구조 규칙

- **PK:** 여러 차원의 Surrogate Key를 조합한 복합키 또는 별도 시퀀스 ID
- **FK:** 반드시 차원 테이블의 Surrogate Key를 참조
- **Null FK 처리:** FK 컬럼에 Null 허용 금지 → 데이터 없을 경우 차원 테이블의 "미지정(-1)" 항목 참조
- **Conformed Facts:** 여러 Fact Table에서 동일하게 정의된 측정값 사용

### 3.4 설계 예시

```sql
FACT_SALES (
  date_key        INT NOT NULL,   -- FK → DIM_DATE
  customer_key    INT NOT NULL,   -- FK → DIM_CUSTOMER
  product_key     INT NOT NULL,   -- FK → DIM_PRODUCT
  store_key       INT NOT NULL,   -- FK → DIM_STORE
  sales_amount    DECIMAL(18,2),  -- Additive
  quantity        INT,            -- Additive
  unit_price      DECIMAL(18,2)   -- Non-additive
)
```

---

## 4. Dimension Table 설계 규칙

### 4.1 기본 원칙

1. **Surrogate Key (대리키) 필수:** 운영 시스템 PK 대신 DW 전용 정수형(Int/BigInt) 키를 생성한다.
   → 시스템 변경 대비 및 성능 향상
2. **설명적 속성:** 코드(Code)보다는 이름(Name), 구분(Type), 그룹(Group) 등 텍스트 위주의 상세 정보 포함
   (예: `PROD_CD` 대신 `상품명`, `카테고리명`)
3. **완전 비정규화(Denormalized Flat Table):** Snowflake 구조 금지 → 단일 테이블로 flatten
4. **Wide Table:** 많은 descriptive attribute를 한 테이블에 포함

### 4.2 특수 차원 유형

| 유형 | 설명 |
|------|------|
| **Calendar Date Dimension** | 가장 중요. 시스템 날짜 함수 대신 별도 테이블 생성 (회계연도, 분기, 휴일 여부 등 관리) |
| **Role-playing Dimension** | 동일 차원을 다른 역할로 여러 번 사용 (예: 주문일자/배송일자 모두 DATE 차원 참조) |
| **Junk Dimension** | 다양한 플래그/코드 값들을 하나의 차원으로 묶음 |
| **Degenerate Dimension** | 별도 테이블 없이 Fact Table에 직접 저장 (예: 주문번호, 송장번호) |
| **Outrigger Dimension** | 다른 차원을 참조하는 차원 (필요 시에만 사용) |
| **Snowflaked Dimension** | **권장하지 않음** (복잡도↑, 성능↓) |

### 4.3 계층 구조(Hierarchy)

단일 테이블 내에 계층 컬럼을 나열한다.

```
날짜 차원: 연도 > 분기 > 월 > 일 (컬럼으로 나열)
상품 차원: 대분류 > 중분류 > 소분류 (컬럼으로 나열)
```

### 4.4 Conformed Dimensions (Enterprise DW 핵심)

- Conformed Dimension: **모든 Fact Table에서 동일하게 공유되는 차원**
- Enterprise Data Warehouse Bus Matrix 작성 (행=비즈니스 프로세스, 열=Conformed Dimension)
- Conformed Dimension이 있어야 여러 Fact Table 간 **Drilling Across** 가능

### 4.5 설계 예시

```sql
DIM_CUSTOMER (
  customer_key  INT PRIMARY KEY,   -- Surrogate Key
  customer_id   VARCHAR(20),       -- Natural Key (원천 시스템 ID)
  customer_name VARCHAR(100),
  region        VARCHAR(50),
  segment       VARCHAR(50),
  start_date    DATE,              -- SCD Type 2
  end_date      DATE,
  is_current    CHAR(1)
)
```

---

## 5. SCD (Slowly Changing Dimension) 이력 관리

| 유형 | 방법 | 사용 시점 |
|------|------|-----------|
| **Type 0** | Retain original — 원본 유지 | 변경 없는 속성 |
| **Type 1** | Overwrite — 덮어쓰기 | 과거 이력 불필요 |
| **Type 2** | Add new row — 새 행 추가 **(기본 권장)** | 이력 추적 필요 |
| **Type 3** | Add new column — 이전 값 별도 컬럼 저장 | 최근 2단계 이력만 필요 |
| **Type 4** | Mini-dimension 분리 | 자주 변경되는 속성 분리 |
| **Type 5** | Mini-dimension + Type 1 outrigger | Type 4 확장 |
| **Type 6** | Hybrid (Type 1 + Type 2) | 현재/과거 동시 분석 |
| **Type 7** | Dual Type 1 and Type 2 | 이중 뷰 제공 |

**Type 2 필수 컬럼:**

```sql
START_DATE    DATE,
END_DATE      DATE,
IS_CURRENT    CHAR(1)  -- 'Y'/'N' 또는 1/0
```

---

## 6. ODS → DW → DM 실제 설계 프로세스 (AGENT 실무 적용 순서)

1. **ODS 분석**
   - 원본 테이블 프로파일링 (컬럼 분포, null 비율, cardinality)
   - Business process 식별
   - 비즈니스 담당자, 소스 시스템 전문가와 미팅 + 고수준 data profiling

2. **Kimball 4-Step 적용** (위 1장 참조)
   - Business process 선택 → Grain 선언 → Dimensions 식별 → Facts 식별

3. **Conformed Dimension 구축**
   - Enterprise Bus Matrix 작성
   - 모든 Fact Table이 공유할 Dimension 먼저 설계

4. **SCD 적용**
   - 기본: Type 2
   - 필요 시 Type 1/3/4/6/7 조합

5. **DW 테이블 생성**
   - Fact Table: Grain 일관성 유지
   - Dimension Table: Flattened denormalized
   - Surrogate Key 필수

6. **DM (Data Mart) 생성**
   - 특정 부서용 subset Star Schema
   - Conformed Dimension 재사용

7. **Power BI 모델링**
   - DW 연결
   - 1:N 관계 설정 (차원→사실 단방향 필터)
   - Explicit DAX Measure 생성
   - Snowflake 회피
   - Role-playing, Junk, Degenerate 모두 적용

8. **확장성 고려**
   - Graceful extension (기존 Fact/Dimension에 컬럼 추가 가능하게)
   - Late arriving facts/dimensions 처리

---

## 7. Power BI 최적화 핵심 규칙

1. **Star Schema = Power BI 성능·유용성의 핵심.** 이 구조를 반드시 유지한다.
2. **관계 방향:** 차원(1) → 사실(N) 단방향 필터를 기본으로 한다.
3. **데이터 타입 최적화:** 문자열보다 숫자형(Integer) 선호. 금액은 고정 소수점(Decimal) 사용.
4. **Explicit Measure 우선:** DAX로 작성. Unit Price 등 특정 집계만 허용 시 열 숨기고 explicit measure만 노출.
5. **컬럼 가독성:** 비즈니스 사용자가 직관적으로 이해할 수 있는 한글 또는 영문 표준 명칭 사용.
   (예: `PROD_NM` → `상품명`)
6. **Snowflake 회피:** Snowflake dimension은 단일 테이블로 flatten (스토리지 절감 + 필터 전파 속도 향상).
7. **대용량 데이터:** 별도 DW 구축 후 연결 권장. BI 직접 접속 지양.

**예시 쿼리 구조:**

```sql
SELECT P.Brand, S.Country, SUM(F.Units_Sold)
FROM   Fact_Sales F
JOIN   Dim_Date    D ON F.Date_Id    = D.Date_Id
JOIN   Dim_Store   S ON F.Store_Id   = S.Store_Id
JOIN   Dim_Product P ON F.Product_Id = P.Product_Id
GROUP BY P.Brand, S.Country
```

---

## 8. AGENT 필수 준수 규칙

> 아래 규칙을 위반하면 설계가 무효다. 모든 항목을 100% 준수한다.

1. **Grain 먼저 선언** — Grain 선언 전에 Dimension/Fact 절대 선택 금지
2. **Dimension은 무조건 Flattened Denormalized** — Snowflake 구조 최소화
3. **Conformed Dimension 필수** — Drilling Across가 가능하도록 설계
4. **Fact는 Additive 구분 필수** — 동일 Grain 유지
5. **Surrogate Key 사용** — 모든 Dimension에 DW 전용 정수형 키 생성
6. **SCD Type 2 기본 적용** — 이력 관리가 필요한 Dimension
7. **Star Schema 구조 유지** — ODS → DW → DM 계층 구조 준수
8. **Fact에 문자열 저장 금지**
9. **Grain 혼합 금지** — 한 Fact Table에 다른 Grain의 행 혼재 불가
10. **모든 설계는 비즈니스 담당자와의 collaborative workshop 기반** — 혼자 설계 금지
11. **Power BI에서는 Explicit Measure 우선** + DW 선 구축 권장

---

## 9. 실무 판단 기준 (컬럼/테이블 위치 결정)

| 판단 기준 | 결과 |
|-----------|------|
| 숫자 측정값 | Fact |
| 설명·속성 데이터 | Dimension |
| 분석 기준 (필터, 그룹) | Dimension |
| 시스템 이벤트 발생 기록 | Fact |

---

## 10. AGENT 자가 진단 체크리스트

> 설계 완료 후 아래 항목을 모두 확인한다.

- [ ] 사실 테이블의 그레인이 문서에 명확히 정의되었는가?
- [ ] 모든 차원 테이블에 Surrogate Key가 정의되었는가?
- [ ] 사실 테이블에 Null인 FK가 존재하는가? (있다면 "미지정(-1)" 처리 확인)
- [ ] Snowflake 형태를 피하고 Star Schema로 설계했는가?
- [ ] 비즈니스 사용자가 SQL 없이도 속성명만으로 분석할 수 있는가?
- [ ] Measure 유형(Additive/Semi-additive/Non-additive)이 구분되어 있는가?
- [ ] Conformed Dimension이 Enterprise Bus Matrix에 정의되었는가?
- [ ] SCD 유형이 각 Dimension 속성별로 결정되었는가?
- [ ] Power BI용 Explicit DAX Measure가 작성되었는가?
- [ ] 단방향 관계(차원 → 사실)가 설정되었는가?
