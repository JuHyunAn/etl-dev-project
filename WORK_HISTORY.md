# ETL Platform - Work History & Reference

> 최종 업데이트: 2026-03-15

---

## 1. 프로젝트 개요

Talend Open Studio(TOS) 방식의 비주얼 ETL 툴을 웹 기반으로 구현한 플랫폼.
DAG(방향 비순환 그래프) 캔버스에서 컴포넌트를 드래그&드롭으로 연결하고,
**IR(Intermediate Representation) → SQL Compiler → 대상 DB 실행** 방식으로 동작.

### 핵심 아키텍처 설계 원칙
- **UI 레퍼런스**: Talend Open Studio 컴포넌트 체계, AWS Glue Studio 시각 스타일
- **실행 엔진**: SQL Pushdown(동일 DB) + Fetch-and-Process(이기종 DB)
- **AI 보조**: 4개 LLM Provider 직접 연동(Claude/OpenAI/Gemini/Grok)
- **상태관리**: Zustand(프론트), Spring JPA(백엔드), PostgreSQL 메타 DB

---

## 2. 환경 설정 (필수)

### 2-1. Java 실행 환경

시스템 Java가 버전 8이므로 직접 사용 불가. VS Code 확장의 Java 21을 사용.

```bash
export JAVA_HOME="$HOME/.vscode/extensions/redhat.java-1.53.0-win32-x64/jre/21.0.10-win32-x86_64"
export PATH="$JAVA_HOME/bin:$PATH"
```

### 2-2. Gradle

프로젝트에 `gradlew` wrapper 포함. JAVA_HOME 지정 후 실행.

```bash
./gradlew.bat bootRun --no-daemon
```

### 2-3. PostgreSQL (메타 DB)

로컬에 PostgreSQL 18이 포트 5432로 실행 중이므로 Docker 컨테이너는 5433 사용.

```bash
# Docker 컨테이너 실행 (최초 1회)
docker run -d --name etl-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=etl_platform \
  -p 5433:5432 \
  postgres:16

# 이미 생성된 경우
docker start etl-postgres
```

- **메타 DB**: `localhost:5433/etl_platform` (ETL 플랫폼 설정, 커넥션, 잡 정보 저장)
- **대상 DB**: `localhost:5432/postgres` (실제 ETL 처리 대상 데이터베이스)

### 2-4. AI Agent 환경 변수 (.env)

`frontend/.env` 파일에 사용할 AI 공급자의 API 키를 설정.

```env
VITE_CLAUDE_API_KEY=sk-ant-api03-...
VITE_OPENAI_API_KEY=sk-proj-...
VITE_GEMINI_API_KEY=AIzaSy...
VITE_GROK_API_KEY=xai-...
VITE_AI_DEFAULT_PROVIDER=gemini
```

> `frontend/.env.example` 참고. `.env`는 git에 커밋하지 않을 것.
> **Grok**: `api.x.ai`는 브라우저 직접 호출 시 CORS 차단. Vite 프록시(`/xai-proxy`)를 통해 우회. vite.config.ts 변경 후 반드시 서버 재시작 필요.

### 2-5. 서버 기동 명령어

```bash
# 백엔드 (Spring Boot, 포트 8080)
cd /c/Users/dkswn/OneDrive/바탕\ 화면/etl-dev-project/backend
export JAVA_HOME="$HOME/.vscode/extensions/redhat.java-1.53.0-win32-x64/jre/21.0.10-win32-x86_64"
export PATH="$JAVA_HOME/bin:$PATH"
./gradlew.bat bootRun --no-daemon

# 프론트엔드 (Vite, 포트 3001)
cd /c/Users/dkswn/OneDrive/바탕\ 화면/etl-dev-project/frontend
npm run dev
```

> vite.config.ts `port: 3001`. 브라우저 접속: http://localhost:3001
> 백엔드 CORS 허용 origin: `http://localhost:3001` (SecurityConfig.kt)

---

## 3. 프로젝트 디렉터리 구조

