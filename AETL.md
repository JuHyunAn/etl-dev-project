# AETL 프로그램 분석 및 ETL Platform 기능 이식 가이드

> **AETL 프로젝트 루트**: `C:\Users\안주현\Desktop\AETL_program_dev`  
> **ETL Platform 루트**: `C:\Users\안주현\Desktop\ETL_Platform` (본 문서 기준)  
> 본 문서는 AETL의 폴더/파일 역할 분석과, ETL Platform에 기능을 이식할 때의 **리스크 최소화** 및 **추천 방법**을 정리합니다.

---

## 1. AETL 프로그램 구조 요약

### 1.1 경로별 역할 (폴더/파일)

| 경로 (폴더/파일) | 역할 |
|------------------|------|
| `etl_streamlit_app.py` | 메인 웹 진입점. Streamlit 7페이지(검증/프로파일/라인리지/DW설계/산출물 등) |
| `aetl_llm.py` | LLM 연동 (검증 SQL 생성, 매핑 추천 등) |
| `aetl_agent.py` | 에이전트 오케스트레이션 |
| `aetl_executor.py` | SQL 실행 |
| `aetl_store.py` | 검증/이력·메타 저장 |
| `aetl_profiler.py` | 데이터 프로파일링 |
| `aetl_export.py` | 산출물 생성 (Excel/DDL/MERGE 등) |
| `aetl_designer.py` | DW 설계 |
| `aetl_lineage.py` | 리니지 분석 |
| `aetl_metadata_engine.py` | 메타데이터 수집 |
| `aetl_template_profile.py` | 엑셀 프로파일(사용자 정의) |
| `etl_sql_generator.py` | 검증 SQL 생성 (규칙 기반) |
| `etl_metadata_parser.py` | 테이블 정의서(Excel/CSV) 파서 |
| `db_schema.py` | DB 스키마 조회·캐시. `db_config.json` 경로 기준 |
| `db_config.json` | DB 연결 설정(단일). `config_path`로 다른 모듈에서 참조 |
| `etl_flow_component/` | ETL 리니지 플로우 맵 UI. `frontend/` = React 빌드, `frontend/build` = Streamlit 임베드 |
| `erd_flow_component/` | DW 설계 ERD UI. 구조는 `etl_flow_component`와 동일 |
| `documents/architecture/` | 설계 문서 (Plan_ETL.md, loadmap.md, schema_doc.md 등) |
| `documents/sample/` | 샘플 파일 |
| `.template_profiles/` | `aetl_template_profile` 사용자 정의 엑셀 프로파일 저장 (루트 기준) |
| `*.db` (루트) | SQLite: `aetl_metadata.db`(검증/이력), `.aetl_metadata.db`(메타엔진) |
| `.schema_cache.json` | `db_schema` 스키마 캐시. `db_config.json`과 같은 디렉터리 |

### 1.2 AETL 기능 도메인 정리

| 도메인 | 관련 모듈 | 설명 |
|--------|-----------|------|
| **검증** | `aetl_llm`, `etl_sql_generator`, `aetl_executor`, `aetl_store` | LLM/규칙 기반 검증 SQL 생성 → 실행 → 이력 저장 |
| **프로파일링** | `aetl_profiler`, `aetl_template_profile` | 컬럼/테이블 통계, 사용자 정의 엑셀 프로파일 |
| **라인리지** | `aetl_lineage`, `etl_flow_component` | 데이터 흐름 그래프, React 플로우 UI 임베드 |
| **DW 설계** | `aetl_designer`, `erd_flow_component` | ERD 설계, React ERD UI 임베드 |
| **산출물** | `aetl_export` | Excel/DDL/MERGE 등 문서·스크립트 생성 |
| **메타데이터** | `aetl_metadata_engine`, `etl_metadata_parser`, `db_schema` | 스키마 수집·캐시, 테이블 정의서 파싱 |
| **에이전트** | `aetl_agent` | LLM 기반 오케스트레이션 |

---

## 2. ETL Platform과의 대응 관계

### 2.1 현재 ETL Platform 구성

