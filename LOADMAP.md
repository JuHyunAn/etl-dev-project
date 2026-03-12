## LOADMAP.md — ETL Platform 고도화/미구현 기능 로드맵

---

## 0. 제외(이미 구현됨 / 전략 변경으로 불필요)

아래는 문서에 언급되지만 **현재 코드/WORK_HISTORY 기준으로 이미 존재**하거나, **이제는 하지 않는 방향**이라 로드맵에서 제외합니다.

- **Transaction Control (T_DB_COMMIT / T_DB_ROLLBACK)**: `계획.md`에 “도입 필요”로 상세 분석이 있으나, 현재는 이미 구현되어 있음(트랜잭션 모드, preview no-op 포함).
- **스케줄링(Quartz), 실행이력 저장/조회, T_LOOP, Trigger**: 이미 구현된 기능 범주(추가 고도화는 별도 요구가 생길 때만).
- **tMap Auto Map의 타입기반 expression 자동 삽입 유지**: `tMap고도화.md`/`tmap정리파일.md`의 결론대로 **기본은 passthrough(비움)**로 전략 변경(= 기존 자동 삽입 로직은 “개선 대상”, 유지/고도화 대상 아님).

---

## 1. 최우선(P0) — 즉시 품질/오류를 줄이는 고도화

### 1.1 tMap Auto Map 전략 전환: **Tier 0 Passthrough**

- **현상**: 현재 Auto Map이 TRIM/UPPER/COALESCE/CAST 등을 “타입 기반으로 자동 삽입”하여 DB 방언/타입 불일치에서 런타임 에러를 유발.\n+  (문서: `tmap정리파일.md`, `tMap고도화.md`, `고도화.md`)\n+- **목표**: Auto Map 기본값을 **expression = \"\"(빈 문자열)** 로 전환. 즉, “컬럼명만 매핑(passthrough)”이 디폴트.\n+- **핵심 규칙**:\n+  - expression 비어있음 → 컴파일러는 `SELECT sourceColumn` 또는 `SELECT sourceColumn AS targetName` 형태로 처리\n+  - Enhancement(TRIM/COALESCE 등)는 “자동”이 아니라 “사용자 선택 적용(Tier 2)”로 이동\n+
- **범위(가장 작게)**:\n+  - `frontend/src/utils/mapping.ts`의 `getAutoExpression()`을 passthrough 기본으로 변경\n+  - Auto Map이 만드는 `MappingRow.expression`을 기본 `\"\"`로 유지\n+
- **완료 기준(테스트 관점)**:\n+  - Auto Map 후 매핑 행들의 expression이 기본적으로 비어 있고, SQL 실행 시 타입 관련 오류가 현저히 감소\n+  - 기존 Job을 불러와도 저장된 expression은 그대로 유지(사용자 입력은 보존)\n+
---

### 1.2 tMap 다중 Output 검증 누락 버그 수정(백엔드 validate)

- **현상**: 컴파일은 Output별 `config.outputMappings[outputId]`를 사용하지만,\n+  `SqlPushdownAdapter.validate()`는 legacy `config.mappings` + “첫 Output 1개”만 검사 → **다중 Output일 때 나머지 Output의 타겟 컬럼 검증이 누락**.\n+  (문서: `고도화.md`, `tmap정리파일.md`)\n+- **목표**: validate 단계에서 tMap의 `outputMappings`를 Output별로 순회하여, 각 Output의 `config.columns` 캐시 기준으로 타겟 컬럼 존재 여부를 검사.\n+  - `outputMappings`가 없을 때만 legacy `mappings` 경로를 fallback\n+
- **완료 기준**:\n+  - 다중 Output 연결된 tMap에서, 각 Output별로 잘못된 타겟 컬럼명이 있으면 validate 에러에 정확히 포함\n+
---

### 1.3 (준P0) 타입 표준/DB별 타입 정의를 “하나의 기준표”로 고정

`타입피드백.md`는 DB별 타입 차이(특히 MSSQL의 TIMESTAMP=ROWVERSION 등)를 명확히 정리합니다.\n+향후 **타입 드롭다운/타입 검증/CAST 제안**을 만들 때 이 기준표가 필요합니다.

