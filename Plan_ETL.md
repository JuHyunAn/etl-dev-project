# Plan_ETL (Talend/TOS 벤치마킹 ETL 플랫폼 구축안)

## 0) 결론 요약 (현실성 판단)

- **“TOS(=Talend Open Studio) 수준의 전 기능을 1:1로 동일 구현”은 가능은 하지만, 일반적으로 수년/대규모 인력이 필요한 규모**입니다.
  - 본 PDF(IQDesigner v6.0)는 “DI Designer(IDE) + 컴포넌트 팔레트 + Repository/Metadata/Context + Java 코드 생성/실행 + 빌드/배포 + 로그/디버그”의 전형적인 Talend 계열 구조를 보여줍니다.
  - 특히 **800+ 컴포넌트, 방대한 커넥터/모듈(JAR), 다양한 실행/디버깅/빌드 옵션**을 전부 구현하려면 “플랫폼/에코시스템”을 새로 만드는 수준입니다.

- 따라서 **전 기능을 “동시 구현”이 아니라 “핵심 런타임 + 필수 컴포넌트 + 플러그인 SDK + 운영(스케줄/모니터링)”을 먼저 만들고, 컴포넌트/커넥터를 단계적으로 확장**하는 전략이 가장 현실적입니다.

- **백엔드(실행 엔진) 언어 추천: JVM(특히 Java 또는 Kotlin) 1순위**
  - Talend 계열이 “Job → Java 코드 생성 → JVM 실행” 패턴이라, 안정성/성숙한 JDBC 생태계/운영 관점에서 유리합니다.
  - SaaS로 갈 경우에도 “런타임 워커(Worker)”를 컨테이너로 분리해 JVM으로 운영하면 **성능/메모리/모듈 의존성/JDBC 드라이버 호환성** 관리가 비교적 안정적입니다.
  - **Python은 LLM/메타데이터/보조 서비스에는 매우 적합**하지만, “Talend급 런타임 + 커넥터/드라이버 운영”을 플랫폼으로 장기 운영할 때는 JVM 대비 의존성/성능/배포 일관성에서 불리해질 수 있습니다(물론 불가능은 아님).

- **UI는 React 기반 Web Designer가 적합**합니다. 다만 “Eclipse IDE”를 그대로 Web에 옮기려 하지 말고, **웹에 맞는 UX(캔버스 + 속성 패널 + 리포지토리 트리 + 실행/로그 뷰)**로 재해석하는 게 중요합니다.

---

## 0-1) 최종 목표(제품 방향)

- **① 현재 AETL 기능들을 “ETL 툴 내부의 옵션/고급 기능”으로 통합**
  - 현재 레포(AETL)의 LLM 기반 검증 SQL 생성, 프로파일링, 메타데이터 파서, DW 설계, 라인리지, 산출물(Excel/DDL/MERGE) 생성 기능을 **새 ETL 플랫폼의 메뉴/옵션(고급 분석/검증/문서화 기능)**으로 통합합니다.
- **② 기본 ETL 기능 — 컴포넌트 Drag&Drop 기반 ETL 로직 실행**
  - Talend/TOS 스타일의 **팔레트 컴포넌트 + 캔버스(노드/엣지) + 속성 패널**을 제공하고, Drag&Drop으로 구성한 Job을 실행 가능한 **표준 DAG/IR**로 저장하여 런타임에서 해석/실행합니다.
- **③ 외부 스케줄러/오케스트레이션과의 연동**
  - 내부 스케줄링 기능 외에도, Airflow/Control-M 등 **외부 스케줄러와 연동 가능한 “스케줄링 커넥터/컴포넌트”**를 제공하여, 기업 환경에서 기존 배치 체계에 쉽게 편입될 수 있도록 합니다.

---

## 1) PDF(IQDesigner v6.0)에서 확인한 핵심 구성요소 (TOS 계열 공통)

### 1.1 화면/영역(IDE) 구성

