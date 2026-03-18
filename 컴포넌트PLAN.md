# 컴포넌트 구현 계획서 (컴포넌트PLAN.md)

> 작성일: 2026-03-18
> 기준 문서: 컴포넌트구현.md, 컴포넌트구현계획.md, WORK_HISTORY.md
> 현재 IR 버전: V12 (etl_watermarks, etl_execution_locks 포함)

---
## 요약
  ┌───────┬─────────────────────────────────────────────────────────────┬───────┐
  │ Phase │                            내용                             │ 소요  │
  ├───────┼─────────────────────────────────────────────────────────────┼───────┤                                            
  │ 1     │ T_DIE/T_CONVERT_TYPE/T_REPLACE/T_RUN_JOB (기존 팔레트 완성)   │ 4일                                     
  ├───────┼─────────────────────────────────────────────────────────────┼───────┤
  │ 2     │ tDBRow(1순위) / tSystem(3순위) / tFixedFlowInput             │ 4.5일                                
  ├───────┼─────────────────────────────────────────────────────────────┼───────┤                                            │ 3     │ tREST/tRESTClient (가장 복잡)                                │ 4일   │
  ├───────┼─────────────────────────────────────────────────────────────┼───────┤                                            
  │ 4     │ CSV/Excel File I/O                                          │ 3.5일 │
  ├───────┼─────────────────────────────────────────────────────────────┼───────┤                                            │ 5     │ tWarn/tFlowMeter/tChrono/tLogCatcher                        │ 2.5일 │
  ├───────┼─────────────────────────────────────────────────────────────┼───────┤                                            │ 6     │ tExtractJSONFields/tReplicate/tContextLoad                  │ 4일   │
  └───────┴─────────────────────────────────────────────────────────────┴───────┘



## 1. 현재 구현 상태 전체 매핑

### 1-1. 완전 구현 (UI + 실행 엔진 양쪽 동작)

| 컴포넌트 | IR 타입 | 비고 |
|----------|---------|------|
| tDBInput | T_JDBC_INPUT | Custom Query, 증분 처리, watermark |
| tDBOutput | T_JDBC_OUTPUT | INSERT/UPDATE/UPSERT/DELETE/TRUNCATE_INSERT, PK 설정 |
| tMap | T_MAP | 매핑 에디터, 다중 Output, Expression Builder |
| tFilterRow | T_FILTER_ROW | SQL Pushdown + 이기종 인메모리 |
| tAggregateRow | T_AGGREGATE_ROW | GROUP BY + 집계 함수 |
| tSortRow | T_SORT_ROW | 정렬 컬럼/순서 |
| tJoin | T_JOIN | INNER/LEFT/RIGHT + SQL/이기종 |
| tUnite | T_UNION_ROW | UNION ALL |
| tLogRow | T_LOG_ROW | Runtime Data 탭 연동 샘플 캡처 |
| tPrejob/tPostjob | T_PRE_JOB/T_POST_JOB | Orchestration TRIGGER |
| tDBCommit/Rollback | T_DB_COMMIT/T_DB_ROLLBACK | 공유 커넥션 트랜잭션 |
| tSleep | T_SLEEP | 실행 흐름 지연 |
| tLoop | T_LOOP | FOR_DATE/FOR/LIST 3가지 모드 |

### 1-2. UI만 있고 실행 엔진 미구현

| 컴포넌트 | IR 타입 | 상태 |
|----------|---------|------|
| tFileInputDelimited | T_FILE_INPUT | 팔레트+속성패널 존재, CSV 읽기 엔진 없음 |
| tFileOutputDelimited | T_FILE_OUTPUT | 팔레트+속성패널 존재, CSV 쓰기 엔진 없음 |
| tRunJob | T_RUN_JOB | 팔레트 존재, 서브Job 호출 로직 없음 |
| tConvertType | T_CONVERT_TYPE | 팔레트 존재, 실행 로직 없음 (SKIP됨) |
| tReplace | T_REPLACE | 팔레트 존재, 실행 로직 없음 (SKIP됨) |
| tDie | T_DIE | 팔레트 존재, 에러 강제발생 없음 |
| tValidate | T_VALIDATE | 팔레트 존재, 검증 SQL 실행 없음 |
| tProfile | T_PROFILE | 팔레트 존재, 프로파일링 없음 |
| tLineage | T_LINEAGE | 팔레트 존재, 리니지 추적 없음 |

### 1-3. 완전 미구현 (IR에도 없음)

