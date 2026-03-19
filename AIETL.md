아래에 전체 마이그레이션 계획 내용을 정리합니다. 복사해서 사용하세요.

---

# ETL Platform 기능 이관 설계/기획 문서

## 1. 개요 및 배경

**목적**: AETL_program_dev(Python/Streamlit)의 3개 핵심 기능을 etl-dev-project(Spring Boot + React)로 이관·재구현

**대상 기능**:
1. 자동 매핑 문서 생성 (Auto Mapping Document Generation)
2. DW 설계 (Data Warehouse Design)
3. 쿼리 검증 (Query Validation)

---

## 2. 기능별 분석 및 아키텍처 결정

### 2.1 자동 매핑 문서 생성 — 완전 Kotlin/TypeScript 재구현

**AS-IS (AETL)**
- `etl_metadata_parser.py`: Excel/CSV 파싱, 50+ 컬럼 alias 매핑 (`_COL_ALIASES`)
- `aetl_export.py`: openpyxl로 6시트 Excel 생성 (Overview, Source Table, Target Table, Column Mapping, Load SQL, Validation SQL)
- DDL 생성, MERGE SQL 생성, Validation Report Excel 출력
- pandas 기반 파일 파싱

**TO-BE (etl-dev-project)**
- Python 특화 라이브러리 의존성 없음 → JVM 동등 라이브러리 대체 가능
- `etl_metadata_parser.py` `_COL_ALIASES` → Kotlin `ColumnAliasResolver` (상수 Map)
- `aetl_export.py` `generate_mapping_excel()` → Apache POI 기반 `MappingDocumentService`
- `generate_ddl()` / `generate_merge_sql()` → 기존 `DbType` enum 재활용한 `DdlGenerator`
- `pandas` → Apache POI + OpenCSV

**신규 파일**:
- `backend/.../document/MetadataParserService.kt`
- `backend/.../document/MappingDocumentService.kt`
- `backend/.../document/DocumentController.kt`
- `frontend/src/components/job/DocumentExportModal.tsx`

**API 엔드포인트**:
- `POST /api/documents/mapping-excel`
- `POST /api/documents/ddl`
- `POST /api/documents/merge-sql`
- `POST /api/documents/validation-report`
- `POST /api/documents/parse-metadata`

---

### 2.2 DW 설계 — 백엔드 API + LLM 오케스트레이션

**AS-IS (AETL)**
- `aetl_designer.py`: Swagger/OpenAPI JSON 파싱, 70+ 줄 Kimball 방법론 프롬프트
- `design_star_schema()`: LLM 호출 → Star Schema JSON 반환
- `generate_mermaid_erd()`: Mermaid ERD 다이어그램 생성
- `generate_mermaid_flow()`: 레이어 흐름도 생성
- `schema_doc.md`: 154줄 Kimball 참조 컨텍스트 주입

**왜 백엔드 API인가**:
- 프롬프트 기밀성 (브라우저 네트워크 탭 노출 방지)
- Structured Output 활용 가능 (OpenAI `response_format`, Claude `tool_use`)
- Generate-Validate-Repair 루프 구현 용이
- 기존 파이프라인 AI Agent 시스템 프롬프트 오염 방지

**Python FastAPI 사이드카를 쓰지 않는 이유**: LLM 호출은 단순 HTTP 요청이며, Python 특화 라이브러리 의존성이 없음. Spring WebClient로 동일 API 호출 가능.

**TO-BE (etl-dev-project)**:
- `schema_doc.md` → `backend/src/main/resources/prompts/schema_doc.md` 리소스 파일화
- Mermaid.js 프론트엔드 렌더링
- LLM 응답: JSON Schema 기반 Structured Output (Kotlin data class 검증)
- 불안정한 regex JSON 추출 (`re.search(r"\{[\s\S]+\}", raw)`) → 구조화된 파싱으로 교체

**신규 파일**:
- `backend/.../dwdesign/DwDesignService.kt`
- `backend/.../dwdesign/DwDesignController.kt`
- `frontend/src/pages/DwDesignPage.tsx`
- `frontend/src/components/dwdesign/MermaidRenderer.tsx`
- `frontend/src/components/dwdesign/EntityEditor.tsx`

