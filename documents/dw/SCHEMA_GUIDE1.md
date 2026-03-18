Chat GPT 내용

# SCHEMA_DOC1.md
**파일명:** SCHEMA_DOC3.md  
**생성일:** 2026년 3월 18일  
**목적:** BI 툴(Power BI 등)용 DW/DM 설계 전용 AGENT 교육 가이드  
**기반 자료:**  
1. Kimball Group — Dimensional Modeling Techniques (전체 공식 기법)  
2. Wikipedia — Star Schema  
3. Microsoft Power BI — Star Schema 실전 가이드 (ko-kr)  
4. statkclee.github.io — Dimensional Modeling 기본 개념 (한글)  

---

## AGENT 교육 가이드: Star Schema 설계 완전 상세 규칙 및 방법론

이 문서는 AGENT가 **실제 ODS 원본 데이터**가 주어졌을 때, **ODS → DW → DM**까지 **실무 수준**으로 Star Schema를 설계할 수 있도록 **요약 없이 상세히** 정리한 최종 가이드입니다.  
AGENT는 이 문서에 나오는 **모든 규칙, 4-step 프로세스, SCD 유형, conformed dimension, grain 선언 순서, Power BI 적용 팁**을 100% 준수해야 합니다.

### 1. Kimball Group — Dimensional Modeling Techniques (사실상 산업 표준)

#### Fundamental Concepts
- **Gather business requirements and data realities**: 비즈니스 담당자와 KPI, 핵심 이슈, 의사결정 프로세스 수집 + 소스 시스템 전문가와 미팅 + 고수준 data profiling.
- **Collaborative dimensional modeling workshops**: 비즈니스 SME와 함께 interactive workshop 진행. 모델러가 주도하되 절대 혼자 설계 금지.
- **Four-step dimensional design process** (반드시 이 순서 준수):
  1. Select the business process (단일 프로세스 선택 → enterprise bus matrix 한 행)
  2. Declare the grain (fact table 한 행이 정확히 무엇을 나타내는지 선언 → atomic grain부터)
  3. Identify the dimensions
  4. Identify the facts
- **Grain**: fact table 한 행의 정확한 의미. atomic grain 강력 권장.
- **Dimensions**: who/what/when/where/why/how 컨텍스트 제공 (descriptive attributes).
- **Facts**: 숫자 측정값 (additive/semi-additive/non-additive 구분 필수).

#### Basic Fact Table Techniques
- 구조: surrogate key (선택), dimension foreign keys, facts.
- Fact 유형:
  - Transaction fact tables
  - Periodic snapshot fact tables
  - Accumulating snapshot fact tables
  - Factless fact tables
  - Aggregated fact tables
  - Consolidated fact tables
- Additive / Semi-additive / Non-additive facts 구분 필수.
- Conformed facts 사용.

#### Basic Dimension Table Techniques
- 구조: surrogate key (필수), natural key, descriptive attributes (denormalized flattened).
- Calendar date dimension (가장 중요).
- Role-playing dimensions
- Junk dimensions
- Degenerate dimensions
- **Snowflaked dimensions**: 권장하지 않음 (복잡도 ↑, 성능 ↓).
- Outrigger dimensions (필요 시에만).

#### Slowly Changing Dimension (SCD) Techniques
- Type 0: Retain original
- Type 1: Overwrite
- Type 2: Add new row (가장 일반적, surrogate key + effective date + current flag)
- Type 3: Add new attribute
- Type 4: Add mini-dimension
- Type 5: Mini-dimension + Type 1 outrigger
- Type 6: Hybrid (Type 1 + Type 2)
- Type 7: Dual Type 1 and Type 2

#### Integration via Conformed Dimensions (Enterprise DW 핵심)
- Conformed dimensions: 모든 fact table에서 동일하게 공유 (가장 중요!).
- Enterprise data warehouse bus matrix (행=비즈니스 프로세스, 열=conformed dimension).
- Drilling across 가능.

---

### 2. Wikipedia — Star Schema 기본 정의

- **Fact tables**: 측정값 저장, grain (transaction / periodic snapshot / accumulating snapshot), surrogate key, 대량 행.
- **Dimension tables**: descriptive attributes, surrogate PK, denormalized.
- **장점**: 단순 쿼리, 우수한 query performance, OLAP 최적.
- **Snowflake schema 비교**: 정규화 → 복잡도 ↑, 성능 ↓ → **피할 것**.

**예시 쿼리 구조**:
```sql
SELECT P.Brand, S.Country, SUM(F.Units_Sold)
FROM Fact_Sales F
JOIN Dim_Date D ON F.Date_Id = D.Date_Id
JOIN Dim_Store S ON F.Store_Id = S.Store_Id
JOIN Dim_Product P ON F.Product_Id = P.Product_Id
GROUP BY ...

---

### 3. Microsoft Power BI — Star Schema 실전 가이드 (ko-kr)

**Power BI 핵심 원칙**:

- Star schema = Power BI 성능/유용성의 핵심.
- Dimension table: “one” side
- Fact table: “many” side (1:N 관계)
- 정규화된 ODS → 비정규화(denormalized) Star Schema로 변환 필수.
- Snowflake dimension: 단일 테이블로 flatten 권장 (스토리지 절감, 필터 전파 빠름).
- Explicit measure 우선 사용 (DAX로 작성).
- Unit Price 등 특정 집계만 허용 시 열 숨기고 explicit measure만 노출.
- SCD Type 1/2 중심 적용.
- Factless fact table, Junk dimension, Role-playing dimension, Degenerate dimension 모두 지원.
- 대용량 데이터는 별도 DW 구축 후 연결 권장.


### 4. Dimensional Modeling 기본 개념 (statkclee.github.io)

- Star schema = 관계형 DB로 다차원 분석 구현하는 가장 단순한 스키마.
- Fact 중심 + 주변 Dimension = 별(star) 모양.
- Surrogate key로 연결.
- 샘플 데이터: CodeProject, GitHub mara 등 참고.

---

###(**중요) ODS → DW → DM 실제 설계 프로세스 (AGENT 실무 적용 순서)

1. ODS 분석
- 원본 테이블 프로파일링 (컬럼 분포, null 비율, cardinality).
- Business process 식별.

2. Kimball 4-step 적용
- Business process 선택
- Grain 선언 (atomic grain 필수)
- Dimensions 식별
- Facts 식별

3. Conformed Dimension 구축
- Enterprise bus matrix 작성
- 모든 fact table이 공유할 dimension 먼저 설계

4. SCD 적용
- 기본: Type 2
- 필요 시 Type 1/3/4/6/7 조합

5. DW 테이블 생성
- Fact table: grain 일관성 유지
- Dimension table: flattened denormalized
- Surrogate key 필수

6. DM (Data Mart) 생성
- 특정 부서용 subset star schema (conformed dimension 재사용)

7. Power BI 모델링
- DW 연결
- 1:N 관계 설정
- Explicit DAX measure 생성
- Snowflake 피함
- Role-playing, Junk, Degenerate 모두 적용

8. 확장성 고려
- Graceful extension
- Late arriving facts/dimensions 처리

---

### AGENT 필수 준수 규칙 (위반 시 설계 무효)

- Grain 선언 전에 dimension/fact 절대 선택 금지
- Dimension은 무조건 flattened denormalized
- Conformed dimension 필수 (drilling across 가능하게)
- Fact는 additive 구분 + 동일 grain 유지
- Snowflake schema 최소화
- Power BI에서는 explicit measure 우선 + DW 선 구축 권장
- 모든 설계는 collaborative + business buy-in 기반