- **목표**: 프론트에서 “표준 타입 목록 + DB별 추가 타입 목록”을 유틸로 정리해 재사용.\n+- **적용 후보**:\n+  - tMap Tier 1(Safe Cast) 타입 패밀리 정규화\n+  - Output 테이블 DDL/스키마 비교(향후)\n+
---

## 2. 단기(P1) — tMap 고도화 (오류 예방 + 사용자 제어)

### 2.1 Tier 1 — Safe Cast(타입 불일치 감지 + 제안)

- **목표**: 소스 타입(좌측 패널)과 타겟 타입(TYPE 셀)을 비교하여 불일치를 감지하고,\n+  **자동 삽입이 아니라 “경고 표시 + 클릭 시 CAST 제안 적용”**으로 UX 제공.\n+  (문서: `tmap정리파일.md`, `tMap고도화.md`)\n+- **핵심**:\n+  - DB 타입명은 제각각이므로 `normalizeType()`로 TypeFamily(STRING/INTEGER/DECIMAL/DATE/TIMESTAMP/BOOLEAN/…)로 정규화\n+  - 위험 변환(STRING→DATE 등)은 warning/danger로 표시\n+
- **주의(중복 제거/전략 반영)**:\n+  - IR에 새로운 필드를 저장할 필요는 없음(초기에는 **UI 상태로만** warning/severity를 보여도 됨)\n+
---

### 2.2 Tier 2 — Enhancements(사용자 선택 적용: TRIM/COALESCE/UPPER 등)

- **목표**: Auto Map은 passthrough만 수행하고,\n+  TRIM/UPPER/COALESCE/ROUND 등은 “Enhancements” 메뉴에서 사용자가 선택 적용.\n+  (문서: `tmap정리파일.md`, `tMap고도화.md`)\n+- **형태**:\n+  - 상단에 `[Enhancements ▼]` 드롭다운(일괄 적용)\n+  - 각 행에 💡 팝오버(타입별 추천 expression)\n+
---

### 2.3 Expression 유효성 검사(1차) — tMap/Filter 공통

`구현계획기능.md`에서 제안된 “1차 정규식/단순 규칙 → 필요 시 JSQLParser” 전략을 적용합니다.\n+다만 **tMap Tier 0 전환(P0)** 이후에 들어가도 됩니다(에러 원인이 크게 줄어듦).

- **목표(1차)**:\n+  - 금지 패턴/기본 문법 오류/미치환 `context.xxx` 등을 프론트에서 즉시 경고\n+  - (선택) 백엔드 `validateExpression` 엔드포인트로 서버 검증 추가\n+
---

## 3. 단기(P1) — “미구현 기능” 중 사용빈도 높은 것부터

`컴포넌트구현계획.md`의 TOP 20 기준에서, 현재 시스템에 **실제로 부족한 축**만 추려 우선순위를 정리합니다.

### 3.1 파일 입력/출력 (tFileInputDelimited, tFileOutputDelimited)

- **상태**: 타입/팔레트 레벨 정의는 존재하나, “속성 패널 + 런타임 실행(FileAdapter)”는 미구현.\n+- **목표**: JVM(Kotlin) 기반 FileAdapter로 CSV read/write 최소 구현.\n+- **주의(전략 변경 반영)**:\n+  - 로컬 경로는 보안 이슈가 있으므로, 장기에는 presigned URL(S3/GCS) 전략을 선택지로 둠(즉시에는 로컬/서버 파일로 MVP 가능)\n+
### 3.2 데이터 프리뷰 결과 테이블 UI(개발 생산성)

- **상태**: Preview Mode(100행 제한) 자체는 있으나, UI는 로그/행수 중심.\n+- **목표**: Preview 응답을 테이블로 렌더링(경량 테이블로 시작 → 필요 시 가상 스크롤 도입)\n+
### 3.3 tWarn / tFlowMeter / Chronometer (가벼운 운영 가시성)