**API 엔드포인트**:
- `POST /api/dw-design/parse-input`
- `POST /api/dw-design/generate`
- `GET /api/dw-design/erd/{designId}`
- `POST /api/dw-design/ddl`

---

### 2.3 쿼리 검증 — 백엔드 API (Rule-Based Kotlin + LLM 강화)

**AS-IS (AETL)**
- `etl_sql_generator.py`: 6가지 검증 쿼리 자동 생성
  - `row_count`: 소스/타겟 행 수 비교
  - `pk_missing`: PK 누락 검증
  - `null_check`: NOT NULL 컬럼 NULL 검증
  - `duplicate_check`: 중복 키 검증
  - `checksum`: 집계 체크섬 비교
  - `full_diff`: 전체 데이터 차이 비교
- `_post_validate_sql()`: 방언별 SQL 후처리 (MINUS↔EXCEPT, LIMIT↔FETCH FIRST)
- `_GENERATION_PROMPT`: LLM 기반 고품질 SQL 생성 프롬프트 (68-130줄)
- `_DB_NOTES`: Oracle/MariaDB/PostgreSQL 방언별 주의사항

**기존 etl-dev-project 연계점**:
- `ComponentType.T_VALIDATE` 이미 enum에 존재 (`JobIR.kt`)
- `검증기능.md` 에 Phase A/B/C 로드맵 이미 정의
- `SchemaService.kt`에 JDBC 메타데이터 (`ColumnInfo`) 이미 구현

**TO-BE (etl-dev-project)**:
- `_generate_fallback_queries()` (190줄) → Kotlin `ValidationQueryService` (Rule-based, 확실한 fallback)
- LLM 강화: `_GENERATION_PROMPT` → `ValidationAiService` (Generate-Validate-Repair 루프)
- `_post_validate_sql()` → `postValidateSql()` 메서드 (방언 교정)
- T_VALIDATE 노드 실행 통합 → `SqlPushdownAdapter.kt` 수정

**신규 파일**:
- `backend/.../validation/ValidationQueryService.kt`
- `backend/.../validation/ValidationController.kt`
- `backend/.../validation/ValidationModels.kt`
- `backend/.../validation/ValidationAiService.kt`
- `backend/.../ai/AiService.kt` (공용 LLM 호출 서비스)
- `frontend/src/components/job/ValidationPanel.tsx`
- `frontend/src/pages/ValidationReportPage.tsx`

**API 엔드포인트**:
- `POST /api/validation/generate-queries` (Rule-based)
- `POST /api/validation/generate-queries-ai` (LLM 강화)
- `POST /api/validation/execute`

---

## 3. Talend 검증 패턴 비교

| 항목 | Talend | AETL (현재) | etl-dev-project (계획) |
|------|--------|-------------|----------------------|
| 인라인 행 검증 | tMap reject flow | 없음 | T_VALIDATE + REJECT 링크 (Phase C) |
| 데이터셋 검증 | tDQRules | 6개 쿼리 타입 | 동일 6개 타입 + COUNT 기반 인라인 |
| 스키마 준수 | tSchemaComplianceCheck | 컬럼 alias 감지 | SchemaService JDBC + 파일 파서 |
| DQ 규칙 엔진 | Talend DQ Studio | LLM + rule-based | Rule-based Kotlin + LLM 강화 |
| Reject 처리 | REJECT 출력 플로우 | 없음 (report only) | Phase C: REJECT LinkType |
| 접근 방식 | 컴포넌트 기반 | 독립 도구 | 파이프라인 통합 + 독립 리포트 |

**핵심 차이**: Talend은 행 수준(row-level) 인라인 검증 중심, AETL은 데이터셋 수준(dataset-level) 비교 중심. etl-dev-project는 두 방식 모두 지원 (Phase A: dataset, Phase C: row-level).

---

## 4. LLM Agent 가이드 설계

### 4.1 컨텍스트 격리 전략