| 컴포넌트 | Talend TOP30 순위 | 피드백 우선순위 |
|----------|------------------|----------------|
| tDBRow | - (피드백 1위) | ★★★ |
| tREST/tRESTClient | 27위 | ★★★ |
| tSystem | - (피드백 3위) | ★★★ |
| tFixedFlowInput | - | ★★ |
| tFileInputExcel | 12위 | ★★ |
| tFileOutputExcel | 13위 | ★★ |
| tReplicate | 14위 | ★★ |
| tContextLoad | 16위 | ★★ |
| tLogCatcher | - | ★ |
| tWarn | - | ★ |
| tFlowMeter | - | ★ |
| tChronometerStart/Stop | - | ★ |
| tExtractJSONFields | 26위 | ★ |

---

## 2. 구현 가능 여부 분석

### 2-1. 즉시 구현 가능 (난이도: 낮음~중간)

#### ✅ tDie (T_DIE)
- **현재**: 팔레트에만 있고 실행 시 SKIP됨
- **구현**: SqlPushdownAdapter/FetchAndProcessExecutor에서 T_DIE 노드를 만나면 즉시 `throw ExecutionException("tDie: ${message}")`
- **범위**: 백엔드 2곳(SqlPushdownCompiler + FetchAndProcessExecutor) + 에러 메시지 UI
- **선행조건**: 없음

#### ✅ tConvertType (T_CONVERT_TYPE)
- **현재**: 팔레트에 있으나 SKIP됨
- **구현 (SQL Pushdown)**: `CAST(col AS target_type)` SQL 생성
- **구현 (이기종)**: FetchAndProcessExecutor 인메모리 변환 추가
- **config 구조**: `{ "conversions": [{ "column": "age", "fromType": "VARCHAR", "toType": "INTEGER" }] }`
- **범위**: SqlPushdownCompiler CTE 추가 + FetchAndProcessExecutor 변환 로직 + PropertiesPanel UI

#### ✅ tReplace (T_REPLACE)
- **현재**: 팔레트에 있으나 SKIP됨
- **구현 (SQL Pushdown)**: `REPLACE(col, search, replace)` 함수 SQL 생성
- **구현 (이기종)**: String.replace() 인메모리 처리
- **config 구조**: `{ "replacements": [{ "column": "status", "search": "Y", "replace": "YES" }] }`
- **범위**: SqlPushdownCompiler + FetchAndProcessExecutor + PropertiesPanel UI

#### ✅ tFixedFlowInput (신규)
- **용도**: 테스트용 고정 더미 데이터 소스 (DB 없이 행 데이터 직접 정의)
- **구현**: IR의 config에 `{ "schema": [...], "rows": [[...], [...]] }` 저장 → FetchAndProcessExecutor에서 메모리 리스트로 처리
- **SQL Pushdown**: CTE에 `VALUES (...)` 절로 직접 삽입 가능
- **범위**: IR에 T_FIXED_FLOW_INPUT enum 추가 + SqlPushdownCompiler VALUES CTE + FetchAndProcessExecutor 메모리 데이터 소스 + PropertiesPanel 그리드 편집 UI
- **난이도**: 중간 (UI 그리드 입력이 가장 까다로움)

#### ✅ tWarn (신규)
- **용도**: 경고 메시지를 로그에 출력하고 Job은 계속 진행
- **구현**: T_LOG_ROW와 거의 동일. 실행 결과에 `warnings` 필드 추가, UI에 노란색 경고 아이콘 표시
- **범위**: IR enum 추가 + ExecutionModels에 warnings 추가 + 실행엔진 경고 캡처 + Execution Logs UI 경고 표시

#### ✅ tFlowMeter (신규)
- **용도**: 처리된 행 수를 측정·기록
- **분석**: 현재 이미 각 노드 실행 결과에 `rowCount`가 존재. T_FLOW_METER는 이를 별도 노드로 명시화하고 Execution Logs에 누적 표시하는 역할
- **구현**: 통과 노드 역할 (데이터 그대로 흘려보냄) + rowCount 집계 → ExecutionResult에 flowMetrics 추가
- **범위**: IR enum + 실행엔진 pass-through + UI 지표 표시

### 2-2. 중간 난이도 (라이브러리 또는 설계 필요)

#### ⚙️ tDBRow (피드백 1순위, 신규)
- **용도**: SELECT 외 DDL(`CREATE/DROP/ALTER`), DML(`INSERT/UPDATE/DELETE`), Stored Procedure/Function 호출
- **현재 한계**: T_JDBC_INPUT/OUTPUT은 각각 SELECT와 INSERT/UPSERT만 담당. 임의 SQL 실행 불가.
- **구현 방식**:
  - SQL Pushdown: CTE 체인 밖에서 별도 `statement.execute(sql)` 직접 실행
  - 이기종: 타겟 커넥션에 직접 JDBC execute
  - Stored Procedure: `{call proc_name(?, ?)}` 형식 + CallableStatement
  - OUT 파라미터 결과 → context 변수로 저장 가능