```
etl-dev-project/
├── backend/                          # Spring Boot (Kotlin)
│   ├── build.gradle.kts
│   └── src/main/
│       ├── kotlin/com/platform/etl/
│       │   ├── EtlPlatformApplication.kt
│       │   ├── auth/                          # 인증 시스템
│       │   │   ├── AuthController.kt          # /api/auth/* (register/login/refresh/logout)
│       │   │   ├── JwtService.kt              # JWT 발급/검증
│       │   │   ├── JwtAuthFilter.kt           # JWT 필터
│       │   │   ├── OAuthUserPrincipal.kt      # OAuth2 유저 프린시팔
│       │   │   ├── CustomOAuth2UserService.kt # OAuth2 유저 서비스
│       │   │   └── OAuth2SuccessHandler.kt    # OAuth2 성공 핸들러
│       │   ├── config/
│       │   │   ├── SecurityConfig.kt          # Spring Security + CORS 설정
│       │   │   ├── QuartzConfig.kt            # SpringBeanJobFactory + SchedulerFactoryBean
│       │   │   └── GlobalExceptionHandler.kt
│       │   ├── domain/
│       │   │   ├── connection/                # DB 커넥션 CRUD + AES 암호화
│       │   │   │   ├── Connection.kt
│       │   │   │   ├── ConnectionController.kt
│       │   │   │   ├── ConnectionDto.kt
│       │   │   │   ├── ConnectionRepository.kt
│       │   │   │   └── ConnectionService.kt
│       │   │   ├── project/                   # 프로젝트 CRUD
│       │   │   ├── job/                       # 잡 CRUD + Publish
│       │   │   └── user/                      # User, RefreshToken 엔티티/리포지토리
│       │   ├── execution/                     # 실행 엔진
│       │   │   ├── ExecutionController.kt
│       │   │   ├── ExecutionEngine.kt         # 인터페이스
│       │   │   ├── ExecutionModels.kt
│       │   │   ├── ExecutionService.kt        # 실행 오케스트레이션
│       │   │   ├── ExecutionRouter.kt         # 동일 DB vs 이기종 DB 라우팅
│       │   │   ├── ExecutionLockService.kt    # Job 동시 실행 방지
│       │   │   ├── SqlPushdownAdapter.kt      # SQL Pushdown 실행기 (동일 DB)
│       │   │   ├── SqlPushdownCompiler.kt     # CTE 기반 SQL 컴파일러
│       │   │   ├── FetchAndProcessExecutor.kt # 이기종 DB 실행기
│       │   │   ├── TargetWriter.kt            # UPSERT 방언 분기 (PG/Oracle/MariaDB)
│       │   │   ├── WatermarkService.kt        # 증분 처리 watermark 관리
│       │   │   └── ContextFunctionEvaluator.kt # ${today()}, ${now()} 등 내장 함수
│       │   ├── schedule/                      # 스케줄링 (Quartz)
│       │   │   ├── Schedule.kt                # 4개 JPA 엔티티
│       │   │   ├── ScheduleRepository.kt
│       │   │   ├── ScheduleService.kt         # CRUD + Quartz 동기화
│       │   │   ├── ScheduleController.kt
│       │   │   ├── ScheduleExecutionService.kt
│       │   │   ├── ScheduleTriggerJob.kt
│       │   │   └── ScheduleStartupLoader.kt
│       │   ├── ir/
│       │   │   └── JobIR.kt                  # IR 데이터 모델 (전체 ComponentType enum 포함)
│       │   └── schema/
│       │       ├── SchemaController.kt
│       │       ├── SchemaModels.kt
│       │       └── SchemaService.kt          # JDBC 메타데이터 조회
│       └── resources/
│           ├── application.yml
│           └── db/migration/
│               ├── V1__create_connections.sql
│               ├── V2__create_projects_and_jobs.sql
│               ├── V3__create_executions.sql
│               ├── V4__add_auth_fields.sql
│               ├── V5__add_execution_fields.sql
│               ├── V6__create_schedules.sql
│               ├── V7~V10 (컬럼/인덱스 추가)
│               ├── V11__add_execution_locks.sql  # Job 동시 실행 방지
│               └── V12__add_watermarks.sql       # 증분 처리 watermark
│
└── frontend/                         # React + Vite + TypeScript
    ├── package.json
    ├── vite.config.ts                 # port: 3001, proxy: /api → 8080, /xai-proxy → api.x.ai
    ├── tailwind.config.ts
    ├── .env                           # AI API 키 (git 제외)
    ├── .env.example
    ├── public/ai.png                  # AI Agent 버튼 이미지 (정적 자산)
    └── src/
        ├── main.tsx
        ├── App.tsx                    # 라우터 (BrowserRouter)
        ├── index.css                  # 글로벌 CSS (라이트 테마)
        ├── types/index.ts             # 전체 TypeScript 타입 정의
        ├── stores/index.ts            # Zustand 전역 상태
        ├── api/
        │   ├── client.ts              # Axios 인스턴스
        │   ├── index.ts               # API 함수 모음 (schemaApi 포함)
        │   └── ai.ts                  # AI Agent API (Claude/OpenAI/Gemini/Grok)
        ├── components/
        │   ├── ui/index.tsx           # Badge, Button, Card, Input, Select, Spinner, Modal
        │   ├── layout/
        │   │   ├── AppLayout.tsx
        │   │   └── Sidebar.tsx
        │   └── job/
        │       ├── AiAgentPanel.tsx
        │       ├── ComponentPalette.tsx
        │       ├── CustomNodes.tsx
        │       ├── PropertiesPanel.tsx
        │       ├── TablePickerModal.tsx
        │       ├── MappingEditorModal.tsx
        │       ├── PreviewGrid.tsx         # 데이터 프리뷰 결과 테이블 (신규)
        │       └── SchemaTree.tsx
        └── pages/
            ├── LoginPage.tsx
            ├── DashboardPage.tsx
            ├── ConnectionsPage.tsx
            ├── ProjectsPage.tsx
            ├── ProjectDetailPage.tsx
            ├── JobDesignerPage.tsx        # 메인 캔버스 페이지
            ├── ExecutionsPage.tsx
            └── SchedulesPage.tsx
```

---

## 4. 주요 기술 스택

| 구분      | 기술                                | 버전                     |
| --------- | ----------------------------------- | ------------------------ |
| Backend   | Spring Boot (Kotlin)                | 3.3.5                    |
| Backend   | Kotlin                              | 1.9.25                   |
| Backend   | Java (런타임)                       | 21 (VS Code redhat 확장) |
| Backend   | Gradle wrapper                      | 8.10.2                   |
| Backend   | Spring Data JPA + Hibernate         | 6.5.x                    |
| Backend   | Spring Security (JWT + OAuth2)      | 포함                     |
| Backend   | Flyway (DB 마이그레이션)            | V12까지 적용             |
| Backend   | Spring Security Crypto (AES 암호화) | 포함                     |
| Backend   | Quartz Scheduler                    | 2.3.2                    |
| Meta DB   | PostgreSQL (Docker)                 | 16, 포트 5433            |
| Target DB | PostgreSQL (로컬)                   | 18, 포트 5432            |
| Frontend  | React                               | 18.3.1                   |
| Frontend  | TypeScript                          | 5.6.3                    |
| Frontend  | Vite                                | 5.4.21                   |
| Frontend  | @xyflow/react (React Flow)          | 12.3.2                   |
| Frontend  | Zustand                             | 5.0.1                    |
| Frontend  | Tailwind CSS                        | 3.4.15                   |
| Frontend  | Monaco Editor                       | 4.6.0                    |
| Frontend  | Axios                               | 1.7.7                    |
| Frontend  | React Router DOM                    | 6.28.0                   |

---

## 5. API 엔드포인트

### Auth API

| Method | URL                   | 설명                                        |
| ------ | --------------------- | ------------------------------------------- |
| POST   | `/api/auth/register`  | 이메일/비밀번호 회원가입                   |
| POST   | `/api/auth/login`     | 로그인 → access token + refresh cookie 발급 |
| POST   | `/api/auth/refresh`   | refresh cookie → access token 갱신         |
| DELETE | `/api/auth/logout`    | refresh token 무효화 + 쿠키 삭제           |
| GET    | `/api/auth/me`        | 현재 로그인 유저 정보                      |

> JWT 기반. Access token은 응답 바디, Refresh token은 HttpOnly 쿠키(`etl_refresh`).
> OAuth2: `/oauth2/authorization/{provider}` 경로로 소셜 로그인 지원 구조.

### Connection API

| Method | URL                          | 설명        |
| ------ | ---------------------------- | ----------- |
| GET    | `/api/connections`           | 커넥션 목록 |
| GET    | `/api/connections/{id}`      | 커넥션 상세 |
| POST   | `/api/connections`           | 커넥션 생성 |
| PUT    | `/api/connections/{id}`      | 커넥션 수정 |
| DELETE | `/api/connections/{id}`      | 커넥션 삭제 |
| POST   | `/api/connections/{id}/test` | 연결 테스트 |

### Schema API