- **백엔드**: Kotlin + Spring Boot. REST API, PostgreSQL(메타 DB), JDBC로 대상 DB 연동.
- **실행**: `ExecutionEngine` + `SqlPushdownAdapter`. Job IR → SQL 푸시다운 실행.
- **프론트**: React + Vite + TypeScript. Job Designer(React Flow), Connections, Executions 등.
- **IR**: `JobIR`(nodes, edges, context), `ComponentType`에 T_VALIDATE, T_PROFILE, T_LINEAGE 등 이미 정의됨.

### 2.2 Plan_ETL.md 방향과의 정합성

- **Runtime**: JVM(Kotlin) 유지. ETL 실행은 Spring/Kotlin이 담당.
- **Python 역할**: LLM/메타데이터/보조·고급 기능(검증 SQL, 프로파일, 라인리지, DW 설계, 산출물)에 사용.
- **AETL 통합**: "새 ETL 플랫폼의 메뉴/옵션(고급 분석/검증/문서화 기능)"으로 흡수.

따라서 AETL의 **실행 엔진(aetl_executor)** 은 ETL Platform의 `SqlPushdownAdapter`와 중복되며, **고급 기능(검증/프로파일/라인리지/DW설계/산출물/메타엔진)** 만 이식 대상입니다.

---

## 3. 기능 이식 방법 (리스크 최소화 + 추천)

### 3.1 추천: Spring 오케스트레이터 + Python API 서비스 (하이브리드)

- **구조**: AETL 로직을 **Python REST API**(FastAPI 권장)로 노출하고, **Spring Boot가 해당 API를 호출**하는 방식.
- **사용자 경험**: 사용자는 React → Spring만 사용. Spring이 내부적으로 Python 서비스를 호출.
- **장점**:
  - Python 자산(LLM, pandas, 프로파일링 등)을 그대로 활용.
  - ETL 실행·메타 DB·인증은 기존 JVM/React 체계 유지.
  - 단계별 이식 가능(모듈별로 API만 붙이면 됨).
- **리스크**: Python 서버 배포·헬스체크·네트워크 관리 필요. 단, “고급 기능”만 담당하므로 장애 시에도 기본 ETL 실행에는 영향 없음.

### 3.2 대안 비교

| 방법 | 설명 | 리스크 | 적합한 상황 |
|------|------|--------|-------------|
| **A. Streamlit iframe/링크** | Streamlit 앱을 그대로 두고 React에서 새 탭/iframe으로 연결 | 낮음. 인증/테넌트 분리 이슈 | 빠른 통합, UI 통일 불필요 시 |
| **B. Python API + React 재구현** | Streamlit 제거, Python은 API만. UI는 전부 React에서 재작성 | 중간. React 개발 공수 | UI를 React로 완전 통일하고 싶을 때 |
| **C. Kotlin 전면 이식** | Python 로직을 Kotlin으로 재구현 | 높음. 이식 비용·ML/통계 라이브러리 대체 | 서버를 JVM 단일로 줄이고 싶을 때 |
| **D. Spring + Python API (추천)** | Spring이 Python API 호출, React는 Spring만 호출 | 중간(관리 포인트만 증가) | Plan_ETL 방향·기존 아키텍처 유지 시 |

### 3.3 리스크 최소화 원칙

1. **경계 명확화**: ETL 실행·Connection·Job CRUD·스키마 조회는 **Spring/PostgreSQL** 유지. Python은 “검증/프로파일/라인리지/DW설계/산출물/메타엔진” 등 **읽기·분석·생성**만 담당.
2. **데이터 전달**: Connection/스키마/IR 등은 Spring이 보유. Python API는 **필요 최소 정보**(connection 정보 마스킹, jobId + IR 요약 등)만 받고, 상세 DB 접근이 필요하면 Spring이 **임시 토큰/제한된 연결 정보**만 전달하거나, Spring이 스키마/IR 스냅샷을 JSON으로 넘기는 방식 권장.
3. **실패 격리**: Python 서비스 타임아웃·불가 시 Spring이 "고급 기능을 일시 사용할 수 없음" 정도로 응답. 기본 Job 실행/저장은 영향 없도록.
4. **단계 도입**: 1단계는 **검증 또는 프로파일** 한 가지 기능만 Python API로 붙이고, 2단계에서 라인리지·DW설계·산출물·메타엔진 순으로 확장.