- **config 구조**:
  ```json
  {
    "connectionId": "uuid",
    "sqlMode": "QUERY | DML | DDL | PROCEDURE",
    "sql": "CALL update_stats(?, ?)",
    "parameters": [{ "name": "p1", "value": "${context.BIZ_DT}", "type": "STRING" }],
    "outParameters": [{ "name": "result_count", "contextVar": "RESULT_COUNT" }],
    "commitOnSuccess": true
  }
  ```
- **범위**:
  - 백엔드: IR enum(T_DB_ROW) + SqlPushdownAdapter에 executeDbRow() 메서드 + ExecutionService context 업데이트
  - 프론트: PropertiesPanel SQL 에디터(Monaco) + 파라미터 목록 UI + OUT 파라미터 설정

#### ⚙️ tRunJob (T_RUN_JOB 실행 엔진)
- **현재**: 팔레트에만 있음
- **구현**: ExecutionService.execute()를 재귀 호출하되, 별도 쓰레드/동기 선택
  - `jobId` config에서 참조 → JobService.getJob() → ExecutionService.execute()
  - 순환 호출 방지: 호출 스택에 jobId 추적
  - contextOverrides: 부모 context를 자식 Job에 전달
- **config 구조**: `{ "jobId": "uuid", "contextOverrides": { "BIZ_DT": "${context.BIZ_DT}" } }`
- **범위**: ExecutionService에 runJob() 분기 + 순환 탐지 + PropertiesPanel 잡 선택 드롭다운

#### ⚙️ tSystem (피드백 3순위, 신규)
- **용도**: OS 커맨드 실행 (`shell script`, `python`, `cmd`)
- **구현**: `ProcessBuilder`로 커맨드 실행, stdout/stderr 캡처 → Execution Logs 출력
- **보안 고려**:
  - 허용 커맨드 화이트리스트 설정 가능 (application.yml의 `etl.system.allowedCommands`)
  - 환경변수 노출 제어
  - timeout 강제 (기본 60초)
- **config 구조**:
  ```json
  {
    "command": "python /scripts/cleanup.py",
    "args": ["--date", "${context.BIZ_DT}"],
    "workingDir": "/scripts",
    "timeoutSeconds": 60,
    "captureOutput": true
  }
  ```
- **범위**: IR enum(T_SYSTEM) + 실행엔진 ProcessBuilder + PropertiesPanel 커맨드 입력 UI + Execution Logs stdout 표시

#### ⚙️ tContextLoad (신규)
- **용도**: 파일(CSV/Properties) 또는 DB에서 Context 변수를 동적으로 로드
- **현재 구조**: Job IR의 `context` 필드는 정적 선언만 지원
- **구현**: 실행 시작 전 T_CONTEXT_LOAD 노드를 먼저 처리:
  - DB 모드: `SELECT key, value FROM config_table` → context에 머지
  - 파일 모드: 서버 파일 `.properties` 또는 CSV 읽기 → context 머지
  - 우선순위: tContextLoad 결과 → Job context 선언값 → runtimeContext(스케줄 overrides)
- **config 구조**:
  ```json
  {
    "mode": "DB | FILE",
    "connectionId": "uuid",
    "query": "SELECT cfg_key, cfg_value FROM etl_config WHERE env = 'PROD'",
    "filePath": "/config/etl.properties",
    "keyColumn": "cfg_key",
    "valueColumn": "cfg_value"
  }
  ```
- **범위**: ExecutionService 전처리 단계 추가 + IR enum + PropertiesPanel UI

#### ⚙️ tExtractJSONFields (신규)
- **용도**: JSON 문자열 컬럼을 파싱하여 여러 컬럼으로 추출
- **구현 (SQL Pushdown)**:
  - PostgreSQL: `col->>'key'` (jsonb 연산자)
  - MariaDB: `JSON_EXTRACT(col, '$.key')`
  - Oracle: `JSON_VALUE(col, '$.key')`
- **구현 (이기종)**: Jackson ObjectMapper로 인메모리 파싱
- **config 구조**:
  ```json
  {
    "sourceColumn": "json_payload",
    "extractions": [
      { "jsonPath": "$.user.name", "targetColumn": "user_name", "dataType": "STRING" },
      { "jsonPath": "$.amount", "targetColumn": "amount", "dataType": "DECIMAL" }
    ]
  }
  ```
- **범위**: IR enum + SqlPushdownCompiler 방언별 분기 + FetchAndProcessExecutor + PropertiesPanel UI