| Method | URL                                                       | 설명             |
| ------ | --------------------------------------------------------- | ---------------- |
| GET    | `/api/connections/{id}/schema/tables`                     | 테이블 목록 조회 |
| GET    | `/api/connections/{id}/schema/tables/{tableName}?schema=` | 컬럼 정보 조회   |

### Project / Job API

| Method         | URL                                       | 설명               |
| -------------- | ----------------------------------------- | ------------------ |
| GET/POST       | `/api/projects`                           | 프로젝트 목록/생성 |
| GET/PUT/DELETE | `/api/projects/{id}`                      | 프로젝트 CRUD      |
| GET/POST       | `/api/projects/{id}/jobs`                 | 잡 목록/생성       |
| GET/PUT/DELETE | `/api/projects/{id}/jobs/{jobId}`         | 잡 CRUD            |
| POST           | `/api/projects/{id}/jobs/{jobId}/publish` | 잡 게시            |

### Execution API

| Method | URL                            | 설명                    |
| ------ | ------------------------------ | ----------------------- |
| POST   | `/api/jobs/{jobId}/run`        | 잡 실행                 |
| GET    | `/api/executions`              | 전체 실행 이력 (페이징) |
| GET    | `/api/jobs/{jobId}/executions` | 잡별 실행 이력          |
| GET    | `/api/executions/{id}`         | 실행 상세               |

### Schedule API

| Method | URL                                    | 설명                          |
| ------ | -------------------------------------- | ----------------------------- |
| GET    | `/api/schedules`                       | 스케줄 목록                   |
| GET    | `/api/schedules/{id}`                  | 스케줄 상세                   |
| POST   | `/api/schedules`                       | 스케줄 생성                   |
| PUT    | `/api/schedules/{id}`                  | 스케줄 수정                   |
| DELETE | `/api/schedules/{id}`                  | 스케줄 삭제                   |
| PATCH  | `/api/schedules/{id}/enabled?enabled=` | 활성/비활성 토글              |
| POST   | `/api/schedules/{id}/trigger`          | 수동 즉시 트리거              |
| GET    | `/api/schedules/{id}/executions`       | 스케줄 실행 이력              |
| GET    | `/api/schedules/by-job/{jobId}`        | 특정 Job이 포함된 스케줄 목록 |

### AI Agent (프론트엔드 직접 호출 - 백엔드 경유 없음)

| 공급자           | Endpoint                                                                          | 비고                                           |
| ---------------- | --------------------------------------------------------------------------------- | ---------------------------------------------- |
| Anthropic Claude | `https://api.anthropic.com/v1/messages`                                           | `anthropic-dangerous-allow-browser: true` 필요 |
| OpenAI           | `https://api.openai.com/v1/chat/completions`                                      | Bearer 토큰 인증                               |
| Google Gemini    | `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | URL 쿼리 파라미터로 키 전달                    |
| xAI Grok         | `/xai-proxy/v1/chat/completions` → `https://api.x.ai`                             | Vite 프록시 경유 (CORS 우회), OpenAI 호환      |

---

## 6. 구현된 기능

### 6-1. 인증 시스템

#### 이메일/비밀번호 인증
- 회원가입: 이름·이메일·비밀번호(6자 이상) → BCrypt 해시 저장
- 로그인: Access Token(JWT) + Refresh Token(SHA-256 해시 저장, HttpOnly 쿠키) 발급
- Refresh: `etl_refresh` 쿠키로 Access Token 갱신 (7일 유효)
- 로그아웃: DB의 Refresh Token 삭제 + 쿠키 만료

#### JWT 구조
- Access Token: 사용자 ID, 이메일, 이름 포함
- `JwtAuthFilter`: 모든 요청에서 Authorization 헤더 검증 후 Spring Security 컨텍스트 설정
- 허용 경로(인증 없이): `/oauth2/**`, `/login/**`, `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`

#### OAuth2 (구조 준비됨)
- `CustomOAuth2UserService`, `OAuth2SuccessHandler`, `OAuthUserPrincipal` 구현
- provider/providerId 기반 User 엔티티 upsert

#### CORS
- `SecurityConfig.kt`: 허용 origin = `http://localhost:3001`
- allowCredentials = true (refresh token 쿠키 전송 필요)

### 6-2. 대시보드

- 통계 카드 (커넥션 수, 프로젝트 수, 잡 수, 최근 실행 상태)
- 최근 프로젝트 카드 목록
- 활성 커넥션 목록

### 6-3. 커넥션 관리

- CRUD (생성/조회/수정/삭제)
- DB 타입: POSTGRESQL, ORACLE, MARIADB
- 비밀번호 AES 암호화 저장 (`ENCRYPTION_SECRET` 환경변수, 미설정 시 기본값 사용 — 프로덕션 교체 필수)
- 연결 테스트 (ConnectionTestResult: success, message, durationMs)
- SSL, JDBC URL Override 지원

### 6-4. 프로젝트/잡 관리

- 프로젝트 CRUD (카드 그리드 UI)
- 프로젝트별 잡 목록 (DRAFT/PUBLISHED 상태)
- 잡 생성/삭제/게시

### 6-5. Job Designer (메인 기능)

#### 캔버스
- React Flow DAG 캔버스 (드래그&드롭, 노드 연결)
- 노드 상태 표시 (idle/running/success/failed - 색상 코딩)
- MiniMap, 고정 도트 패턴 배경 (CSS radial-gradient, `<Background>` 컴포넌트 대신 래퍼 div에 적용)
- Delete / Backspace 키로 선택된 노드/엣지 삭제
- 라이트 테마 (AWS Glue Studio 스타일): 캔버스 `#f8fafc`, 패널 `#ffffff`, 사이드바/터미널 `#232b37`

#### 컴포넌트 팔레트 (좌측)

드래그 가능한 ETL 컴포넌트:

- **INPUT**: T_JDBC_INPUT, T_FILE_INPUT
- **TRANSFORM**: T_MAP, T_FILTER_ROW, T_AGGREGATE_ROW, T_SORT_ROW, T_JOIN, T_CONVERT_TYPE, T_REPLACE, T_UNION_ROW
- **OUTPUT**: T_JDBC_OUTPUT, T_FILE_OUTPUT
- **ORCHESTRATION**: T_PRE_JOB, T_POST_JOB, T_RUN_JOB, T_SLEEP, T_LOOP, T_DB_COMMIT, T_DB_ROLLBACK
- **UTILITY**: T_LOG_ROW, T_DIE, T_VALIDATE, T_PROFILE, T_LINEAGE