---

## 4. 모듈별 이식 전략

### 4.1 검증 (aetl_llm, etl_sql_generator, aetl_executor, aetl_store)

- **역할**: 검증 규칙/LLM → 검증 SQL 생성 → 실행 → 이력 저장.
- **이식**:  
  - **SQL 실행**은 ETL Platform의 `SqlPushdownAdapter` 또는 기존 Execution 경로를 재사용하는 것이 일관됨.  
  - **검증 SQL 생성**(LLM/규칙)만 Python API로 두고, Spring이 “검증 SQL 생성” API 호출 → 받은 SQL을 기존 실행 경로로 실행 → 결과를 `executions` 또는 전용 검증 이력 테이블에 저장.
- **인터페이스 예시**:  
  - `POST /api/python/validation/generate-sql` (body: connectionId, tableName, ruleType, 옵션) → `{ "sql": "..." }`  
  - Spring: `POST /api/jobs/{id}/validate` → Python에서 SQL 생성 → Spring이 해당 Connection으로 실행 → 결과 저장·반환.
- **저장소**: AETL의 `aetl_metadata.db` 검증 이력은 **PostgreSQL**의 `executions` 또는 `validation_results` 테이블로 이관. Python은 상태 저장 없이 “SQL 생성기”만 담당하면 리스크 최소.

### 4.2 프로파일링 (aetl_profiler, aetl_template_profile)

- **역할**: 테이블/컬럼 통계, 사용자 정의 엑셀 프로파일.
- **이식**: Python API로 “프로파일 실행”을 노출.  
  - 입력: connection 정보(또는 Spring이 발급한 제한된 접근), 테이블명, 샘플 행 수, 템플릿 프로파일 ID 등.  
  - 출력: 통계 JSON 또는 파일 URL.  
- **Spring**: `GET/POST /api/connections/{id}/profile` → Spring이 Connection 정보를 마스킹해 Python에 전달 → Python이 결과 반환 → React에서 표시.  
- **템플릿 프로파일**: `.template_profiles/` 디렉터리 내용을 “파일 업로드 + 메타만 DB 저장” 또는 Python API에서 “프로파일 템플릿 목록/내용” 반환하도록 하여, ETL Platform 메타 DB와 역할 분리 유지.

### 4.3 라인리지 (aetl_lineage, etl_flow_component)

- **역할**: 데이터 흐름 그래프 생성 + React 플로우 UI.
- **이식**:  
  - **그래프 생성**: Job IR(nodes/edges)은 이미 Spring이 보유. “라인리지 그래프 계산”을 Python API로 할 수도 있고, **IR만 파싱해 노드/엣지 목록을 반환하는 것은 Kotlin에서도 가능**하므로, 1차는 **Spring에서 IR → 라인리지 그래프(JSON)** 생성, React에서 `etl_flow_component`와 동일한 React Flow 기반 UI를 ETL Platform 내부에 구현하는 방안 권장.  
  - **고급 분석**(컬럼 레벨 추적, SQL 파싱 기반 등)이 필요하면 그 부분만 Python API로 분리.
- **UI**: `etl_flow_component/frontend` 를 참고해 ETL Platform의 React에서 “라인리지 전용 페이지” 또는 Job 상세의 “라인리지” 탭으로 통합. Streamlit 임베드는 1단계에서 iframe으로 연결해 검증 후, 2단계에서 React로 이전 가능.

### 4.4 DW 설계 (aetl_designer, erd_flow_component)

- **역할**: ERD 설계, React ERD UI.
- **이식**: 라인리지와 유사. **ERD 데이터 생성**을 Python에서 할지 Spring에서 할지 결정.  
  - ERD가 “현재 Connection 스키마 + 사용자 편집”이라면, 스키마는 Spring이 이미 보유하므로 **Spring에서 ERD 메타(테이블/관계) CRUD**를 하고, **UI만** `erd_flow_component` 참고해 React로 구현 가능.  
  - LLM 기반 ERD 제안 등이 있으면 해당 부분만 Python API로 호출.