- **Repository 영역**: Job/Folder/Context/Metadata/Documentation/Recycle bin 등 자산 관리, Import/Export
- **Palette 영역**: 컴포넌트 그룹(예: Databases/File/Processing/Orchestration/Logs&Error/Custom Code/System 등)
- **Design 영역**: Job 설계(Drag&Drop), 연결(메인/룩업/리젝트/트리거), Code 탭(Java 코드 뷰)
- **Configuration 영역**: Job/Context/Component/Run/Modules/Problems 등 설정
- **Run/Debug**: Basic Run(전체 플로우), Debug Run(1 row 단위 플로우 확인)

### 1.2 Repository / 자산관리 기능

- **Job 생성/버전 관리(버전 업/이력), 폴더 관리, Copy/Duplicate**
- **Build Job**: 실행 아카이브(zip) 생성, Context 포함 옵션
- **Import/Export items/projects**
- **HTML 문서 생성(Generate Doc As HTML)**

### 1.3 Context(환경변수/파라미터) 기능

- Context group 생성/편집/읽기, Default 값/프롬프트/로드 순서
- Job/Component에서 Context 참조 및 Build 시 Context 포함

### 1.4 Metadata / DB Connection & Schema 동기화

- DB Connection 생성(필요 모듈 다운로드/등록)
- **Retrieve Schema**: DB 테이블/스키마 동기화(필터 지원)
- **Edit Schema**: 도구 내부 스키마 편집 + DB 스키마 재동기화

### 1.5 Component 예시(일부)와 실행 패턴

- **Databases(Oracle 예시)**: Input/Output/Connection/Commit/Rollback/Row(PreparedStatement)/ParseRecordSet
- **File**: delimited input/output, exist, row count
- **Processing**: Aggregate, ConvertType, Map, Join, FilterRow, Replace, SortRow
- **Orchestration/System**: PreJob/PostJob, Replicate, Sleep, RunJob, System command
- **Logs&Error**: LogCatcher, Die, LogRow

> 요약: “컴포넌트 기반 ETL + 코드 생성 실행 + 운영/디버그 + 자산/메타데이터 관리”가 제품의 본질입니다.

---

## 2) (질문 1) “얼마나 구현 가능한가?”에 대한 판단

### 2.1 기술적으로 가능한가?

- **가능**합니다. 다만 핵심은 “개별 기능”이 아니라 **플랫폼 전체(Designer + Repository + Runtime + Component SDK + 운영/보안/배포/관측성)** 입니다.
- PDF에서만 보이는 기능도 이미 작은 플랫폼이며, 실제 Talend/TOS급은 여기에 더해:
  - 훨씬 많은 커넥터(다양한 RDB/NoSQL/파일/클라우드/메시징)
  - 데이터 품질/프로파일링/CDC/대용량 처리(Spark 등)
  - 팀 협업/권한/RBAC/감사/배포 파이프라인
  - 운영 모니터링/알림/리트라이/체크포인트/실행 이력 관리
  - 플러그인 생태계/마켓/버전 호환성
    등이 뒤따릅니다.

### 2.2 “전 기능 구현”의 현실적인 난이도(리스크)

- **컴포넌트 수(수백~수천)와 커넥터 다양성**이 가장 큰 비용 요인입니다.
- “UI/Designer”보다 **Runtime(실행 엔진) + 커넥터 안정화 + 운영(스케줄/모니터링/재시도/장애 격리)**에서 난이도가 급증합니다.
- “동일 UX/동일 기능”을 목표로 하면, 기능이 늘수록 테스트 매트릭스(DB/버전/드라이버/OS/인코딩/성능)가 폭발합니다.

### 2.3 성공 확률을 높이는 현실적인 전략(권장)

- **MVP(필수 기능) → 플러그인 SDK → 커넥터/컴포넌트 확장**의 단계 전략
- “Talend처럼 자바코드 생성”을 그대로 따라가기보다, SaaS에 맞춰:
  - **표준화된 DAG/IR(중간표현)**로 Job을 저장하고
  - Worker가 IR을 해석/실행(또는 코드 생성/컴파일)하는 구조로 분리
  - 컴포넌트는 “플러그인(스펙+실행기)”로 추가
    를 권장합니다.

---

## 3) (질문 1) 구현한다면 “백엔드 언어” 무엇이 안정적인가?

### 3.1 추천 1순위: Kotlin(JVM)