#### 속성 패널 (우측, 300px)
- T_JDBC_INPUT: Connection 선택, 테이블 선택(Picker), Custom Query, 컬럼 미리보기, **증분 처리 설정** (TIMESTAMP/OFFSET 모드, watermarkVar)
- T_JDBC_OUTPUT: Connection 선택, 테이블 선택, Write Mode (INSERT/UPSERT/UPDATE/DELETE/TRUNCATE_INSERT), **UPSERT 시 PK 컬럼 입력**
- T_MAP: 더블클릭으로 시각적 매핑 에디터 열림 + JSON 직접 편집
- T_FILTER_ROW: Filter Expression
- T_AGGREGATE_ROW: Group By + 집계 함수 JSON
- T_JOIN: Join Type + Join Condition
- T_SORT_ROW: Sort Columns JSON
- T_LOOP: 모드 탭(FOR_DATE/FOR/LIST) + 실시간 반복 횟수 프리뷰
- 각 컴포넌트: 예제 JSON 다운로드 버튼, textarea resize-y

#### 테이블 선택 (TablePickerModal)
- 커넥션의 전체 테이블 목록 조회 (스키마별 그룹), 검색 필터
- 더블클릭 즉시 선택, 테이블 클릭 시 컬럼 정보 백그라운드 프리페치
- 선택 확정 시 `onChange('__raw', { tableName, schemaName, columns })` 단일 호출로 config 업데이트

#### 컬럼 자동 로드 (useAutoFetchColumns)
- connectionId + tableName 설정 시 columns가 없으면 600ms debounce 후 자동 API 호출
- 저장된 잡 불러올 때도 동작 (기존 columns 있으면 스킵)

#### tMap 매핑 에디터 (MappingEditorModal)
- T_MAP 노드 더블클릭으로 열림
- 좌측: 연결된 Input 노드들의 소스 컬럼 (노드별 색상 구분)
- 우측: Output 탭(연결된 T_JDBC_OUTPUT별) + Target 매핑 행 (Source Column, Target Name, Expression, Type)
- 소스 컬럼 클릭 → 타겟 행 클릭으로 매핑 연결
- **Auto Map**: 소스 컬럼명 기반 passthrough 매핑(expression = ""). 타입 기반 자동 Expression 삽입 제거됨(Tier 0)
- `outputMappings[outputId]` 구조로 다중 Output 각각 독립 매핑 관리
- 노드 config.columns 캐시 우선 사용 (API 재호출 최소화)
- JSON 다운로드

#### Schema Browser (우측 하단, 접기/펼치기, 드래그 리사이즈 80~600px)
- 캔버스 노드의 connectionId + tableName 스캔
- 노드 config.columns 있으면 즉시 표시 (API 호출 없음)
- DB 타입별 색상 (PG: 파랑, Oracle: 보라, MariaDB: 초록), PK 아이콘 표시

#### 하단 패널 탭
- **SQL View**: Monaco Editor (읽기 전용, SQL 하이라이팅). 기본 열린 상태.
- **Execution Logs**: 실행 결과, 오류 메시지, 노드별 처리 행 수
- **Row Logs**: T_LOG_ROW 노드가 캡처한 실제 데이터 행 (다중 노드 탭 전환)
- **Job Summary**: 잡 구성 요약 통계
- **Schedule**: 현재 Job이 포함된 스케줄 목록 + Quick Schedule 생성

#### 노드 UI
- T_JDBC_OUTPUT 노드에 Write Mode 배지 표시
- NodeToolbar (복제`+` / 삭제`−` 버튼, React Flow 포털 렌더링)
- GROUP_COLORS (라이트 테마):
  ```
  INPUT:         bg:#f0fdf4, border:#86efac, icon:#16a34a
  TRANSFORM:     bg:#eff6ff, border:#93c5fd, icon:#2563eb
  OUTPUT:        bg:#fff7ed, border:#fdba74, icon:#ea580c
  ORCHESTRATION: bg:#faf5ff, border:#d8b4fe, icon:#7c3aed
  LOGS:          bg:#fefce8, border:#fde047, icon:#ca8a04
  ```

#### 엣지 실행 결과 표시
- 실행 중: 파란색 animated 엣지
- rows > 0: 초록색 + `1,234 rows · 320ms` 레이블
- rows = 0 + JOB FAILED: 빨간색 + `(error)` 텍스트
- rows = 0 + JOB SUCCESS: 초록색
- TRIGGER 엣지: 점선 유지(실행 후 setEdges 호출 시 스타일 보존 로직 필요)

#### 엣지 타입 (TRIGGER vs ROW)
- **TRIGGER 엣지**: 실행 제어 흐름 (점선, 초록=On Ok, 빨강=On Error). 우클릭 컨텍스트 메뉴로 생성.
- **ROW 엣지**: 데이터 흐름. SQL 컴파일러는 ROW만 참조.
- ROW 연쇄 SKIP: 모든 ROW 소스가 SKIPPED이면 해당 노드도 SKIP.

#### 실행 제어
- Preview Mode 체크박스 (100행 제한, Output 노드 SKIP)
- Run 버튼 → IR 저장 → `/api/jobs/{id}/run` 호출
- 실행 중 노드 상태 시각화

### 6-6. Context 변수 시스템

#### 변수 구조
- `JobIR.context`: `Map<String, ContextVar>` (value, defaultValue?, description?)
- `ContextVarDeserializer`: 이전 string 포맷과 새 ContextVar 포맷 모두 역직렬화

#### 우선순위 (낮음→높음)
`defaultValue` → `value` → `runtimeContext`(스케줄 contextOverrides)

#### 내장 함수 (`ContextFunctionEvaluator.kt`)
- `${today(format)}`, `${now(format)}`, `${uuid()}`, `${dateAdd(date,days)}`
- `${env(KEY)}`: `ETL_ENV / ETL_PROJECT / ETL_VERSION` 키만 허용 (보안 화이트리스트)

#### 프론트엔드 ContextVarsPanel
- fn 표현식: 보라색 `fn` 배지 + 브라우저사이드 프리뷰
- 기본값: 이탤릭 회색 표시, 접이식 defaultValue/description 입력
- `▶ 기본값/설명` 영역으로 확장 입력 가능

### 6-7. AI Agent

#### 지원 공급자 및 모델
- Claude: Sonnet 4.6, Opus 4.6, Haiku 4.5
- OpenAI: GPT-4o, GPT-4o mini, GPT-4 Turbo
- Gemini: 2.5 Flash, 2.5 Flash Lite, 2.0 Flash
- Grok: Grok 3, Grok 3 Mini, Grok 2