- **저장**: ERD 정의를 ETL Platform 메타 DB(새 테이블 또는 job/artifact)에 저장하면 일원화에 유리.

### 4.5 산출물 (aetl_export)

- **역할**: Excel/DDL/MERGE 등 문서·스크립트 생성.
- **이식**: Python API `POST /api/python/export/generate` (body: type=excel|ddl|merge, jobId, connectionId, 옵션) → 파일 바이너리 또는 presigned URL.  
  - Spring이 Job IR·Connection 메타를 정리해 Python에 전달 → Python이 파일 생성 → Spring이 스토리지에 올리거나 바이트 반환 → React에서 다운로드 링크 제공.
- **보안**: Connection 비밀은 Spring이 마스킹하거나, DDL/MERGE 생성에만 필요한 메타(테이블명, 컬럼 목록)만 전달.

### 4.6 메타데이터 엔진 (aetl_metadata_engine, etl_metadata_parser, db_schema)

- **역할**: 스키마 수집·캐시, 테이블 정의서(Excel/CSV) 파싱.
- **이식**:  
  - **스키마 조회**: ETL Platform은 이미 `SchemaService`로 JDBC 메타데이터 조회 가능. AETL의 `db_schema` 캐시 전략(.schema_cache.json)은 Spring에서 “스키마 스냅샷 테이블” 또는 캐시 레이어로 대체 가능. **중복 제거**를 위해 스키마 읽기는 Spring 유지, Python은 “정의서 파싱”만 담당하는 편이 단순.  
  - **테이블 정의서 파싱**: `etl_metadata_parser` 만 Python API로 노출. `POST /api/python/metadata/parse-spec` (file upload or URL) → 파싱 결과 JSON. Spring은 업로드 받고 Python에 파일만 전달.

### 4.7 에이전트 (aetl_agent)

- **역할**: LLM 기반 오케스트레이션.
- **이식**: ETL Platform에 이미 AI 에이전트/매핑 추천 등이 있다면, AETL 에이전트의 “플로우”나 “프롬프트 패턴”만 참고해 기존 AI 경로에 통합. 별도 Python API로 “에이전트 한 번 실행”을 노출해 Spring이 호출하는 방식도 가능.

---

## 5. 구현 단계 제안 (리스크 최소화)

### 5.1 1단계: 연동 기반 마련

1. **Python 서비스**: AETL 프로젝트 내에 FastAPI 앱 추가. `db_config` 대신 **요청 바디/헤더로 받은 연결 정보 또는 토큰**만 사용하도록 해, ETL Platform과의 결합도 낮추기.
2. **Spring**: `application.yml`에 `python-service.url` 추가. `RestTemplate`/`WebClient`로 Python API 호출하는 `PythonIntegrationService`(또는 모듈별 서비스) 추가. 타임아웃·재시도 정책 설정.
3. **한 가지 기능만 연동**: 예) “검증 SQL 생성” 또는 “프로파일 실행” 중 하나를 Spring → Python → 결과 반환까지 구현. React에서는 기존 Job/Connection 화면에 “검증” 또는 “프로파일” 버튼 추가.

### 5.2 2단계: 고급 기능 메뉴 통합

1. React에 “고급 분석” 또는 “검증/프로파일/라인리지/DW설계/산출물” 메뉴 추가. 각각 Spring API 호출.
2. 라인리지/DW 설계는 위 4.3·4.4처럼 **1차는 Spring에서 IR/스키마 기반 그래프 생성 + React UI**로 구현하고, 고급 분석만 Python 호출.
3. 산출물(4.5), 메타데이터 파서(4.6) 순으로 Python API 엔드포인트 추가.

### 5.3 3단계: 저장·이력·권한 정리

