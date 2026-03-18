Grok AI 내용


# SCHEMA_DOC3.md

# 📘 Data Warehouse & Star Schema 설계 표준 가이드 (실무용)

---

# 1. Dimensional Modeling 철학 (Kimball)

Dimensional Modeling의 핵심 목적은 단순 데이터 저장이 아니라,
비즈니스 사용자가 쉽게 이해하고 빠르게 분석할 수 있는 구조를 만드는 것이다.

## 특징
- 분석 최적화 구조
- 사용자 친화적
- JOIN 최소화
- BI 도구 친화적 (Power BI, Tableau 등)

---

# 2. Star Schema 구조

## 구성
- Fact Table (사실 테이블)
- Dimension Table (차원 테이블)

## 특징
- 중앙 Fact + 주변 Dimension
- 단순 구조
- 높은 성능

---

# 3. Kimball 4-Step 설계 방법론

## Step 1: Business Process 정의
분석 대상 이벤트 정의 (주문, 결제 등)

## Step 2: Grain 정의 (가장 중요)
Fact Table 한 행의 의미 정의

## Step 3: Dimension 정의
분석 기준 정의 (고객, 날짜 등)

## Step 4: Fact 정의
측정값 정의 (금액, 수량 등)

---

# 4. Grain 설계 규칙

## 중요성
Grain은 절대 변경하면 안 되는 설계 기준이다.

## 예시
- 주문 1건
- 주문 상품 1개

---

# 5. Fact Table 설계

## 종류
1. Transaction Fact
2. Periodic Snapshot
3. Accumulating Snapshot

## Measure 유형
- Additive
- Semi-additive
- Non-additive

---

# 6. Dimension 설계

## 특징
- Wide Table
- Denormalized
- 사람이 이해 가능

## SCD 유형
- Type 1: 덮어쓰기
- Type 2: 이력 관리
- Type 3: 일부 이력

---

# 7. ODS → DW → DM 구조

## ODS
- 원천 데이터 저장
- 정규화 유지

## DW
- 통합/정제
- Key 생성
- SCD 적용

## DM
- Star Schema
- BI 최적화

---

# 8. 설계 예시

## Fact Table
FACT_SALES
- date_key
- customer_key
- product_key
- sales_amount
- quantity

## Dimension Table
DIM_CUSTOMER
- customer_key
- name
- region

---

# 9. Power BI 설계 규칙

- Star Schema 유지
- 1:N 관계
- Measure는 DAX

---

# 10. 성능 최적화

- Partitioning
- Indexing
- Join 최소화

---

# 11. 금지사항

- Fact에 문자열 저장
- Grain 혼합
- Snowflake 구조 사용

---

# 12. AGENT 설계 RULE

1. Grain 먼저 정의
2. Fact는 이벤트 중심
3. Dimension은 설명 데이터
4. Surrogate Key 사용
5. SCD Type2 기본 적용
6. Star Schema 유지
7. 계층 구조 유지 (ODS → DW → DM)
8. 성능 최우선

---

# 13. 실무 판단 기준

## 컬럼 위치 판단
- 숫자 → Fact
- 설명 → Dimension

## 테이블 생성 기준
- 분석 기준 → Dimension
- 이벤트 → Fact

---

# 결론

이 문서는 DW/DM 설계를 위한 실무 표준 가이드이며,
데이터 모델링 자동화 및 BI 최적화를 위한 기준으로 사용된다.