- **장점**
  - **JDBC/드라이버/트랜잭션/스레드/메모리 운영 성숙도**가 높음
  - Talend 계열 패턴과 궁합이 좋음(코드 생성/실행, 모듈(JAR) 관리)
  - 대규모 장기 운영(Worker 다수, 멀티테넌트)에서 예측 가능성이 큼
  - Spark/Flink 같은 빅데이터 엔진 연계도 자연스러움
- **권장 조합**
  - **Control Plane(API/권한/메타데이터)**: Kotlin + Spring Boot
  - **Execution Plane(Worker/Runner)**: Kotlin 런타임(컨테이너) + 플러그인 로더

### 3.2 대안: Go(컨트롤 플레인) + JVM(워커)

- API/오케스트레이션은 Go로도 매우 안정적이지만, **ETL 커넥터/드라이버/변환 생태계는 JVM이 더 유리**한 경우가 많습니다.
- 결론적으로 “전체 Go 단일 언어”보다 **워커는 JVM 유지**가 현실적입니다.

### 3.3 Python은 어디에 쓰는 게 좋은가?

- 이미 보유한 AETL(LLM/검증/메타데이터 자동화) 역량을 살려:
  - **LLM 기반 맵핑 추천, SQL 분석/라인리지, 프로파일링/검증 리포트**
  - 디자이너에서 생성된 Job IR에 대한 **정적 분석/안전 검사**
  - 템플릿/산출물 생성(Excel/DDL/MERGE)
    에는 Python이 매우 강점입니다.
- 단, “TOS급 실행 엔진”을 Python으로 단독 구현하면 **드라이버/배포/성능/장기 운영**에서 JVM 대비 부담이 커질 수 있어, 런타임은 JVM 권장을 유지합니다.

---

## 4) (질문 2) 설치형이 아닌 Web 서비스(SaaS)로 갈 때 UI/아키텍처 판단

### 4.1 React 기반 Web Designer는 적합

- PDF의 Eclipse UI 패턴을 웹으로 옮길 때 핵심은:
  - **Canvas(그래프) + Repository 트리 + 속성 패널 + 실행/로그 뷰** 4종 레이아웃
  - 컴포넌트 검색/필터(팔레트), 드래그 앤 드롭, 연결(메인/룩업/리젝트/트리거)
  - 스키마 편집/매핑(tMap 유사) 편집기
  - 실행(실시간 로그 스트리밍), 디버그(샘플 row 관찰)

### 4.2 SaaS에서 반드시 고려해야 하는 것(설치형 대비 추가 요구)

- **멀티테넌시**: 테넌트/프로젝트 격리, 리소스 쿼터(동시 실행, CPU/RAM)
- **보안/비밀관리**: DB 패스워드/키는 Vault/Secret Manager로 관리, 감사 로그
- **실행 격리**: 각 Job 실행은 컨테이너/네임스페이스로 격리(장애/메모리 누수 전파 방지)
- **관측성**: 실행 이력, 단계별 메트릭, 로그, 알림, 재시도 정책
- **배포 모델**: Control Plane + Worker Plane 분리, Worker 오토스케일

### 4.3 권장 SaaS 구조(상위 아키텍처)

- **Web UI(React)**
  - Job Designer(그래프/매핑), Repository/Metadata/Context 관리
- **API 서버(Control Plane)**
  - 인증/인가(RBAC), 프로젝트/자산 버전, Job 정의(IR) 저장
  - 실행 요청/스케줄 등록/이력 조회
- **Scheduler**
  - Cron 기반 스케줄 + 이벤트 트리거(추후 확장)
- **Worker/Runner(Execution Plane)**
  - Job IR을 받아 실행(커넥터/변환/로깅)
  - 플러그인(컴포넌트) 로딩
- **Metadata Store**
  - Job/컴포넌트/스키마/컨텍스트/실행이력/로그 인덱스

---

## 5) “IQDesigner/TOS 기능”을 SaaS에서 구현할 때의 설계 포인트(벤치마킹 항목 → 구현 항목)

### 5.1 Repository/Version/Import-Export