**문제**: 기존 파이프라인 AI Agent 시스템 프롬프트(`ai.ts` 60-178줄)는 파이프라인 설계 전용 (T_JDBC_INPUT, T_MAP, JSON patch 형식 등). DW 설계/검증 프롬프트 혼입 시:
- 토큰 비용 증가
- 모델 혼란 (파이프라인 조언에 DIM/FACT 테이블 등장)
- "프롬프트 오염" 리스크

**해결책: 태스크별 LLM 컨텍스트 분리**

```
프론트엔드 AI Agent 패널 (기존) → 파이프라인 설계 프롬프트 (변경 없음)
백엔드 /api/dw-design/*         → DW 설계 전용 프롬프트 (신규)
백엔드 /api/validation/*         → 검증 전용 프롬프트 (신규)
```

**공용 백엔드 `AiService.kt`**:
- 4개 Provider 지원 (Claude, OpenAI, Gemini, Grok)
- Spring WebClient 기반
- API 키 환경변수 관리
- DW 설계 / 검증 두 Agent가 공유

### 4.2 DW 설계 프롬프트 설계

**프롬프트 구조**:
```
[System] Kimball 방법론 전문가 역할
[Context] schema_doc.md 내용 (154줄, resources/prompts/에서 로드)
[Input] 연결 스키마 메타데이터 (SchemaService에서 ColumnInfo 포맷팅)
[Output Schema] JSON Schema 기반 Star Schema 구조체 강제
```

**Structured Output 전략**:
- Claude: `tool_use` + Kotlin 정의 JSON schema
- OpenAI: `response_format: { type: "json_schema" }`
- Gemini: `responseMimeType: "application/json"` + `responseSchema`
- 불안정한 regex 추출 완전 제거

**Generate-Validate-Repair 루프**:
1. LLM 호출 → JSON 파싱 시도
2. 파싱 실패 → 오류 메시지와 함께 재시도 (최대 2회)
3. 최종 실패 → 에러 반환 (rule-based fallback 없음, DW 설계는 LLM 필수)

### 4.3 검증 쿼리 프롬프트 설계

**프롬프트 구조**:
```
[System] SQL 검증 전문가, 방언별 규칙 포함
[DB_NOTES] Oracle/MariaDB/PostgreSQL 방언 주의사항 (_DB_NOTES 이식)
[Input] 소스/타겟 테이블 메타데이터 + 컬럼 매핑
[Output Schema] 6개 쿼리 타입의 JSON 구조체
```

**Generate-Validate-Repair 루프**:
1. LLM 호출 → JSON 파싱 → SQL 문법 검증
2. 파싱 실패 또는 문법 오류 → 재시도
3. 최종 실패 → Rule-based 자동 fallback (`ValidationQueryService`)
4. 성공 후 `postValidateSql()` 방언 교정 적용

---

## 5. 기존 파이프라인 AI Agent 영향 분석

### 5.1 변경 없는 부분
- `frontend/src/api/ai.ts` — 시스템 프롬프트 및 LLM 호출 로직 **수정 없음**
- `frontend/src/components/job/AiAgentPanel.tsx` — **수정 없음**
- 기존 파이프라인 컴포넌트 (T_JDBC_INPUT, T_MAP 등) 동작 **변경 없음**

### 5.2 변경되는 부분
- `backend/.../execution/SqlPushdownAdapter.kt` — T_VALIDATE 핸들러 추가 (기존 핸들러 영향 최소화, feature flag로 격리)
- `frontend/src/pages/JobDesignerPage.tsx` — "Export" 드롭다운 버튼 추가 (UI 추가만)

### 5.3 리스크 완화
- T_VALIDATE 실행 로직은 SELECT 쿼리만 실행 (데이터 변경 없음 → 저위험)
- Feature flag로 Phase A 먼저 배포 후 검증
- DW 설계 페이지는 완전히 별도 Route → 기존 페이지 영향 없음

---

## 6. 구현 로드맵

### Phase 1: 쿼리 검증 (1-3주)
우선순위 1위 — `검증기능.md` Phase A와 정렬, 기존 T_VALIDATE enum 활용