1. 검증/프로파일 결과를 PostgreSQL `executions` 또는 전용 테이블에 저장. AETL SQLite 의존 제거.
2. Connection/스키마 접근은 Spring 경유만 허용하고, Python에는 최소 정보만 전달하도록 정책 고정.
3. 필요 시 RBAC에서 “고급 분석” 메뉴 권한 분리.

---

## 6. 이식 과정 주의사항 및 호환성 우려

이식 시 **주의해야 할 점**과 **호환성** 관련 우려를 정리합니다. 사전에 검토하면 재작업과 장애를 줄일 수 있습니다.

### 6.1 이식 과정에서 주의해야 할 점

| 구분 | 주의 사항 | 권장 대응 |
|------|-----------|-----------|
| **연결 정보 포맷** | AETL은 `db_config.json` **단일 연결**·파일 경로 기반. ETL Platform은 **Connection 엔티티 다수**·PostgreSQL 저장. | Spring이 Python API 호출 시 **Connection → AETL이 기대하는 형태로 변환**하는 어댑터를 두고, `config_path`/파일 의존을 제거. Python은 요청 바디의 `connection` 객체만 사용하도록 수정. |
| **상태/저장소 이원화** | AETL 모듈이 SQLite(`aetl_metadata.db`, `.aetl_metadata.db`)에 직접 쓰면 **이력이 두 곳**에 쌓임. | **Python은 무상태**로 두고, 검증/프로파일 이력·메타는 **전부 Spring → PostgreSQL**에만 저장. Python API는 “결과 JSON/파일”만 반환. |
| **API 스펙 고정** | AETL 코드를 그대로 HTTP로 노출하면 나중에 요청/응답 형식이 바뀔 때 Spring·React 모두 수정 필요. | Python API를 **OpenAPI(Swagger)로 먼저 정의**하고, Spring은 해당 스펙에 맞춰 호출. 스펙 변경 시 버전 경로(`/v1/...`) 또는 호환 필드로 관리. |
| **대용량·지연** | 프로파일링·산출물 생성은 **대용량 테이블/복잡 Job**에서 수십 초~수 분 소요 가능. | Spring → Python 호출에 **타임아웃**(예: 60~120초) 설정. 필요 시 **비동기** 처리: 요청 즉시 `jobId` 반환, 결과는 **폴링** 또는 **웹소켓/SSE**로 전달. |
| **에러 노출** | Python 예외를 그대로 반환하면 **스택트레이스·내부 경로**가 노출될 수 있음. | Spring에서 Python 응답을 **한 번 감싸서** 사용자용 메시지·코드만 내려주고, 상세 에러는 로그에만 기록. |
| **파일·인코딩** | AETL이 `.template_profiles/`·업로드 파일 등 **로컬 경로**를 쓰는 경우, OS·한글/UTF-8 차이 가능. | Spring이 파일을 넘길 때 **바이너리 스트림(멀티파트)** 또는 **임시 파일 URL**로 전달하고, Python은 “경로”가 아닌 **스트림/URL**만 사용하도록 수정. 인코딩은 요청 헤더 `Content-Type: application/json; charset=utf-8` 등으로 통일. |
| **Python 환경** | AETL의 `requirements.txt`·Python 버전과 ETL Platform 쪽에서 띄우는 Python 서비스 환경이 다르면 **동작 불일치** 가능. | Python 서비스를 **Docker 이미지**로 고정(베이스 이미지·의존성 버전 명시). 로컬 개발 시에도 동일 `Dockerfile` 또는 `venv` + `requirements.txt`로 맞춤. |
| **LLM/API 키** | AETL이 LLM API 키를 자체 설정으로 쓰면 **키가 두 곳**에 존재. | 이식 후 **Spring 또는 공통 Secret(Vault/환경변수)** 에만 두고, Python 서비스는 **Spring이 헤더로 전달**하거나, Python 서버 배포 시 해당 환경변수만 주입. 키 이원화 금지. |

### 6.2 호환성 우려 및 대응