#### 핵심 기능
- 공급자/모델 전환 시 에러 상태 자동 초기화
- 멀티턴 대화 + 대화 초기화 버튼
- **DB 커넥션 컨텍스트**: 테이블 목록 + 전체 컬럼을 AI 시스템 프롬프트에 주입
- **파이프라인 IR 컨텍스트**: 현재 캔버스 노드/엣지 구조 주입 (columns는 개수만)
- **실행 결과 컨텍스트**: status, nodeResults, logs, errorMessage 주입
- **새 파이프라인 생성**: `{ nodes[], edges[] }` 포맷 감지 → "캔버스에 적용" 버튼
- **기존 파이프라인 패치**: `{ "action": "patch", "patches": [...] }` 포맷 감지 → "파이프라인에 적용" 버튼
- **다중 JSON 블록 렌더링**: `CodeBlock` 재귀 처리, `extractPatchSpec/extractGraphSpec` 전체 블록 탐색
- 빠른 질문 버튼 (실행전/FAILED/SUCCESS 상황별 세트)
- AI 토글 버튼: `ai.png` 이미지 (public/ 정적 자산), 패널 열릴 때 얇은 띠로 축소

#### AI 시스템 프롬프트 구조

| 섹션                        | 역할                                                      |
| --------------------------- | --------------------------------------------------------- |
| Response Style              | 간결 응답 강제 (3문장, 불필요 문구 금지)                  |
| 1. New Pipeline Design      | `{ nodes[], edges[] }` 포맷 출력 규칙                     |
| 2. Existing Pipeline Fix    | 분석 + patch JSON 동시 출력 규칙                          |
| 3. Result Analysis & Review | 의심 결과 플래그 필수 (0-row, 불일치), fixable 시 patch   |
| 4. Error Analysis           | FAILED 시 원인·영향노드·수정 포맷, patch JSON 자동 첨부   |

### 6-8. 실행 엔진

#### 실행 흐름
```
ExecutionService.execute()
  → ExecutionLockService.tryLock()       // 중복 실행 방지
  → ContextFunctionEvaluator.evaluate() // ${today()} 등 치환
  → ExecutionRouter.execute()
       → analyze(): Input/Output 연결 DB 서버 비교
       → 동일 서버 → SqlPushdownAdapter
            → SqlPushdownCompiler (CTE 기반 SQL 생성)
            → 단일 SQL 실행 (OUTPUT DB 커넥션)
            → WatermarkService.saveWatermarks() (성공 시)
       → 다른 서버 → FetchAndProcessExecutor
            → 소스 JDBC 스트리밍 fetch (fetchSize=10,000)
            → tFilter 인메모리 필터 (IS NULL, =, IS NOT NULL)
            → tMap 인메모리 변환 (TRIM/UPPER/COALESCE/리터럴)
            → Broadcast Join (LOOKUP 엣지 → HashMap, 100만 행 상한)
            → TargetWriter 배치 UPSERT (방언 분기)
            → commit
  → ExecutionLockService.unlock()        // finally
```

#### SqlPushdownCompiler (동일 DB 경로)
- CTE 체인: 각 노드별 CTE 생성 → 최종 `INSERT INTO ... SELECT FROM cte_...`
- ROW 엣지만 데이터 predecessor로 사용 (TRIGGER 엣지 제외)
- Watermark WHERE 조건 자동 삽입 (`injectWatermarkConditions()`)
- 커밋 성공 후 `saveWatermarks()` 호출 (R1 원자성 보장)

#### FetchAndProcessExecutor (이기종 DB 경로)
- 소스/타겟 DB가 다른 서버일 때 자동 선택
- Broadcast Join 지원 (LOOKUP 엣지 연결 테이블 → HashMap 구성)
- 100만 행 상한 초과 시 OOM 방지를 위해 중단

#### TargetWriter (UPSERT 방언)
- PostgreSQL: `ON CONFLICT (...) DO UPDATE SET col = EXCLUDED.col`
- MariaDB: `ON DUPLICATE KEY UPDATE col = ?`
- Oracle: `MERGE INTO ... USING (SELECT ? FROM DUAL) ...`

#### 트랜잭션 모드 (T_DB_COMMIT / T_DB_ROLLBACK)
- Job IR에 T_DB_COMMIT/ROLLBACK 노드가 있으면 트랜잭션 모드 자동 활성화
- sharedConnections로 동일 connectionId의 Output 노드들이 공유 커넥션 사용
- T_DB_COMMIT → commit all, T_DB_ROLLBACK → rollback all
- Preview Mode → 두 노드 모두 SKIPPED
- 오류 시 → 공유 커넥션 전체 자동 rollback

#### T_LOOP 컴포넌트
- **FOR_DATE**: startDate~endDate, dateStep(일), dateFormat (기본 yyyyMMdd)
- **FOR**: start~end, step (정수 범위)
- **LIST**: 콤마 구분 값 목록
- BFS로 T_LOOP 하위 노드 집합 추출 (`collectLoopBodyIds()`)
- 매 반복마다 loopVar를 context에 주입 후 하위 노드 재실행

#### Trigger (On Component Ok / On Component Error)
- TRIGGER 엣지 존재 시 `hasTriggerEdges` 모드 — 노드 실패 시 즉시 중단 대신 ON_ERROR 경로 계속 실행
- ROW 연쇄 SKIP: 모든 ROW 소스가 SKIPPED이면 해당 노드도 SKIP

### 6-9. 실행 이력

- DB 저장: 실행 시작 시 RUNNING 저장, 완료 후 SUCCESS/FAILED 업데이트
- ExecutionsPage: 전체 실행 목록 테이블 (페이지네이션), 클릭 시 상세 펼치기
- 노드별 처리 행수·소요시간, 에러 메시지 포함

### 6-10. 스케줄링 (Quartz 기반)

#### 백엔드
- **DB 스키마**: `schedules`, `schedule_steps`, `schedule_executions`, `schedule_step_executions` 4개 테이블 (V6 Flyway)
- **Quartz 설정**: `SpringBeanJobFactory`로 Spring DI를 Quartz Job에 주입, RAMJobStore
- **재시작 복구**: `ScheduleStartupLoader` — 서버 재시작 시 enabled 스케줄 전체 Quartz 재등록
- **실행 아키텍처**: Quartz(ScheduleTriggerJob) → ScheduleExecutionService.trigger() → step 오케스트레이션