#### ⚙️ tReplicate (신규)
- **용도**: 동일한 데이터를 여러 출력 노드로 복제 분기
- **현재**: T_MAP이 다중 Output 지원하지만 변환 없이 단순 복제 목적에는 과함
- **구현**: SqlPushdownCompiler에서 동일 CTE를 여러 INSERT에 재사용 (이미 T_MAP 다중 Output과 유사 구조)
- **이기종**: FetchAndProcessExecutor에서 row를 여러 writer에게 동시 전달
- **범위**: IR enum(T_REPLICATE) + SqlPushdownCompiler + FetchAndProcessExecutor + PropertiesPanel (연결된 Output 확인 표시)

### 2-3. 높은 난이도 (외부 라이브러리 또는 복잡한 설계)

#### ⚠️ tREST/tRESTClient (피드백 2순위, 신규)
- **용도**: REST API 호출 (입력 소스 또는 출력 대상)
- **복잡성 요소**:
  - 인증: Basic / Bearer Token / OAuth2 Client Credentials / API Key
  - 페이징: offset/cursor 기반 자동 반복 호출
  - 응답 파싱: JSON path로 배열 추출 (결과가 `data.items[*]` 형태인 경우)
  - 에러 재시도: 429/5xx 시 backoff retry
  - Input(조회)/Output(POST/PUT) 두 방향 모두 지원
- **기술 선택**: Spring의 `RestTemplate` 또는 `WebClient` (이미 Spring Boot 프로젝트)
- **config 구조**:
  ```json
  {
    "url": "https://api.example.com/v1/orders",
    "method": "GET",
    "authType": "BEARER",
    "authToken": "${context.API_TOKEN}",
    "headers": { "Content-Type": "application/json" },
    "bodyTemplate": "{ \"date\": \"${context.BIZ_DT}\" }",
    "responseArrayPath": "$.data.items",
    "pagination": {
      "type": "OFFSET",
      "pageParam": "page",
      "sizeParam": "size",
      "pageSize": 100
    },
    "retryCount": 3,
    "retryDelayMs": 1000
  }
  ```
- **범위**:
  - IR에 T_REST_INPUT, T_REST_OUTPUT enum 추가
  - 백엔드: RestAdapter.kt 신규 파일 (RestTemplate 기반)
  - FetchAndProcessExecutor: REST 소스 처리 분기
  - PropertiesPanel: URL/Method/Auth/Headers/Body/Pagination UI (가장 복잡한 UI)
  - 보안: URL/토큰 context 변수 참조 지원

#### ⚠️ tFileInputExcel / tFileOutputExcel (신규)
- **의존성**: Apache POI 라이브러리 추가 필요
  ```kotlin
  // build.gradle.kts
  implementation("org.apache.poi:poi-ooxml:5.2.5")
  ```
- **구현**:
  - Input: POI XSSFWorkbook으로 .xlsx 읽기, 시트/헤더행 설정
  - Output: XSSFWorkbook 생성, 헤더 자동 삽입, 데이터 타입별 셀 포맷
- **서버 파일 경로**: `application.yml`의 `etl.file.basePath` 기준 상대 경로 사용
- **범위**: build.gradle.kts 의존성 추가 + IR enum + FileAdapter 확장 + PropertiesPanel UI

#### ⚠️ tLogCatcher (신규)
- **용도**: Job 내 발생하는 모든 에러/경고를 한 곳에서 잡아 후속 처리
- **복잡성**: Talend에서는 Global Map을 통해 에러 정보를 전파하는데, 현재 아키텍처에서는 이와 유사한 에러 전파 채널이 없음
- **구현 방향**: Trigger(ON_ERROR) 엣지와 연계하여 에러 발생 노드의 메시지/스택트레이스를 context 변수로 주입 후 tLogCatcher 노드로 라우팅
  - 예: `context.ERROR_MESSAGE`, `context.ERROR_COMPONENT` 자동 주입
- **범위**: IR enum + ExecutionService 에러 이벤트 캡처 + PropertiesPanel 에러 필드 매핑 UI

#### ⚠️ tChronometerStart / tChronometerStop (신규)
- **용도**: 특정 구간 실행 시간 측정
- **구현**: 실행 컨텍스트에 타이머 Map 관리. Start 노드에서 System.currentTimeMillis() 저장, Stop에서 차이 계산 → context 변수로 주입 또는 로그 출력
- **범위**: IR enum 2개 + 실행 엔진 타이머 관리 + PropertiesPanel 레이블 입력

#### ⚠️ tFileInputDelimited / tFileOutputDelimited (실행 엔진 구현)
- **현재**: UI만 존재
- **구현 방향**:
  - 서버사이드 파일 경로 (`/uploads/` 기준 상대경로)
  - Input: `BufferedReader` + CSV 파싱 (구분자, 인코딩, 헤더 유무)
  - Output: `BufferedWriter` + 포맷 설정
  - 이기종 경로: FetchAndProcessExecutor의 FileDataSource로 처리
  - SQL Pushdown: PostgreSQL `COPY FROM/TO` 명령 활용 가능 (방언 분기)