| 구분 | 우려 내용 | 대응 방안 |
|------|-----------|-----------|
| **DB 벤더/다이얼렉트** | AETL이 **Oracle/MySQL 전용** SQL 문법(함수, 타입)을 쓰면 ETL Platform이 지원하는 DB(PostgreSQL, MariaDB 등)와 불일치. | 검증 SQL 생성·DDL/MERGE 생성 시 **dialect 파라미터** 전달(예: `oracle`, `postgresql`, `mariadb`). Python 쪽에서 dialect별 분기 또는 SQL 파서/포맷터 사용. |
| **IR/데이터 형식** | AETL이 기대하는 “Job/테이블 정의” 구조와 ETL Platform의 **JobIR·Connection DTO**가 다름. | Spring에 **어댑터 레이어** 도입: JobIR·Connection을 AETL API가 기대하는 JSON 형태로 변환 후 전달. 반대로 Python 응답을 ETL Platform 도메인 모델로 변환. |
| **React/React Flow 버전** | `etl_flow_component`·`erd_flow_component`의 **React/React Flow 버전**이 ETL Platform과 다르면, 컴포넌트를 그대로 가져와 쓸 때 **충돌·번들 중복** 가능. | (1) **iframe 격리**: 기존 빌드(`frontend/build`)를 그대로 iframe으로만 넣어 버전 충돌 회피. (2) **재구현**: ETL Platform React/React Flow 버전에 맞춰 UI만 재작성하고, 데이터 포맷만 AETL과 맞춤. (3) **버전 통일**: 가능하면 ETL Platform 쪽을 AETL 컴포넌트 버전에 맞추거나, 그 반대. 단, 의존성 업그레이드 리스크는 검토 필요. |
| **스키마 캐시 불일치** | AETL의 `.schema_cache.json`과 ETL Platform의 **SchemaService** 결과(스키마/컬럼 목록)가 다를 수 있음. | Python에 스키마를 넘길 때 **“Spring이 넘겨준 스냅샷”을 단일 소스**로 사용. Python 쪽에서는 `db_schema`/캐시를 쓰지 않고, **요청 바디의 스키마 JSON**만 사용하도록 변경. |
| **인증/테넌트** | AETL Streamlit 앱은 **별도 세션·인증**이 없을 수 있음. iframe/링크로 넣으면 **ETL Platform 로그인과 무관**하게 접근 가능한 구멍 생김. | Spring이 **프록시**로 Python/Streamlit 요청을 감싸고, **동일 JWT/세션 검증** 후에만 프록시 통과. 또는 Python API만 쓰고 Streamlit UI는 내부망에서만 쓰거나 제거. |
| **문자열/날짜/숫자 형식** | 검증 결과·프로파일 통계에서 **숫자 소수점·날짜 포맷·null 표기**가 AETL과 ETL Platform에서 다르면 UI에서 혼란. | API 스펙에 **날짜는 ISO 8601**, **숫자는 JSON number**, **null은 JSON null**로 고정. 한글/특수문자는 UTF-8로 통일. |

### 6.3 체크리스트 (이식 전·후)

- [ ] **이식 전**: Python API 스펙(OpenAPI) 초안 작성; Connection/IR → AETL 포맷 변환 규칙 문서화; Python 서비스 Docker 이미지로 실행 가능한지 확인.
- [ ] **이식 후**: Python 장애 시 Spring/React가 “고급 기능 일시 불가”만 표시하고 기본 ETL은 정상 동작하는지 확인; Connection 비밀·스키마가 Python 로그/응답에 남지 않는지 점검; 타임아웃·비동기 경로 테스트.

---

## 7. 참고 문서

- **설계/로드맵**: `documents/architecture/` (AETL 쪽), ETL Platform의 `Plan_ETL.md`
- **현재 구현 가능성**: ETL Platform의 `구현계획기능.md`
- **실행/API 이력**: ETL Platform의 `WORK_HISTORY.md`, `CLAUDE.md`

---

## 8. 요약

| 항목 | 내용 |
|------|------|
| **AETL 역할** | 검증, 프로파일, 라인리지, DW 설계, 산출물, 메타엔진, 에이전트 등 “고급 분석·문서화” |
| **이식 추천** | Spring 오케스트레이터 + Python REST API. React는 Spring만 호출. |
| **리스크 최소화** | Python은 “실행·메타 저장”이 아닌 “생성·분석” 위주로 한정. DB/이력은 Spring·PostgreSQL로 일원화. |
| **단계** | 1단계: Python API + Spring 연동 + 한 가지 기능. 2단계: 고급 기능 메뉴·UI. 3단계: 저장·권한 정리. |