#### 프론트엔드 SchedulesPage
- 목록 뷰 (Airflow 스타일): 스케줄 카드, 다음 실행 시각, 활성 수 통계
- Pipeline 탭: SVG DAG 시각화 (ON_SUCCESS 초록/ON_FAILURE 빨강 점선/ON_COMPLETE 회색)
- 실행 이력 탭: GitHub Actions 스타일, 첫번째 실행 자동 오픈
- Settings 탭: 이름/설명/cron/timezone/step 편집
- 신규 스케줄 모달: cron 프리셋, step 빌더 + contextOverrides 입력

---

## 7. 데이터 모델 (IR)

Job은 `ir_json` (JSONB)으로 저장됨.

```json
{
  "id": "job-uuid",
  "version": "0.1",
  "engineType": "SQL_PUSHDOWN",
  "nodes": [
    {
      "id": "T_JDBC_INPUT-1234",
      "type": "T_JDBC_INPUT",
      "label": "사원 입력",
      "position": { "x": 100, "y": 200 },
      "config": {
        "connectionId": "uuid",
        "tableName": "src.employee",
        "schemaName": "src",
        "columns": [
          { "columnName": "emp_id", "dataType": "bigserial", "isPrimaryKey": true, "nullable": false }
        ],
        "query": "",
        "incremental": {
          "enabled": false,
          "mode": "FULL",
          "column": "updated_at",
          "watermarkVar": "last_run"
        }
      }
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "node-a",
      "sourcePort": "out",
      "target": "node-b",
      "targetPort": "in",
      "linkType": "ROW"
    }
  ],
  "context": {
    "BIZ_DT": {
      "value": "${today(yyyyMMdd)}",
      "defaultValue": "20260101",
      "description": "배치 처리 기준일"
    }
  }
}
```

---

## 8. 주요 버그 수정 이력

### [BUG-01] Schema API URL 불일치
- **증상**: 테이블 조회 시 "No static resource api/schema/..." 오류
- **원인**: 프론트엔드 `/api/schema/{id}/tables`, 백엔드는 `/api/connections/{id}/schema/tables`
- **수정**: `frontend/src/api/index.ts` URL 수정

### [BUG-02] 테이블 선택 시 tableName 미적용
- **증상**: TablePickerModal에서 테이블 선택해도 노드에 반영 안 됨
- **원인**: `onChange` 3회 연속 호출 시 마지막 호출만 적용
- **수정**: `onChange('__raw', { ...config, tableName, schemaName, columns })` 단일 호출

### [BUG-03] 컬럼 조회 빈 결과
- **증상**: `getTableSchema` API 호출 시 columns 빈 배열 반환
- **원인**: 모든 DB 타입에 `tableName.uppercase()` 적용 → PostgreSQL 소문자 저장 불일치
- **수정**: Oracle만 대문자 변환, PostgreSQL/MariaDB는 원본 케이스 유지

### [BUG-04] 순환 의존성
- **증상**: 백엔드 기동 실패 (Circular dependency)
- **원인**: `ConnectionService` → `SchemaService` → `ConnectionService`
- **수정**: 불필요한 `SchemaService` 주입 제거

### [BUG-05] TRIGGER 엣지 점선 스타일 소실
- **증상**: Job 실행 후 TRIGGER 엣지의 점선이 실선으로 변경됨
- **원인**: `setEdges` 호출 시 기존 스타일 속성이 초기화됨
- **수정**: JobDesignerPage.tsx의 3개 `setEdges` 위치에서 TRIGGER 엣지 스타일 보존 로직 추가

### [BUG-06] SQL CTE에 TRIGGER 엣지 포함
- **증상**: `relation "cte_t_jdbc_output_..." does not exist` 오류
- **원인**: TRIGGER 엣지가 데이터 predecessor로 포함되어 CTE 생성
- **수정**: `SqlPushdownCompiler.compile()`에서 `incomingEdges`를 `LinkType.ROW`만 필터링

### [BUG-07] extractPatchSpec 다중 블록 감지 실패
- **증상**: 응답 내 첫 번째 JSON 블록이 non-patch일 때 patch 버튼 미표시
- **원인**: 첫 번째 블록만 검사하는 로직
- **수정**: `regex.exec` 루프로 전체 블록 순회

---

## 9. AETL 연동 분석 (AETL.md 기반)

기존 Python 기반 AETL 프로그램의 ETL Platform 통합 전략.

### 이식 불필요 (ETL Platform에 이미 구현됨)

| AETL 기능 | ETL Platform 대응 |
|-----------|-------------------|
| aetl_executor.py SQL 실행 | SqlPushdownAdapter.kt (JVM/JDBC 방식이 더 안정적) |
| db_schema.py 스키마 조회·캐시 | SchemaService.kt + config.columns 캐시 |
| etl_flow_component/ React 리니지 UI | React Flow v12 (이미 사용 중) |
| db_config.json 단일 연결 | Connection 엔티티 (다중, DB 저장) |
| aetl_store.py SQLite 저장 | PostgreSQL + Spring JPA |
| aetl_metadata_engine.py 스키마 캐시 | config.columns + SchemaService |

### 실제 이식 대상 (ETL Platform에 없는 신규 기능)

| AETL 기능 | 이식 방법 | 구현 위치 |
|-----------|-----------|-----------|
| etl_sql_generator.py 검증 SQL 생성 | FastAPI → Spring 호출 | T_VALIDATE 노드 실행 로직 |
| aetl_profiler.py 데이터 프로파일링 | FastAPI → Spring 호출 | T_PROFILE 노드 + 별도 프로파일 페이지 |
| aetl_export.py 매핑정의서/DDL/MERGE | FastAPI → Spring 호출 | Job Designer 내 "산출물" 버튼 |
| aetl_designer.py Star Schema DW 설계 | FastAPI + React ERD UI | 별도 DW 설계 페이지 |
| aetl_agent.py Tool-calling 에이전트 | AI Agent 패널 확장 | AiAgentPanel 확장 |

### 권장 통합 방식
**Spring 오케스트레이터 + Python FastAPI 서비스 (하이브리드)**
- React → Spring 호출만 노출 (사용자 경험 단일화)
- Spring이 내부적으로 Python FastAPI 호출
- Python은 생성·분석만 담당, DB/이력은 Spring·PostgreSQL 일원화
- Python 장애 시 기본 ETL 실행에는 영향 없음 (실패 격리)

---

## 10. 고도화 로드맵 (LOADMAP.md 기반)

### P0 (즉시 — 품질/오류 감소)

#### tMap Auto Map Tier 0 전환
- **현상**: `getAutoExpression()`이 TRIM/COALESCE/UPPER/CAST를 자동 삽입 → DB 방언/타입 불일치 런타임 에러
- **목표**: `expression = ""` (passthrough) 기본값으로 전환
- **범위**: `frontend/src/utils/mapping.ts`의 `getAutoExpression()` 수정