- **범위**: FileAdapter.kt 신규 파일 + SqlPushdownCompiler COPY 지원 + FetchAndProcessExecutor FileSource + 파일 업로드 API (MultipartFile)

---

## 3. 구현 불가 / 보류 판단

| 컴포넌트 | 판단 | 이유 |
|----------|------|------|
| tJava / tJavaRow / tJavaFlex | **보류** | 임의 코드 실행 = 심각한 보안 위험. Sandbox 없이는 RCE 취약점. 현재 아키텍처상 안전하게 구현 불가. |
| tDBConnection / tDBClose | **불필요** | 현재 HikariCP 또는 DriverManager 자동 관리. Talend 방식의 수동 Connection/Close는 Spring 환경에서 오히려 역행. tDBCommit/Rollback으로 대체. |

---

## 4. 구현 순서 및 상세 작업 계획

### Phase 1: 기존 팔레트 컴포넌트 실행 엔진 완성 (빠른 성과)

> IR 변경 없이 기존 컴포넌트 타입에 실행 로직만 추가. 백엔드 작업 주도.

#### 1-1. T_DIE — 에러 강제 발생
**작업 목록:**
1. `SqlPushdownCompiler.kt` — T_DIE 노드를 CTE에 포함하지 않고, 컴파일 전 선행 처리로 분리
2. `SqlPushdownAdapter.kt` — 실행 전 T_DIE 노드 존재 여부 확인 → `throw RuntimeException("${label}: ${message}")`
3. `FetchAndProcessExecutor.kt` — 노드 순서 처리 중 T_DIE 만나면 즉시 예외
4. `PropertiesPanel.tsx` — message 입력 필드 추가
5. **예상 소요**: 0.5일

#### 1-2. T_CONVERT_TYPE — 타입 변환
**작업 목록:**
1. `SqlPushdownCompiler.kt` — T_CONVERT_TYPE CTE 생성:
   ```sql
   cte_convert_1 AS (
     SELECT CAST(age AS INTEGER) as age, name FROM cte_source_1
   )
   ```
   방언별 CAST 문법 분기 (PG/MariaDB/Oracle 동일 표준 가능)
2. `FetchAndProcessExecutor.kt` — 인메모리 변환 Map<String, String→Any?> 변환 로직 추가
3. `PropertiesPanel.tsx` — conversions 배열 편집 UI (컬럼 선택 + 타겟 타입 선택)
4. **예상 소요**: 1일

#### 1-3. T_REPLACE — 문자열 치환
**작업 목록:**
1. `SqlPushdownCompiler.kt` — T_REPLACE CTE 생성:
   ```sql
   cte_replace_1 AS (
     SELECT REPLACE(status, 'Y', 'YES') as status, name FROM cte_source_1
   )
   ```
2. `FetchAndProcessExecutor.kt` — String.replace() 인메모리 처리
3. `PropertiesPanel.tsx` — replacements 배열 편집 UI
4. **예상 소요**: 1일

#### 1-4. T_RUN_JOB — 서브 Job 실행
**작업 목록:**
1. `ExecutionService.kt` — `executeRunJob()` 메서드 추가:
   - jobId 로드 → 독립 실행 (별도 ExecutionLock)
   - 부모 context → 자식 contextOverrides 전달
   - 순환 호출 방지: `callStack: Set<String>` 파라미터 추가
2. `PropertiesPanel.tsx` — Job 선택 드롭다운 (전체 Job 목록 API 호출) + Context 매핑 UI
3. **API 추가**: `GET /api/jobs` (전체 Job 목록, 드롭다운용)
4. **예상 소요**: 1.5일

---

### Phase 2: 피드백 최우선 신규 컴포넌트 (tDBRow / tSystem / tFixedFlowInput)

#### 2-1. tDBRow — 임의 SQL/SP 실행 (피드백 1순위)
**작업 목록:**

**백엔드:**
1. `JobIR.kt` — `T_DB_ROW` enum 추가
2. `ExecutionService.kt` / `SqlPushdownAdapter.kt` — T_DB_ROW 분기:
   ```kotlin
   fun executeDbRow(node: NodeIR, context: Map<String, String>, conn: Connection) {
       val sql = resolveContext(node.config["sql"] as String, context)
       val sqlMode = node.config["sqlMode"] as? String ?: "DML"
       when(sqlMode) {
           "QUERY" -> { /* ResultSet → rowSamples 캡처 */ }
           "DML", "DDL" -> conn.createStatement().use { it.execute(sql) }
           "PROCEDURE" -> {
               conn.prepareCall("{call $procedureName(...)}").use { cs ->
                   // IN 파라미터 바인딩
                   // OUT 파라미터 등록 → 결과 context 저장
               }
           }
       }
   }
   ```