1. `ValidationQueryService.kt` — 6개 쿼리 타입 Rule-based 생성
2. `SqlPushdownAdapter.kt` T_VALIDATE 핸들러 추가
3. `ValidationPanel.tsx` 프론트엔드 UI
4. `AiService.kt` + `ValidationAiService.kt` — LLM 강화 레이어

### Phase 2: 자동 매핑 문서 생성 (3-5주)
우선순위 2위 — LLM 의존성 없음, 순수 데이터 처리

1. `MetadataParserService.kt` — Excel/CSV 파싱, 컬럼 alias 감지
2. `MappingDocumentService.kt` — Apache POI Excel 생성
3. `DocumentController.kt` — REST API
4. `DocumentExportModal.tsx` — 프론트엔드 Export 모달

### Phase 3: DW 설계 (5-8주)
우선순위 3위 — LLM 의존성, 복잡한 UI 필요

1. `DwDesignService.kt` — Swagger 파싱, LLM 오케스트레이션
2. `schema_doc.md` 리소스 파일화
3. `DwDesignPage.tsx` + `MermaidRenderer.tsx` + `EntityEditor.tsx`

---

## 7. 공통 의존성 그래프

```
Phase 1 (검증)
  ValidationQueryService ← 의존성 없음 (최우선 구현)
  T_VALIDATE 실행 ← ValidationQueryService
  ValidationPanel UI ← ValidationQueryService API
  ValidationAiService ← AiService (공용)

Phase 2 (문서)
  MetadataParserService ← 의존성 없음
  MappingDocumentService ← MetadataParserService + SchemaService (기존)
  DocumentExportModal ← MappingDocumentService API

Phase 3 (DW 설계)
  DwDesignService ← AiService (공용, Phase 1에서 구현)
  DW Design UI ← DwDesignService API

공용:
  AiService ← Phase 1.4에서 구현, Phase 3.1에서 재사용
```

---

## 8. 핵심 파일 참조

**AETL (소스)**:
- `/home/user/AETL_program_dev/etl_sql_generator.py` — 6개 검증 쿼리, 방언별 SQL, LLM 프롬프트
- `/home/user/AETL_program_dev/aetl_export.py` — Excel 생성, DDL, MERGE SQL
- `/home/user/AETL_program_dev/aetl_designer.py` — Swagger 파싱, Star Schema LLM, Mermaid 생성
- `/home/user/AETL_program_dev/etl_metadata_parser.py` — 컬럼 alias 50+개, Excel/CSV 파싱

**etl-dev-project (타겟)**:
- `/home/user/etl-dev-project/backend/.../ir/JobIR.kt` — `ComponentType.T_VALIDATE` enum, IR 구조
- `/home/user/etl-dev-project/frontend/src/api/ai.ts` — 파이프라인 AI 시스템 프롬프트 (수정 금지, 참조용)
- `/home/user/etl-dev-project/backend/.../schema/SchemaService.kt` — JDBC 메타데이터 (`ColumnInfo`)
- `/home/user/etl-dev-project/검증기능.md` — T_VALIDATE 노드 설정 스펙, Phase A/B/C 로드맵

---

## 9. 리스크 및 대응

| 리스크 | 심각도 | 대응 |
|--------|--------|------|
| Apache POI Excel 스타일링 불일치 | 낮음 | 비교 테스트 생성 (AETL vs 신규) |
| T_VALIDATE 실행 엔진 통합 버그 | 높음 | Feature flag + SELECT만 실행 (데이터 무결성 보장) |
| LLM 응답 품질 저하 (프롬프트 이식) | 중간 | 동일 입력으로 AETL vs 신규 출력 비교 테스트 |
| DW 설계 LLM 멀티 Provider 응답 불일치 | 중간 | Structured Output 강제 + Kotlin data class 검증 |
| 기존 파이프라인 AI Agent 오염 | 낮음 | 아키텍처가 완전 분리 (수정 없음 원칙) |
| 한국어 컬럼 alias 누락 | 중간 | `_COL_ALIASES` 전체 이식 (50+ 항목 완전 검증) |

---