#### tMap 다중 Output 검증 누락 수정 (버그 수준)
- **현상**: `SqlPushdownAdapter.validate()`가 legacy `config.mappings` + 첫 Output 1개만 검사
- **목표**: `outputMappings`의 각 outputId 순회 → Output별 타겟 컬럼 검사
- **범위**: `SqlPushdownAdapter.kt` validate() 내 tMap 검증 블록

### P1 (단기)

#### tMap Tier 1 — Safe Cast (타입 불일치 감지)
- `normalizeType()`로 TypeFamily 정규화 (STRING/INTEGER/DECIMAL/DATE/TIMESTAMP/BOOLEAN)
- 위험 변환 경고 표시 + 클릭 시 CAST 제안 (자동 삽입 아님)
- MappingEditorModal에 Status 열 + ⚠️ 아이콘 + hover 툴팁

#### tMap Tier 2 — Enhancements 메뉴
- `[Enhancements ▼]` 드롭다운 (Trim / Null-safe / Uppercase codes 일괄 적용)
- 각 행에 💡 팝오버 (타입별 추천 expression)

#### Expression 1차 유효성 검사
- 금지 패턴/기본 문법/미치환 `context.xxx` 프론트에서 즉시 경고
- (선택) 백엔드 `validateExpression` 엔드포인트

#### 파일 I/O MVP (T_FILE_INPUT / T_FILE_OUTPUT)
- JVM 기반 FileAdapter로 CSV read/write 최소 구현
- 로컬/서버 파일 기준 → 장기에는 presigned URL 전략

#### 데이터 프리뷰 결과 테이블 UI
- Preview Mode 응답을 경량 테이블 컴포넌트(PreviewGrid)로 렌더링

### P2 (중기)

#### 대상 DB HikariCP 연결 풀링
- 현재 `DriverManager.getConnection` 방식 → Connection ID 기준 DataSource 캐시

#### AI 호출 백엔드 프록시
- 현재 프론트에서 직접 호출 → 키 노출 위험
- `/api/ai/*` 서버 프록시화, rate limiting (Resilience4j 선택적)

#### 폴더 UI 연결
- 백엔드 folders 테이블 존재, 프론트 미연결
- 프로젝트/잡 관리 폴더 트리 UI

#### 리니지 뷰 (읽기 전용)
- IR(nodes/edges + tableName/mappings)만으로 소스→변환→타겟 리니지 그래프

### P3 (장기)

#### REJECT 라인 실행 시맨틱
- PortType/LinkType 정의는 존재, 실행 엔진 reject 스트림 처리 미구현

#### Pushdown Compiler 방언 최적화
- Dialect별 함수/타입/DML 최적화 (Oracle/MariaDB/PG)

#### Hash Join + Disk Spill (이기종 대용량+대용량)
- 상용 엔진도 수년 안정화 필요, 충분한 검토 후 착수

#### CDC 연동 (별도 트랙)
- Debezium 등, 현재 배치 아키텍처와 설계 철학 다름

---

## 11. 이기종 DB 설계 분석 (이기종.md 기반)

### 현재 구현 상태 (PHASE 1~2 완료)

- **ExecutionRouter**: Input/Output 노드의 host:port 비교 → 동일 서버 → SqlPushdownAdapter, 다른 서버 → FetchAndProcessExecutor
- **FetchAndProcessExecutor**: 소스 스트리밍(fetchSize=10,000), tMap 인메모리 변환, tFilter 평가, Broadcast Join, TargetWriter UPSERT
- **WatermarkService**: `etl_watermarks` 테이블 조회/저장, UTC ISO-8601 포맷
- **ExecutionLockService**: `etl_execution_locks` 테이블 기반 동시 실행 방지

### 리스크 및 대응 (설계 결정 사항)

| 리스크 | 대응 |
|--------|------|
| Watermark write/갱신 원자성 파괴 | write 완전 성공 후에만 WatermarkService.save() 호출 |
| Late Arriving Data (지연 데이터) | lookback window 옵션 (Input 노드 UI에서 설정) |
| 물리 DELETE 감지 불가 | 소스 설계 협의 또는 주기적 FULL SYNC 병행 |
| Clock Skew | 소스 DB `NOW()` 기준으로 watermark 수집 권장 |
| Broadcast OOM (stale 통계) | 100만 행 상한 안전장치 내장 |
| host:port 오판 | connectionId 동일성 우선 비교 |

---

## 12. 미구현 / 향후 과제

- [ ] T_FILE_INPUT / T_FILE_OUTPUT 실행 엔진 구현
- [ ] tMap Auto Map Tier 0 (expression 빈값 기본) — **P0 즉시**
- [ ] tMap 다중 Output validate 수정 — **P0 즉시**
- [ ] tMap Tier 1 타입 불일치 경고 UI
- [ ] tMap Tier 2 Enhancements 메뉴
- [ ] Expression 1차 유효성 검사 (정규식/JSQLParser)
- [ ] 데이터 프리뷰 결과 테이블 UI (PreviewGrid 기반)
- [ ] AI Agent 백엔드 프록시 (현재 프론트 직접 호출 → API 키 노출)
- [ ] Grok 프로덕션 배포 시 서버사이드 프록시 전환
- [ ] HikariCP 연결 풀링 (현재 DriverManager)
- [ ] 폴더 구조 UI (백엔드 존재, 프론트 미연결)
- [ ] 리니지 뷰 (읽기 전용 IR 기반)
- [ ] REJECT 라인 실행 시맨틱
- [ ] Oracle 실 연결 테스트
- [ ] AETL 연동: T_VALIDATE, T_PROFILE, 산출물 Export
- [x] 이기종 DB 지원 (ExecutionRouter + FetchAndProcessExecutor) — 완료
- [x] Watermark 증분 처리 — 완료
- [x] 동시 실행 방지 (ExecutionLockService) — 완료
- [x] 인증 시스템 (JWT + OAuth2) — 완료
- [x] 스케줄링 (Quartz) — 완료
- [x] T_LOOP — 완료
- [x] Transaction Control (T_DB_COMMIT/ROLLBACK) — 완료
- [x] Trigger (On Ok / On Error) — 완료
- [x] Context 변수 고도화 (ContextVar, 내장 함수) — 완료

---

## 13. 알려진 이슈 / 참고사항