3. Flyway 마이그레이션: 필요 없음 (기존 구조 재사용)

**프론트엔드:**
1. `PropertiesPanel.tsx` — T_DB_ROW 전용 섹션:
   - Connection 선택
   - SQL Mode 탭 (QUERY / DML / DDL / PROCEDURE)
   - Monaco Editor SQL 입력 (rows=12)
   - 파라미터 바인딩 목록 (IN/OUT 구분)
   - Commit 옵션 체크박스
2. `ComponentPalette.tsx` — INPUT 또는 UTILITY 섹션에 T_DB_ROW 추가
3. `CustomNodes.tsx` — T_DB_ROW 노드 색상 (UTILITY 계열: 노란색)

**예상 소요**: 2일

---

#### 2-2. tSystem — OS 커맨드 실행 (피드백 3순위)
**작업 목록:**

**백엔드:**
1. `JobIR.kt` — `T_SYSTEM` enum 추가
2. `application.yml` — `etl.system.commandTimeout: 60` 설정 추가
3. `SystemCommandExecutor.kt` — 신규 파일:
   ```kotlin
   class SystemCommandExecutor {
       fun execute(command: String, args: List<String>, workingDir: String?, timeout: Long): String {
           val pb = ProcessBuilder(listOf(command) + args)
           if (workingDir != null) pb.directory(File(workingDir))
           pb.redirectErrorStream(true)
           val proc = pb.start()
           val output = proc.inputStream.bufferedReader().readText()
           val success = proc.waitFor(timeout, TimeUnit.SECONDS)
           if (!success) { proc.destroyForcibly(); throw RuntimeException("Command timeout") }
           if (proc.exitValue() != 0) throw RuntimeException("Command failed (exit ${proc.exitValue()}): $output")
           return output
       }
   }
   ```
4. `SqlPushdownAdapter.kt` / `FetchAndProcessExecutor.kt` — T_SYSTEM 분기 추가

**프론트엔드:**
1. `PropertiesPanel.tsx` — T_SYSTEM 섹션: command 입력, args 목록, workingDir, timeout, captureOutput 옵션
2. `ComponentPalette.tsx` — ORCHESTRATION 섹션에 추가

**예상 소요**: 1일

---

#### 2-3. tFixedFlowInput — 더미 데이터 생성
**작업 목록:**

**백엔드:**
1. `JobIR.kt` — `T_FIXED_FLOW_INPUT` enum 추가
2. `SqlPushdownCompiler.kt` — VALUES CTE 생성:
   ```sql
   cte_fixed_1 AS (
     SELECT * FROM (VALUES
       ('Alice', 30, 'F'),
       ('Bob', 25, 'M')
     ) AS t(name, age, gender)
   )
   ```
   (PostgreSQL 문법 기준, MariaDB/Oracle 방언 분기 필요)
3. `FetchAndProcessExecutor.kt` — config의 rows를 List<List<Any?>>로 변환 → 메모리 소스

**프론트엔드:**
1. `PropertiesPanel.tsx` — T_FIXED_FLOW_INPUT 섹션:
   - 스키마 정의 (컬럼명 + 타입) 목록 편집
   - 데이터 행 입력 (간단한 테이블 그리드 편집기)
   - 행 추가/삭제 버튼
2. `ComponentPalette.tsx` — INPUT 섹션에 추가

**예상 소요**: 1.5일

---

### Phase 3: REST 연동 (tREST / tRESTClient)

> 가장 복잡한 컴포넌트. UI와 백엔드 모두 상당한 설계 필요.

#### 3-1. tRESTInput (입력용)
**작업 목록:**

**백엔드:**
1. `JobIR.kt` — `T_REST_INPUT` enum 추가
2. `RestInputAdapter.kt` — 신규 파일:
   - RestTemplate 또는 WebClient 기반
   - 페이징 자동 처리 (OFFSET/CURSOR)
   - JSON 응답 파싱: JsonPath로 배열 추출
   - 재시도 로직 (429/5xx)
   - context 변수 치환 (URL, Body, Header에 ${context.XXX})
3. `FetchAndProcessExecutor.kt` — REST 소스 분기 추가

**프론트엔드:**
1. `PropertiesPanel.tsx` — T_REST_INPUT 섹션 (가장 많은 설정):
   - URL 입력 (context 변수 자동완성)
   - Method 선택 (GET/POST/PUT)
   - Auth 탭 (None/Basic/Bearer/API Key)
   - Headers 편집 (key-value 목록)
   - Body 템플릿 (POST/PUT용 Monaco 에디터)
   - Response Path (배열 추출 경로)
   - 페이징 설정
   - 스키마 자동 추론 버튼 (샘플 호출 → 컬럼 추출)