- **목표**: 실행 로그/메트릭을 강화하는 “가벼운” 컴포넌트부터 추가(상용 ETL의 기본 UX)\n+- **비고**: Micrometer/Actuator 같은 인프라급 도입은 P2에서 다룸\n+

- **원문**:
1️⃣ 입력 (Input)
tDBInput – DB 테이블 조회
tFileInputDelimited – CSV / 구분자 파일 읽기
tFileInputExcel – Excel 파일 읽기
tRESTClient – REST API 호출
tFixedFlowInput – 테스트용 데이터 생성

2️⃣ 변환 (Transformation)
tMap – 데이터 매핑 / 변환 / Join
tFilterRow – 조건 필터링
tAggregateRow – 집계 (SUM, COUNT 등)
tSortRow – 데이터 정렬
tJoin – 데이터 Join
tConvertType – 데이터 타입 변환
tReplace – 문자열 치환

3️⃣ 출력 (Output)
tDBOutput – DB 테이블 적재
tFileOutputDelimited – CSV 파일 출력
tFileOutputExcel – Excel 파일 출력

4️⃣ 제어 / 로깅 (Control & Logging)
tLogRow – 데이터 로그 출력
tWarn – 경고 로그 출력
tDie – 에러 발생 후 Job 중단
tFlowMeter – 처리 건수 측정
tChronometerStart / tChronometerStop – 실행 시간 측정

---

## 4. 중기(P2) — 플랫폼 운영 품질/확장성

### 4.1 대상 DB 연결 풀링(HikariCP) + Connection 캐시

- **현상**: 대상 DB 접근이 `DriverManager.getConnection` 기반이면 성능/안정성 병목.\n+- **목표**: Connection ID → DataSource(Hikari) 캐시 + invalidate 정책.\n+
### 4.2 AI 호출 백엔드 프록시(+rate limiting)

- **현상**: 프론트에서 직접 호출은 키 노출/운영 통제에 취약.\n+- **목표**: `/api/ai/*`로 서버 프록시화, Resilience4j 기반 rate limiting(선택)\n+
### 4.3 폴더 UI 연결(백엔드 존재 → 프론트 미연결)

- **목표**: 프로젝트/잡 관리에서 폴더 트리 UI를 붙여 자산 관리 UX 완성\n+
### 4.4 리니지 뷰(읽기 전용부터)

- **목표**: IR(nodes/edges + tableName/mappings)만으로 소스→변환→타겟 리니지 그래프를 표시\n+
---

## 5. 중장기(P3) — 실행 엔진/모델 확장(난이도 높음)

### 5.1 REJECT 라인 실행 시맨틱

- **상태**: IR에 PortType/LinkType 정의는 있으나, 실행 엔진에서 실제 reject 스트림 처리 정책이 없음.\n+- **목표**: SQL Pushdown 모델에 맞는 reject 처리(임시 테이블/파일, 실패 정책)부터 설계 후 구현\n+
### 5.2 Pushdown Compiler/Adapter 고도화(방언/최적화)

- **목표**: Dialect(Oracle/MariaDB/PG) 고려한 컴파일/최적화(CTE, 함수, 타입 캐스팅, DML 모드 등)\n+
### 5.3 혼합 엔진(노드별 engineType)

- **목표**: FILE/SQL/Spark 등 노드별 엔진 라우팅을 가능하게 IR/ExecutionService 확장\n+
---

## 6. 실행 순서(요약)

> “중복 제거 후 실제로 남는 것”만 기준으로 한 추천 순서입니다.

1. **tMap Tier 0 Passthrough** (Auto Map expression 비움)\n+2. **tMap 다중 Output validate 수정**\n+3. **타입 기준표 유틸 고정(타입피드백 반영)**\n+4. **tMap Tier 1 Safe Cast → Tier 2 Enhancements**\n+5. **Expression 1차 유효성 검사(필요 시 JSQLParser 단계적 도입)**\n+6. **파일 I/O MVP + 프리뷰 테이블 UI**\n+7. **HikariCP 풀링, AI 백엔드 프록시, 폴더 UI, 리니지 뷰**\n+8. **REJECT, Pushdown 최적화, 혼합 엔진 등 고난이도 확장**\n+