- **Project/Folder/Job**: 트리 구조 + 검색 + 태그/필터
- **버전 관리**: semver 유사(0.1/0.2 또는 1.0…), 변경 이력/롤백
- **Export/Import**: zip(=아카이브)로 Job/Context/Metadata를 패키징
- **Doc 생성**: Job을 HTML/Markdown으로 내보내기(그래프 + 설정 + 스키마)

### 5.2 Context(파라미터) & 환경 분리

- Context group(DEV/QA/PROD), 기본값/오버라이드, 실행 시 주입
- SaaS에서는 “Context 값”이 곧 “비밀정보”가 되므로:
  - secret 타입(마스킹/조회 제한/감사 로그)
  - 실행 시 Worker에 최소권한으로 전달

### 5.3 Metadata / Schema 동기화

- DB 연결(드라이버/버전/SSL), 연결 테스트
- 테이블 스키마 동기화(필터, 스키마/오너)
- 도구 내부 스키마 편집(물리 DB 변경과 분리)

### 5.4 컴포넌트(팔레트)와 플러그인 SDK

- PDF의 팔레트 그룹은 SaaS에서도 그대로 유효(데이터베이스/파일/프로세싱/오케스트레이션/로그/커스텀코드)
- 핵심은 “컴포넌트 추가/업데이트”가 플랫폼 확장성의 생명줄이므로:
  - **컴포넌트 스펙(입력/출력 스키마, 설정 UI 스키마, 실행 로직, 에러/리젝트 포트)** 정의
  - “Row/Trigger connection” 같은 링크 타입을 표준화

### 5.5 실행/디버그

- Basic Run: 전체 플로우 실행 + 단계별 로깅
- Debug Run: 1-row 혹은 샘플 기반 관찰(단, 실제 DB에 쓰는 Output 컴포넌트는 안전장치 필요)
- 통계/로그 저장: 파일/DB/로그 스토리지(예: OpenSearch 등)로 분리

---

## 6) 제안 기술 스택(권장안)

### 6.1 Frontend (Web UI)

- **React + TypeScript**
- 그래프 캔버스: React Flow 계열(노드/엣지/포트), 매핑 편집기 별도 구현
- 상태: Zustand/Redux 중 택1(대규모 캔버스 편집은 상태 관리 설계가 중요)

### 6.2 Backend (Control Plane)

- **Java/Kotlin + Spring Boot**
- API: REST(+ 추후 gRPC), WebSocket/SSE로 로그 스트리밍
- Auth: OIDC(기업 SSO), RBAC
- 저장소: PostgreSQL(메타데이터), S3 호환 오브젝트 스토리지(아카이브/아티팩트)

### 6.3 Execution Plane (Worker)

- **Java/Kotlin 런타임 컨테이너** + 플러그인 로더
- 커넥터: JDBC 우선(Oracle/MariaDB/PostgreSQL) + 파일 IO
- 실행 격리: Kubernetes Job(또는 ECS/Fargate) 기반

### 6.4 Observability / Ops

- 로그: 중앙 수집(예: OpenSearch/ELK), 실행 이력/메트릭: Prometheus/Grafana
- 알림: Slack/Email/Webhook

### 6.5 기존 AETL(현재 레포)와의 접점

- Python 기반 모듈(AETL)은:
  - SQL/라인리지 분석, 규칙 기반 검증, 문서/산출물 생성
  - “컴포넌트/Job IR 정적 검사” 및 “자동 매핑 추천”
    로 자연스럽게 흡수/연계 가능

---

## 7) 구현 로드맵(작업 예정 내용)

> 목표: “TOS 전 기능”을 한 번에 만들지 않고, **TOS 핵심 패턴을 만족하는 SaaS ETL 플랫폼의 뼈대**를 먼저 구축한 뒤 컴포넌트를 확장합니다.

### Phase 0 — 요구정의/IR/아키텍처 확정 (짧게, 하지만 필수)

- IQDesigner/TOS 벤치마크 기능을 “필수/확장”으로 분류
- **Job IR(중간표현) 스키마 설계**: 노드/포트/엣지/스키마/에러포트/리젝트포트/트리거
- 컴포넌트 스펙(설정 UI 스키마 포함)과 플러그인 패키징 정책 확정