#### 3-2. tRESTOutput (출력용)
**작업 목록:**
1. `JobIR.kt` — `T_REST_OUTPUT` enum 추가
2. FetchAndProcessExecutor에 REST Writer 추가:
   - 각 행을 Body 템플릿에 머지 후 API 호출
   - 배치 모드: N행을 배열로 묶어 한 번에 전송

**예상 소요**: 3~4일 (REST 전체)

---

### Phase 4: 파일 I/O 실행 엔진

#### 4-1. tFileInputDelimited / tFileOutputDelimited
**작업 목록:**

**백엔드:**
1. `application.yml` — `etl.file.basePath` 설정
2. `FileController.kt` — 신규: 파일 업로드 API (`POST /api/files/upload`)
3. `FileAdapter.kt` — 신규:
   - CSV 읽기: `BufferedReader` + 구분자/인코딩/헤더 설정
   - CSV 쓰기: `BufferedWriter` + 포맷 설정
   - PostgreSQL Pushdown: `COPY table FROM '/path/file.csv' CSV HEADER DELIMITER ','`
4. `FetchAndProcessExecutor.kt` — T_FILE_INPUT을 FileDataSource로 처리
5. Flyway V13: 파일 메타데이터 테이블 (선택적)

**프론트엔드:**
1. `PropertiesPanel.tsx` — T_FILE_INPUT/OUTPUT 섹션:
   - 파일 업로드 드롭존 (또는 서버 경로 직접 입력)
   - 구분자, 인코딩, 헤더 유무, Skip 행 수 설정
   - 컬럼 스키마 자동 추론 버튼

**예상 소요**: 2일

---

#### 4-2. tFileInputExcel / tFileOutputExcel
**작업 목록:**

**백엔드:**
1. `build.gradle.kts` — Apache POI 의존성 추가:
   ```kotlin
   implementation("org.apache.poi:poi-ooxml:5.2.5")
   ```
2. `ExcelAdapter.kt` — 신규:
   - Input: XSSFWorkbook → 시트 선택 → 헤더행 → 데이터 추출
   - Output: XSSFWorkbook 생성 → 스타일 설정 → 데이터 쓰기 → 파일 저장

**프론트엔드:**
1. `PropertiesPanel.tsx` — T_FILE_INPUT_EXCEL/OUTPUT_EXCEL 섹션:
   - 파일 경로, 시트 이름/인덱스, 헤더 행 번호, 데이터 시작 행
   - 셀 포맷 설정 (출력용)

**예상 소요**: 1.5일

---

### Phase 5: 로깅/측정/유틸 컴포넌트

#### 5-1. tWarn
1. IR enum T_WARN 추가
2. 실행 엔진에서 경고 메시지 ExecutionResult.warnings에 추가 (Job은 계속 진행)
3. Execution Logs UI에 노란색 경고 뱃지 표시
4. **예상 소요**: 0.5일

#### 5-2. tFlowMeter
1. IR enum T_FLOW_METER 추가
2. pass-through 노드 (데이터 그대로 통과)
3. 누적 rowCount를 ExecutionResult.flowMetrics에 기록
4. Execution Logs에 처리 건수 요약 표시
5. **예상 소요**: 0.5일

#### 5-3. tChronometerStart / tChronometerStop
1. IR enum T_CHRONO_START, T_CHRONO_STOP 추가
2. 실행 컨텍스트에 `timers: Map<String, Long>` 추가
3. Start: `timers[label] = System.currentTimeMillis()`
4. Stop: `elapsedMs = currentTimeMillis - timers[label]` → context 변수 또는 로그 출력
5. **예상 소요**: 0.5일

#### 5-4. tLogCatcher
1. IR enum T_LOG_CATCHER 추가
2. ON_ERROR TRIGGER 엣지와 연계: 에러 발생 시 context에 `ERROR_MESSAGE`, `ERROR_COMPONENT`, `ERROR_STACK` 자동 주입
3. T_LOG_CATCHER 노드가 이 context 변수를 읽어 Execution Logs에 구조화된 에러 기록
4. **예상 소요**: 1일

---

### Phase 6: 데이터 가공 심화 컴포넌트

#### 6-1. tExtractJSONFields
**작업 목록:**
1. IR enum T_EXTRACT_JSON_FIELDS 추가
2. SqlPushdownCompiler: DB 방언별 JSON 연산자 분기:
   - PostgreSQL: `payload->>'key'`, `payload#>>'{a,b}'`
   - MariaDB: `JSON_EXTRACT(payload, '$.key')`
   - Oracle: `JSON_VALUE(payload, '$.key')`