이 문서를 다른 Agent나 신규 참여자가 참고해 **폴더/파일 경로만으로 AETL 모듈 역할**을 파악하고, **ETL Platform에 이식할 때의 방법과 순서**를 일관되게 적용할 수 있습니다.


-------------------------------------------------
AETL 기능 선별 결과
❌ 이식 불필요 — ETL Platform에 이미 구현됨
AETL 기능	ETL Platform 대응	이유
aetl_executor.py SQL 실행	SqlPushdownAdapter.kt	완전 대체. JVM/JDBC 방식이 오히려 안정적
db_schema.py 스키마 조회·캐시	SchemaService.kt + config.columns 캐시	동일 기능, ETL Platform이 더 정교함 (AES 암호화, 다중 Connection)
etl_flow_component/ React 리니지 UI	React Flow v12 (이미 사용 중)	버전 통일 상태. 별도 빌드 필요 없음
db_config.json 단일 연결	Connection 엔티티 (다중, DB 저장)	ETL Platform이 상위 호환
aetl_store.py SQLite 저장	PostgreSQL + Spring JPA	이식 대상에서 제외. 결과 저장만 Spring으로
aetl_metadata_engine.py 스키마 캐시	config.columns + SchemaService	역할 중복. Spring 캐시로 통합
⚠️ 부분 이식 — 핵심 로직만 추출, 방식 변경 필요
AETL 기능	이식 범위	변경 사항
aetl_llm.py LLM fallback 체인	Gemini/OpenAI fallback 전략 참고	AI Agent 패널이 이미 4개 프로바이더 지원. 서버사이드 fallback 필요 시만
aetl_lineage.py SQL 파싱 리니지	sqlglot AST 파싱 로직 (컬럼 레벨)	Job IR의 nodes/edges로 기본 리니지는 이미 가능. 컬럼 레벨 추적만 Python API로
etl_metadata_parser.py 정의서 파싱	Excel/CSV 파싱 + 한글 헤더 감지	UI는 React로 재구현, 파싱 로직만 FastAPI 노출
✅ 실제 이식 대상 — ETL Platform에 없는 순수 신규 기능
AETL 기능	이식 방법	구현 위치
etl_sql_generator.py 검증 SQL 생성	FastAPI → Spring 호출	T_VALIDATE 노드 실행 로직
aetl_profiler.py 데이터 프로파일링	FastAPI → Spring 호출	T_PROFILE 노드 + 별도 프로파일 페이지
aetl_export.py 매핑정의서/DDL/MERGE 산출물	FastAPI → Spring 호출	Job Designer 내 "산출물" 버튼
aetl_designer.py Star Schema DW 설계	FastAPI + React ERD UI 재구현	별도 DW 설계 페이지
aetl_agent.py Tool-calling 에이전트	AI Agent 패널 확장 또는 서버사이드	기존 AiAgentPanel에 Tool 추가
우선순위 제안

1순위 (즉시 가능, 독립적)
  → 검증 SQL 생성 (T_VALIDATE)   : 규칙 기반 로직 완성, LLM 보조
  → 데이터 프로파일링 (T_PROFILE) : 통계 쿼리 단순, UI 명확

2순위 (프로파일링 이후)
  → 매핑정의서/DDL 산출물         : Export 버튼 하나로 바로 가치 발생
  → 컬럼 레벨 리니지 (T_LINEAGE) : sqlglot 로직 그대로, 시각화만 추가

3순위 (장기)
  → DW 설계 (ERD)               : 별도 페이지, 공수 큼
  → Tool-calling 에이전트        : 기존 AI Agent 패널 확장으로 점진적 통합
어느 기능부터 시작할지 정해주시면 FastAPI 서비스 구성부터 Spring 연동, React UI까지 순서대로 작업할 수 있습니다.