### Phase 1 — MVP Designer + Repository (Web UI/Control Plane)

- Project/Folder/Job CRUD + 검색
- Canvas 기반 Job Designer(노드/엣지/연결타입)
- Context group/변수 관리
- DB Connection 관리 + Retrieve Schema(동기화) + 스키마 뷰어
- Export/Import(zip) 1차

### Phase 2 — MVP Runtime/Worker (실제 ETL 가능 상태)

- Worker 실행 모델(컨테이너) + 실행 요청/상태/로그 스트리밍
- 필수 컴포넌트 세트(우선순위)
  - **Input**: JDBC Input(SELECT), File Input(delimited)
  - **Transform**: Map(컬럼 매핑/표현식), Filter, Join, Aggregate, Sort, ConvertType, Replace
  - **Output**: JDBC Output(Insert/Upsert/Update/Delete), File Output
  - **Orchestration**: Pre/Post, RunJob(서브잡), Sleep, Trigger(OnOk/OnError/RunIf)
  - **Logs/Error**: LogRow, Die, Reject 포트 기본 제공
- 실행 이력/재시도/타임아웃/리소스 제한

### Phase 3 — 운영/스케줄/권한/품질(상용화 필수)

- 스케줄러(Cron) + 알림 + 실패 재처리
- RBAC/감사 로그
- 데이터 품질/프로파일링(룰 기반 + 샘플 기반), 리젝트 처리 표준화
- HTML/Markdown 문서 생성 고도화

### Phase 4 — 컴포넌트 확장/에코시스템

- 추가 DB/클라우드 커넥터, CDC, 대용량 처리(Spark 연계) 등
- 플러그인 마켓(내부) + 버전 호환성 정책
- 템플릿(표준 Job 패턴) 제공

---

## 8) 핵심 리스크와 완화책

### 8.1 “컴포넌트 폭발” 리스크

- **완화**: 컴포넌트 SDK/스펙을 먼저 만들고, 코어 컴포넌트만 내장 + 나머지는 플러그인으로 확장

### 8.2 드라이버/DB버전/인코딩 호환성

- **완화**: JDBC 중심 + 공식 드라이버 버전 매트릭스 관리 + 컨테이너 이미지로 런타임 고정

### 8.3 SaaS 보안(Secret)과 멀티테넌시

- **완화**: Secret Manager/Vault 도입, 암호화 저장, 실행 시 최소권한 주입, 네임스페이스 격리

### 8.4 디버그 기능(1-row 디버그)의 안전성

- **완화**: Debug 모드는 “샘플링 + Output 보호(드라이런/트랜잭션 롤백/스테이징 테이블)” 정책 필요

### 8.5 라이선스/지식재산권(IP) 이슈

- “Talend 오픈소스 기반 내재화” 벤치마킹은 가능하지만,
  - **코드/리소스/문서의 직접 복제는 금지**
  - 사용하려는 오픈소스(예: Talend 계열, Eclipse 플러그인, 컴포넌트)의 **라이선스(EPL/GPL 등) 준수**가 필수
- **완화**: 아키텍처/UX는 참고하되 구현은 독자적으로, OSS 채택 시 라이선스 검토 프로세스 포함

---

## 9) 다음 단계(리뷰 후 바로 착수할 작업)

- 본 문서 기준으로 **MVP 범위(Phase 1~2) 확정**
  - “반드시 필요한 컴포넌트 20~40개”를 우선 선정(현재 PDF에 나온 유형 중심)
- **Job IR 스키마/컴포넌트 스펙** 초안 작성
- React Designer(캔버스) PoC + Worker 실행 PoC(컨테이너)로 “실제 추출/변환/적재” 1개 end-to-end 성공

---

## 10) 장기 방향: Talend/IQ 스타일 백엔드 + React Web UI

> 이 섹션은 **다른 에이전트/향후 세션에서도 공통 레퍼런스로 사용하는 “설계 원칙”**입니다.

### 10.1 백엔드 방향성 — Talend/IQ와 동일한 축