- **React Router 경고**: `v7_relativeSplatPath` future flag 미설정 경고 (동작 무관)
- **Oracle JDBC**: `ojdbc11:23.4.0.24.05` 의존성 포함, 실 연결 미테스트
- **암호화**: 커넥션 비밀번호 AES 암호화. `ENCRYPTION_SECRET` 미설정 시 기본값 사용 (프로덕션 교체 필수)
- **SchemaService**: Oracle 대문자, PostgreSQL/MariaDB 원본 케이스 유지
- **컬럼 정보 저장**: 노드 config.columns 필드에 `ColumnInfo[]` 저장 (IR 직렬화, 잡 저장/불러오기 시 유지)
- **AI API 키**: 현재 Vite env로 브라우저 노출. 프로덕션 전 백엔드 프록시 전환 필요
- **ai.png 경로**: `public/ai.png`로 접근. `img/` 폴더의 원본은 별도 복사 필요
- **Grok CORS**: `api.x.ai` CORS 미지원, Vite 프록시 경유. `vite.config.ts` 변경 후 `npm run dev` 재시작 필수
- **NodeToolbar**: 노드 내부 DOM 버튼은 React Flow 드래그 이벤트와 충돌. NodeToolbar 포털 렌더링으로 해결
- **Watermark 원자성**: write 성공 후에만 saveWatermarks() 호출 순서 고정 (R1 리스크 대응)
- **ExecutionRouter host:port 판단**: `localhost` vs `127.0.0.1` 오판 가능. connectionId 동일성 우선 비교 권장
- **Flyway**: 현재 V12까지 적용됨 (etl_watermarks, etl_execution_locks 포함)

---

## 14. 변경 이력

### 2026-03-13 — 이기종 DB 지원 PHASE 1~2

#### 신규 파일
- `V11__add_execution_locks.sql`: Job 동시 실행 방지 잠금 테이블
- `V12__add_watermarks.sql`: Watermark 증분 처리 기준값 저장 테이블
- `ExecutionLockService.kt`: 동시 실행 방지 (INSERT 성공=락 획득, try-finally unlock)
- `ExecutionRouter.kt`: IR 분석 → Pushdown/Fetch-and-Process 자동 라우팅
- `FetchAndProcessExecutor.kt`: 이기종 DB 실행 엔진 (스트리밍 fetch, 인메모리 변환, Broadcast Join, 배치 write)
- `TargetWriter.kt`: UPSERT 방언 분기 (PostgreSQL/MariaDB/Oracle)
- `WatermarkService.kt`: watermark 조회/저장 (etl_watermarks, UTC ISO-8601)

#### 수정 파일
- `ExecutionService.kt`: ExecutionRouter + ExecutionLockService 연결
- `SqlPushdownCompiler.kt`: WatermarkService 주입, T_JDBC_INPUT CTE에 watermark WHERE 조건 자동 삽입, 커밋 성공 후 saveWatermarks() 호출
- `SqlPushdownAdapter.kt`: 커밋 성공 후 compiler.saveWatermarks() 호출
- `PropertiesPanel.tsx`: Input 노드 증분 처리 설정 UI (모드/기준컬럼/watermarkVar), Output 노드 UPSERT PK 입력

---

### 2026-03-11 — T_LOOP + Context 변수 고도화

#### T_LOOP
- 백엔드: `executeLoop()`, `collectLoopBodyIds()`, `generateLoopIterations()`, `T_LOOP` enum
- 프론트: Orchestration 섹션 T_LOOP 추가, LoopConfig 탭 UI, 범위 요약 배지

#### Context 변수 고도화
- `JobIR.kt`: `Map<String, String>` → `Map<String, ContextVar>`, `ContextVarDeserializer` 추가
- `ExecutionService.kt`: defaultValue → value → runtimeContext 머징 순서
- `ContextFunctionEvaluator.kt`: 내장 함수 화이트리스트 (`${today()}`, `${now()}`, `${uuid()}`, `${dateAdd()}`, `${env()}`)
- `JobDesignerPage.tsx`: fn 배지·프리뷰, defaultValue/description 접이식 입력, 함수 팔레트 팝업

---

### 2026-03-10 — 스케줄링 1~3단계 완성

- **실행 이력**: Execution JPA 엔티티, ExecutionService DB 저장, ExecutionsPage
- **스케줄링 백엔드**: Quartz, Schedule 4개 엔티티, ScheduleService/Controller, ScheduleExecutionService, ScheduleStartupLoader
- **스케줄링 프론트**: SchedulesPage (Pipeline DAG, 실행이력, Settings 탭), Job Designer Schedule 탭

---

### 2026-03-08 — 전체 UI 라이트 테마 전환 (AWS Glue Studio 스타일)

**라이트 테마 컬러 팔레트**

| 용도 | 색상 |
|------|------|
| 캔버스 배경 | `#f8fafc` |
| 패널 배경 | `#ffffff` |
| 보더 | `#e2e8f0` |
| 기본 텍스트 | `#0f172a` |
| 보조 텍스트 | `#64748b` |
| 액센트 블루 | `#2563eb` |
| 성공 그린 | `#16a34a` |
| 보라 (적용버튼) | `#7c3aed` |
| 터미널/사이드바 | `#232b37` |

- `<Background>` 컴포넌트 제거 → 래퍼 div CSS `radial-gradient`로 고정 배경 적용
- 하단 터미널 패널 다크 유지 (`#232b37`, `#1a2233`)
- 수정된 파일: `index.css`, `JobDesignerPage.tsx`, `ComponentPalette.tsx`, `CustomNodes.tsx`, `PropertiesPanel.tsx`, `AiAgentPanel.tsx`, `SchemaTree.tsx`, `TablePickerModal.tsx`, `MappingEditorModal.tsx`, `Sidebar.tsx`

---

### 2026-03-07 — Transaction Control + Trigger 보완

- **Transaction Control**: T_DB_COMMIT / T_DB_ROLLBACK, sharedConnections 트랜잭션 모드
- **Trigger**: On Component Ok / On Component Error 우클릭 컨텍스트 메뉴, ROW 연쇄 SKIP
- **T_LOG_ROW**: BFS로 상위 Input 탐색 → LIMIT 100 샘플 → Row Logs 탭 표시

---

### 2026-03-06 — Job Designer + AI Agent 전면 개편

- **NodeToolbar**: 복제/삭제 버튼, React Flow 포털 렌더링
- **엣지 실행 결과**: rows수·시간 레이블, 색상 규칙
- **Schema Browser**: 드래그 리사이즈 (80~600px)
- **AI Agent**: Grok(xAI) 추가, patch 포맷 지원, 다중 JSON 블록 렌더링, 실행 결과 컨텍스트, 빠른 질문 버튼 재설계, 최신 메시지 하이라이트