3. FetchAndProcessExecutor: Jackson ObjectMapper로 인메모리 파싱
4. PropertiesPanel: sourceColumn 선택 + extractions 목록 편집 (jsonPath, targetColumn, dataType)
5. **예상 소요**: 1.5일

#### 6-2. tReplicate
**작업 목록:**
1. IR enum T_REPLICATE 추가
2. SqlPushdownCompiler: 동일 CTE를 여러 하위 노드에서 참조 (이미 T_MAP 다중 Output 구조와 동일)
3. FetchAndProcessExecutor: 동일 DataSet을 여러 Writer에 전달
4. PropertiesPanel: 연결된 Output 수 표시 (읽기 전용 안내)
5. **예상 소요**: 1일

#### 6-3. tContextLoad
**작업 목록:**
1. IR enum T_CONTEXT_LOAD 추가
2. `ExecutionService.kt` — 실행 전 Pre-processing 단계: T_CONTEXT_LOAD 노드 먼저 처리
3. DB 모드: JDBC 쿼리 → Map<String, String> → context 머지
4. 파일 모드: .properties 파싱 → context 머지
5. PropertiesPanel: mode 선택 + DB(connectionId + query) 또는 파일(filePath + 컬럼 매핑) 설정
6. **예상 소요**: 1.5일

---

## 5. 전체 작업 우선순위 및 일정 요약

| Phase | 컴포넌트 | 난이도 | 예상 소요 | 선행 조건 |
|-------|----------|--------|-----------|-----------|
| **Phase 1** | T_DIE, T_CONVERT_TYPE, T_REPLACE, T_RUN_JOB | 낮음~중간 | 4일 | 없음 |
| **Phase 2** | tDBRow, tSystem, tFixedFlowInput | 중간 | 4.5일 | 없음 |
| **Phase 3** | tREST/tRESTClient | 높음 | 4일 | 없음 |
| **Phase 4** | CSV File I/O, Excel File I/O | 중간 | 3.5일 | 파일 업로드 API |
| **Phase 5** | tWarn, tFlowMeter, tChrono, tLogCatcher | 낮음~중간 | 2.5일 | 없음 |
| **Phase 6** | tExtractJSONFields, tReplicate, tContextLoad | 중간 | 4일 | 없음 |

---

## 6. 아키텍처 영향 분석

### 6-1. IR 변경 필요 컴포넌트 (JobIR.kt enum 추가)
Phase 2부터 신규 ComponentType 추가 필요. Flyway 마이그레이션은 불필요 (ir_json JSONB 자유 형식).

### 6-2. 실행 엔진 확장 포인트
- `SqlPushdownAdapter.kt`의 `executeNode()` — T_* case 추가
- `SqlPushdownCompiler.kt`의 `buildCte()` — 신규 CTE 생성 로직
- `FetchAndProcessExecutor.kt`의 `processNode()` — 인메모리 처리 분기

### 6-3. PropertiesPanel 확장 방식
현재 컴포넌트별 섹션이 대형 if-else 블록으로 구성됨.
신규 컴포넌트 추가 시 동일 패턴으로 섹션 추가. 리팩터링은 요청 없으면 진행하지 않음.

### 6-4. 외부 의존성 추가가 필요한 컴포넌트
| 컴포넌트 | 추가 의존성 | build.gradle.kts |
|----------|------------|------------------|
| tFileInputExcel/tFileOutputExcel | Apache POI | `poi-ooxml:5.2.5` |
| tREST (고급 JSON Path) | JsonPath | `json-path:2.9.0` |

### 6-5. 보안 고려 필요 컴포넌트
| 컴포넌트 | 보안 사항 |
|----------|-----------|
| tSystem | 허용 커맨드 화이트리스트, timeout, 환경변수 격리 |
| tREST | URL/토큰을 context 변수로 관리 (IR에 평문 저장 금지 권장) |
| tDBRow | DDL 실행 권한 분리 고려 (커넥션별 권한 설정) |

---

## 7. 구현 시 주의사항

1. **중복 작업 금지**: 각 Phase 시작 전 이미 구현된 로직을 반드시 재확인하고 진행
2. **SQL Pushdown vs 이기종 양쪽 구현**: 신규 변환 컴포넌트는 두 실행 경로 모두 처리해야 함
3. **PropertiesPanel 패턴 유지**: `componentType === "T_XXX"` 조건 블록 추가 방식 일관성 유지
4. **IR 하위 호환**: 기존 저장된 Job JSON이 깨지지 않도록 신규 config 필드는 nullable 처리
5. **Context 변수 치환**: 신규 컴포넌트의 URL/쿼리/파라미터는 `ContextFunctionEvaluator`로 치환 처리
6. **테스트**: 각 컴포넌트 구현 후 tFixedFlowInput + 신규 컴포넌트 조합으로 End-to-End 테스트