- **전체 아키텍처 축은 Talend/TOS·InnoQuartz(IQDesigner)와 동일하게 가져간다.**
  - **핵심 개념**: Project/Job/Context/Metadata/Component Palette/Repository/Execution/Build/Run/Debug
  - **실행 모델**: Job → IR(또는 코드) → Worker(Runtime)에서 실행
    - Talend는 “Java 코드 생성 + JVM 실행”이라면,
    - AETL은 **“표준화된 Job IR + 플러그인 기반 Runtime(초기에는 Python, 장기적으로 JVM 워커도 수용)”** 구조를 지향.
- **Runtime 레이어는 언어에 종속되지 않도록 추상화한다.**
  - Job IR / Component Spec / 연결(Row & Trigger) / Context / 실행 로그 포맷을 **언어 중립적인 스키마(JSON/Protobuf)**로 정의.
  - 현재는 Python 기반 Worker(실행기)를 우선 구현하되, **동일 IR을 해석하는 JVM Worker를 나중에 추가할 수 있는 구조**를 유지한다.
  - 이렇게 하면 **단기에는 Python 자산을 최대 활용**하면서도, **장기적으로 Talend와 유사한 JVM 생태계로 확장**할 수 있다.

### 10.2 프런트엔드 방향성 — Web(React) 고정

- **모든 핵심 ETL 설계/실행 UX는 웹 기반 React로 통일**한다.
  - Canvas 기반 Job Designer(노드/엣지/팔레트/속성 패널/실행 버튼/로그 뷰)
  - Repository/Project/Folder/Job/Context/Metadata 관리 화면
  - 실행 이력/모니터링/스케줄 관리(추가 예정)
- 기존 Streamlit UI는:
  - **관리 콘솔/진단 및 고급 분석(프로파일링, 라인리지 뷰, DW 설계, 산출물 다운로드)** 용으로 활용하거나,
  - 점진적으로 React 기반 Admin/Console로 이관하는 중간 단계로 사용한다.

### 10.3 “Talend식 백엔드 + React Web”을 동시에 만족하는 설계 원칙

- **(1) Talend/IQ와 동일한 도메인 모델을 유지**
  - Job/Context/Metadata/Component/Connection/Palette/Run/Debug 등 명칭과 책임을 Talend 계열과 최대한 맞춘다.
  - IQDesigner 매뉴얼의 Repository/Palette/Connections/Run 개념을 1:1로 매핑하되, 구현체는 우리 IR/Runtime에 맞게 재해석한다.

- **(2) Web-First UX**
  - Eclipse IDE 방식이 아니라 **React Web에 최적화된 UX**를 설계한다.
  - 화면 6분할(Repository/Palette/Design/Configuration/Outline/Run) 구조는 유지하되, 반응형/브라우저 성능/협업 기능(동시 편집 등)을 고려한다.

- **(3) Runtime Pluggability**
  - Job IR을 기준으로:
    - `engine_type="python"` → Python Worker
    - `engine_type="jvm"` → 향후 JVM Worker
    - 로 라우팅 가능하도록 설계한다.
  - 컴포넌트 스펙에 “지원 엔진 목록(engine_targets)”을 두어, 특정 컴포넌트가 Python/JVM 중 어디에서 실행 가능한지 명시한다.

- **(4) AETL 자산의 일관된 통합**
  - 현재 Python 모듈들(LLM, 프로파일러, 라인리지, DW 설계, 산출물 등)은:
    - React UI에서는 **“고급 기능 메뉴/옵션”**으로 노출하고,
    - 백엔드에서는 **Job IR 분석기/도우미(예: 자동 맵핑, 검증 SQL 자동 생성, 품질 진단)**로 통합한다.

- **(5) 장기 내재화/유지보수를 위한 문서화**
  - 본 `Plan_ETL.md`는:
    - Talend/IQ 벤치마킹 근거
    - Web(React) + Runtime(초기 Python, 장기 JVM 가능) 방향성
    - IR/Component/Runtime 추상화 원칙
      를 **항상 최신 상태로 유지하는 “설계 기준 문서”**로 사용한다.
  - 다른 Agent/개발자가 수정할 때도 이 문서를 먼저 읽고 아키텍처를 따르도록 한다.