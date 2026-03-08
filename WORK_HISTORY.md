# ETL Platform - Work History & Reference

> 최종 업데이트: 2026-03-08

---

## 1. 프로젝트 개요

Talend Open Studio 방식의 비주얼 ETL 툴을 웹 기반으로 구현한 플랫폼.
DAG(방향 비순환 그래프) 캔버스에서 컴포넌트를 드래그&드롭으로 연결하고,
IR(Intermediate Representation) → SQL Compiler → 대상 DB 실행 방식으로 동작.

---

## 2. 환경 설정 (필수)

### 2-1. Java 실행 환경

시스템 Java가 버전 8이므로 직접 사용 불가. VS Code 확장의 Java 21을 사용.

```bash
JAVA_HOME="$HOME/.vscode/extensions/redhat.java-1.53.0-win32-x64/jre/21.0.10-win32-x86_64"
```

### 2-2. Gradle

프로젝트에 gradlew wrapper 없음. 캐시된 Gradle 8.14 직접 사용.

```bash
GRADLE="$HOME/.gradle/wrapper/dists/gradle-8.14-all/c2qonpi39x1mddn7hk5gh9iqj/gradle-8.14/bin/gradle"
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
# Anthropic Claude
VITE_CLAUDE_API_KEY=sk-ant-api03-...

# OpenAI
VITE_OPENAI_API_KEY=sk-proj-...

# Google Gemini
VITE_GEMINI_API_KEY=AIzaSy...

# xAI Grok
VITE_GROK_API_KEY=xai-...

# 기본 제공사 선택: claude | openai | gemini | grok
VITE_AI_DEFAULT_PROVIDER=gemini
```

> `frontend/.env.example` 참고. `.env`는 git에 커밋하지 않을 것.
> **Grok**: `api.x.ai`는 브라우저 직접 호출 시 CORS 차단. Vite 개발 서버 프록시(`/xai-proxy`)를 통해 우회. vite.config.ts 변경 후 반드시 서버 재시작 필요.

### 2-5. 서버 기동 명령어

```bash
# 백엔드 (Spring Boot, 포트 8080)
cd /c/Users/안주현/Desktop/ETL_Platform/backend
JAVA_HOME="$HOME/.vscode/extensions/redhat.java-1.53.0-win32-x64/jre/21.0.10-win32-x86_64" \
"$HOME/.gradle/wrapper/dists/gradle-8.14-all/c2qonpi39x1mddn7hk5gh9iqj/gradle-8.14/bin/gradle" \
bootRun --no-daemon

# 프론트엔드 (Vite, 포트 3001 실제 기동)
cd /c/Users/안주현/Desktop/ETL_Platform/frontend
npm run dev
```

> vite.config.ts에는 포트 3000으로 설정되어 있으나 실제로는 3001에서 기동됨.
> 브라우저 접속: http://localhost:3001

---

## 3. 프로젝트 디렉터리 구조

```
ETL_Platform/
├── backend/                          # Spring Boot (Kotlin)
│   ├── build.gradle.kts
│   └── src/main/
│       ├── kotlin/com/platform/etl/
│       │   ├── EtlPlatformApplication.kt
│       │   ├── config/
│       │   │   ├── CorsConfig.kt           # CORS 설정 (localhost:3000,3001 허용)
│       │   │   └── GlobalExceptionHandler.kt
│       │   ├── domain/
│       │   │   ├── connection/             # DB 커넥션 CRUD + 암호화
│       │   │   │   ├── Connection.kt
│       │   │   │   ├── ConnectionController.kt
│       │   │   │   ├── ConnectionDto.kt
│       │   │   │   ├── ConnectionRepository.kt
│       │   │   │   └── ConnectionService.kt
│       │   │   ├── project/                # 프로젝트 CRUD
│       │   │   └── job/                    # 잡 CRUD + Publish
│       │   ├── execution/                  # 실행 엔진
│       │   │   ├── ExecutionController.kt
│       │   │   ├── ExecutionEngine.kt
│       │   │   ├── ExecutionModels.kt
│       │   │   ├── ExecutionService.kt
│       │   │   └── SqlPushdownAdapter.kt   # SQL Pushdown 실행기
│       │   ├── ir/
│       │   │   └── JobIR.kt               # IR 데이터 모델
│       │   └── schema/
│       │       ├── SchemaController.kt     # 스키마 조회 API
│       │       ├── SchemaModels.kt         # TableInfo, ColumnInfo, SchemaResponse
│       │       └── SchemaService.kt        # JDBC 메타데이터 조회
│       └── resources/
│           ├── application.yml
│           └── db/migration/
│               ├── V1__create_connections.sql
│               ├── V2__create_projects_and_jobs.sql
│               └── V3__create_executions.sql
│
└── frontend/                         # React + Vite + TypeScript
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.ts
    ├── .env                           # AI API 키 (git 제외)
    ├── .env.example                   # .env 템플릿
    ├── public/
    │   └── ai.png                     # AI Agent 버튼 이미지 (정적 자산)
    ├── img/
    │   └── ai.png                     # 원본 이미지 (public/으로 복사)
    └── src/
        ├── main.tsx
        ├── App.tsx                    # 라우터 (BrowserRouter)
        ├── index.css                  # 글로벌 다크 테마
        ├── types/index.ts             # 전체 TypeScript 타입 정의
        ├── stores/index.ts            # Zustand 전역 상태
        ├── api/
        │   ├── client.ts              # Axios 인스턴스 (baseURL, 에러 처리)
        │   ├── index.ts               # API 함수 모음 (schemaApi 포함)
        │   └── ai.ts                  # AI Agent API (Claude/OpenAI/Gemini)
        ├── components/
        │   ├── ui/index.tsx           # Badge, Button, Card, Input, Select, Spinner, Modal
        │   ├── layout/
        │   │   ├── AppLayout.tsx      # 좌측 사이드바 + 상단바 레이아웃
        │   │   └── Sidebar.tsx        # 네비게이션 메뉴
        │   └── job/
        │       ├── AiAgentPanel.tsx       # AI Agent 채팅 패널
        │       ├── ComponentPalette.tsx    # 드래그 컴포넌트 팔레트
        │       ├── CustomNodes.tsx         # React Flow ETL 노드 렌더러
        │       ├── PropertiesPanel.tsx     # 우측 속성 패널
        │       ├── TablePickerModal.tsx    # DB 테이블 선택 모달
        │       ├── MappingEditorModal.tsx  # tMap 시각적 매핑 에디터
        │       └── SchemaTree.tsx          # 스키마 브라우저 트리
        └── pages/
            ├── DashboardPage.tsx
            ├── ConnectionsPage.tsx
            ├── ProjectsPage.tsx
            ├── ProjectDetailPage.tsx
            ├── JobDesignerPage.tsx        # 메인 캔버스 페이지
            └── ExecutionsPage.tsx
```

---

## 4. 주요 기술 스택

| 구분      | 기술                                | 버전                     |
| --------- | ----------------------------------- | ------------------------ |
| Backend   | Spring Boot (Kotlin)                | 3.3.5                    |
| Backend   | Kotlin                              | 1.9.25                   |
| Backend   | Java (런타임)                       | 21 (VS Code redhat 확장) |
| Backend   | Gradle                              | 8.14                     |
| Backend   | Spring Data JPA + Hibernate         | 6.5.x                    |
| Backend   | Flyway (DB 마이그레이션)            | 포함                     |
| Backend   | Spring Security Crypto (AES 암호화) | 포함                     |
| Meta DB   | PostgreSQL (Docker)                 | 16, 포트 5433            |
| Target DB | PostgreSQL (로컬)                   | 18, 포트 5432            |
| Frontend  | React                               | 18.3.1                   |
| Frontend  | TypeScript                          | 5.6.3                    |
| Frontend  | Vite                                | 5.4.11                   |
| Frontend  | @xyflow/react (React Flow)          | 12.3.2                   |
| Frontend  | Zustand                             | 5.0.1                    |
| Frontend  | Tailwind CSS                        | 3.4.15                   |
| Frontend  | Monaco Editor                       | 4.6.0                    |
| Frontend  | Axios                               | 1.7.7                    |
| Frontend  | React Router DOM                    | 6.28.0                   |

---

## 5. API 엔드포인트

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

> **주의**: 초기 구현 시 `/api/schema/{id}/tables` 로 잘못 설정되어 있었음. 현재는 위 URL로 수정 완료.

### Project / Job API

| Method         | URL                                       | 설명               |
| -------------- | ----------------------------------------- | ------------------ |
| GET/POST       | `/api/projects`                           | 프로젝트 목록/생성 |
| GET/PUT/DELETE | `/api/projects/{id}`                      | 프로젝트 CRUD      |
| GET/POST       | `/api/projects/{id}/jobs`                 | 잡 목록/생성       |
| GET/PUT/DELETE | `/api/projects/{id}/jobs/{jobId}`         | 잡 CRUD            |
| POST           | `/api/projects/{id}/jobs/{jobId}/publish` | 잡 게시            |

### Execution API

| Method | URL                     | 설명    |
| ------ | ----------------------- | ------- |
| POST   | `/api/jobs/{jobId}/run` | 잡 실행 |

### AI Agent (프론트엔드 직접 호출 - 백엔드 경유 없음)

| 공급자           | Endpoint                                                                          | 비고                                                |
| ---------------- | --------------------------------------------------------------------------------- | --------------------------------------------------- |
| Anthropic Claude | `https://api.anthropic.com/v1/messages`                                           | `anthropic-dangerous-allow-browser: true` 헤더 필요 |
| OpenAI           | `https://api.openai.com/v1/chat/completions`                                      | Bearer 토큰 인증                                    |
| Google Gemini    | `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | URL 쿼리 파라미터로 키 전달                         |
| xAI Grok         | `/xai-proxy/v1/chat/completions` → `https://api.x.ai`                             | Vite 프록시 경유 (CORS 우회), OpenAI 호환 포맷      |

---

## 6. 구현된 기능

### 6-1. 대시보드

- 통계 카드 (커넥션 수, 프로젝트 수, 잡 수, 최근 실행 상태)
- 최근 프로젝트 카드 목록
- 활성 커넥션 목록

### 6-2. 커넥션 관리

- CRUD (생성/조회/수정/삭제)
- DB 타입: POSTGRESQL, ORACLE, MARIADB
- 비밀번호 AES 암호화 저장
- 연결 테스트 (ConnectionTestResult: success, message, durationMs)
- SSL, JDBC URL Override 지원

### 6-3. 프로젝트/잡 관리

- 프로젝트 CRUD (카드 그리드 UI)
- 프로젝트별 잡 목록 (DRAFT/PUBLISHED 상태)
- 잡 생성/삭제/게시

### 6-4. Job Designer (메인 기능)

#### 캔버스

- React Flow DAG 캔버스 (드래그&드롭, 노드 연결)
- 노드 상태 표시 (idle/running/success/failed - 색상 코딩)
- MiniMap, 그리드 배경
- Delete / Backspace 키로 선택된 노드/엣지 삭제

#### 컴포넌트 팔레트 (좌측)

드래그 가능한 ETL 컴포넌트:

- **INPUT**: T_JDBC_INPUT, T_FILE_INPUT
- **TRANSFORM**: T_MAP, T_FILTER_ROW, T_AGGREGATE_ROW, T_SORT_ROW, T_JOIN, T_CONVERT_TYPE, T_REPLACE, T_UNION_ROW
- **OUTPUT**: T_JDBC_OUTPUT, T_FILE_OUTPUT
- **CONTROL**: T_PRE_JOB, T_POST_JOB, T_RUN_JOB, T_SLEEP
- **UTILITY**: T_LOG_ROW, T_DIE, T_VALIDATE, T_PROFILE, T_LINEAGE

#### 속성 패널 (우측)

- T_JDBC_INPUT: Connection 선택, 테이블 선택(Picker), Custom Query, 컬럼 미리보기
- T_JDBC_OUTPUT: Connection 선택, 테이블 선택, Write Mode (INSERT/UPSERT/UPDATE/DELETE/TRUNCATE_INSERT)
- T_MAP: 더블클릭 힌트 + JSON 매핑 편집기
- T_FILTER_ROW: Filter Expression
- T_AGGREGATE_ROW: Group By + 집계 함수 JSON
- T_JOIN: Join Type + Join Condition
- T_SORT_ROW: Sort Columns JSON
- 각 컴포넌트: 예제 JSON 다운로드 버튼
- textarea: resize-y (자유 크기 조절)

#### 테이블 선택 (TablePickerModal)

- 커넥션의 전체 테이블 목록 조회 (스키마별 그룹)
- 검색 필터
- 더블클릭 즉시 선택
- 테이블 클릭 시 컬럼 정보 백그라운드 프리페치
- 선택 확정 시 tableName + schemaName + columns 한 번에 노드 config에 저장 (`onChange('__raw', ...)` 패턴)

#### 컬럼 자동 로드 (useAutoFetchColumns 훅)

- connectionId + tableName 설정 시 columns가 없으면 600ms debounce 후 자동 API 호출
- 저장된 잡 불러올 때도 동작 (기존 columns 있으면 스킵)

#### tMap 매핑 에디터 (MappingEditorModal)

- T_MAP 노드 더블클릭으로 열림
- 좌측: 연결된 Input 노드들의 소스 컬럼 (노드별 색상 구분)
- 우측: Target 매핑 행 (Source Column, Target Name, Expression, Type)
- 소스 컬럼 클릭 → 타겟 행 클릭으로 매핑 연결
- **Auto Map**: 전체 소스 컬럼 자동 매핑 + 타입 기반 Expression 자동 생성
  - VARCHAR계열 → `TRIM(col)`
  - `_id`/`_cd`/`_code` 접미사 → `UPPER(TRIM(col))`
  - NUMERIC/INT/DECIMAL계열 → `COALESCE(col, 0)`
  - DATE계열 → `CAST(col AS DATE)`
  - TIMESTAMP계열 → 컬럼명 그대로
- 노드 config.columns 캐시 우선 사용 (API 재호출 최소화)
- JSON 다운로드

#### Schema Browser (우측 하단, 접기/펼치기)

- 캔버스 노드의 connectionId + tableName 스캔
- 노드 config.columns 있으면 즉시 표시 (API 호출 없음)
- 컬럼 정보 없으면 테이블 클릭 시 지연 로드
- DB 타입별 색상 (PG: 파랑, Oracle: 보라, MariaDB: 초록)
- PK 아이콘 표시

#### 하단 패널 (기본 탭: SQL View)

- **SQL View**: T_JDBC_INPUT `SELECT`, T_JDBC_OUTPUT `INSERT`, 필터/집계 조건 표시. Monaco Editor (읽기 전용, SQL 하이라이팅). 기본으로 열려있음.
- **Execution Logs**: 실행 결과, 오류 메시지, 노드별 처리 행 수
- **Job Summary**: 잡 구성 요약 통계 (총 노드 수, 카테고리별 분류, 데이터 흐름, 타입별 상세)

#### 노드 UI 개선

- T_JDBC_OUTPUT 노드에 Write Mode 배지 표시 (INSERT / UPSERT 등)
- 노드 선택 시 상단에 NodeToolbar 표시 (React Flow 포털 렌더링으로 드래그 이벤트 충돌 없음)
  - `+` 버튼: 노드 복제 (동일 타입, 위치 +30 offset)
  - `−` 버튼: 노드 삭제 (deleteElements)

#### 엣지 실행 결과 표시

- 실행 완료 후 각 엣지(연결선)에 처리 행 수 및 시간 표시: `1,234 rows · 320ms`
- 색상 규칙:
  - 실행 중: 파란색 animated 엣지
  - rows > 0: 초록색 (`#3fb950`)
  - rows = 0 + JOB FAILED: 빨간색 + `(error)` 텍스트
  - rows = 0 + JOB SUCCESS: 초록색 (정상, error 표기 없음)
  - 실행 오류(catch): 전체 엣지 빨간색

#### Schema Browser

- 높이 마우스 드래그로 조절 (80px ~ 600px, document-level mousemove/mouseup)

#### 속성 패널

- 너비 260px → 300px
- 컬럼 미리보기 영역 폰트 크기 2단계씩 확대
- JSON textarea: `resize-none` → `resize-y`

#### 실행

- Preview Mode 체크박스 (100행 제한 미리보기)
- Run 버튼 → IR 저장 → `/api/jobs/{id}/run` 호출
- 실행 중 노드 상태 표시 (running/success/failed)

### 6-5. AI Agent

#### AI Agent 패널 (우측 슬라이드, AiAgentPanel.tsx)

- **지원 공급자**: Claude (Anthropic), ChatGPT (OpenAI), Gemini (Google), Grok (xAI)
- **지원 모델**:
  - Claude: Sonnet 4.6, Opus 4.6, Haiku 4.5
  - OpenAI: GPT-4o, GPT-4o mini, GPT-4 Turbo
  - Gemini: 2.5 Flash, 2.5 Flash Lite, 2.0 Flash
  - Grok: Grok 3, Grok 3 Mini, Grok 2
- 공급자/모델 드롭다운 선택 (전환 시 에러 상태 자동 초기화)
- API 키 미설정 시 경고 배너 표시
- 채팅 히스토리 (멀티턴 대화 유지), 대화 초기화 버튼
- Enter 전송, Shift+Enter 줄바꿈
- 최신 AI 응답 메시지에 파란 리플 테두리 하이라이트 (hover 시 해제)

#### JSON 코드 블록 렌더링 (JsonBlock / CodeBlock)

- AI 응답 내 ` ```json ``` ` 블록을 접힌 상태로 렌더링 (기본 최소화)
- 헤더 클릭으로 펼치기/접기, 내용 요약 표시 (노드 N개·엣지 M개 / 수정 제안 N개 노드)
- **다중 블록 지원**: `CodeBlock`이 재귀 처리하여 응답 내 JSON 블록이 여러 개여도 모두 정상 렌더링

#### 새 파이프라인 생성 (extractGraphSpec)

- `{ nodes[], edges[] }` 포맷 감지 → "캔버스에 적용" 초록 버튼
- 버튼 클릭 시 노드+엣지를 캔버스에 자동 배치
- T_JDBC_INPUT/OUTPUT 노드에 columnMap 데이터 자동 주입

#### 기존 파이프라인 패치 (extractPatchSpec)

- `{ "action": "patch", "patches": [...] }` 포맷 감지 → 보라색 "파이프라인에 적용" 버튼
- 전체 코드 블록 순서대로 탐색 (첫 번째 블록이 patch가 아니어도 올바르게 감지)
- 패치 항목별 nodeId, 수정 키, reason 표시
- 적용 클릭 시: 해당 노드 config 부분 업데이트 + "적용 완료" 상태 전환 + 수정 항목 요약 표시

#### DB 커넥션 컨텍스트 주입

- 패널 상단에서 커넥션 선택 → 테이블 목록 + 전체 컬럼 병렬 로드
- 로드된 스키마를 AI 시스템 프롬프트에 자동 주입 (테이블명, 컬럼명·타입·PK·NN)

#### 파이프라인 IR 컨텍스트 주입

- 현재 캔버스의 노드/엣지 구조를 AI 시스템 프롬프트에 주입
- columns 배열은 토큰 절약을 위해 개수만 전달 (`[N columns loaded]`)
- AI가 patch 응답 시 정확한 nodeId 사용 가능

#### 실행 결과 컨텍스트 주입

- 실행 결과(status, nodeResults, logs, errorMessage)를 AI 시스템 프롬프트에 주입
- 헤더에 실행 상태 배지 표시 (✓ 실행완료 / ✗ 실행실패)

#### 빠른 질문 버튼 (상황별)

| 상태               | 버튼                                                       |
| ------------------ | ---------------------------------------------------------- |
| 실행 전            | 파이프라인 검토 / SQL 최적화 / 검증 단계 추가              |
| 실행 실패(FAILED)  | 에러 원인 분석 / 파이프라인 검토 / **자동 수정 (활성)**    |
| 실행 성공(SUCCESS) | 결과 분석 / 최적화 제안 / ~~자동 수정 (비활성, disabled)~~ |

- **결과 분석**: 실행 결과 + 파이프라인 구조 종합 분석. 문제 발견 시 patch JSON 자동 포함
- **자동 수정**: JOB FAILED 시에만 활성화. SUCCESS 시 disabled(회색, tooltip 표시)

#### AI 토글 버튼

- `ai.png` 이미지 사용 (Vite `public/` 정적 자산으로 제공)
- 위치: 우측 패널 왼쪽 상단 영역 (`top-[38%]`)
- 패널 닫힌 상태: `w-12 h-20` 크기, ai.png 이미지 표시
- 패널 열린 상태: `w-3 h-16` 얇은 세로 띠로 축소 (이미지 숨김)
- 슬라이드 애니메이션: `transition-all duration-300 ease-in-out`

#### AI 시스템 프롬프트 구조 (SYSTEM_PROMPT in api/ai.ts)

| 섹션                        | 역할                                                                            |
| --------------------------- | ------------------------------------------------------------------------------- |
| Response Style              | 간결 응답 규칙 (3문장 이내, 불릿, 불필요 문구 금지)                             |
| 1. New Pipeline Design      | `{ nodes[], edges[] }` 포맷 출력 규칙                                           |
| 2. Existing Pipeline Fix    | 분석 + patch JSON 동시 출력 규칙, nodeId 규칙                                   |
| 3. Result Analysis & Review | 결과 분석 규칙, 의심 결과 플래그 필수 (0-row, 불일치 등), fixable 시 patch 포함 |
| 4. Error Analysis           | FAILED 시 원인·영향노드·수정 포맷, patch JSON 자동 첨부                         |

### 6-6. 실행 이력

- 마지막 실행 결과 표시 (ExecutionsPage)

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
          {
            "columnName": "emp_id",
            "dataType": "bigserial",
            "isPrimaryKey": true,
            "nullable": false
          }
        ],
        "query": ""
      },
      "inputPorts": [],
      "outputPorts": []
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
  "context": {}
}
```

---

## 8. 주요 버그 수정 이력

### [BUG-01] Schema API URL 불일치

- **증상**: 테이블 조회 시 "No static resource api/schema/..." 오류
- **원인**: 프론트엔드 `/api/schema/{id}/tables` 호출, 백엔드는 `/api/connections/{id}/schema/tables`
- **수정**: `frontend/src/api/index.ts` URL 및 응답 파싱 수정 (`.tables`, `.columns` 필드 추출)

### [BUG-02] 테이블 선택 시 tableName 미적용

- **증상**: TablePickerModal에서 테이블 선택해도 노드에 반영 안 됨
- **원인**: `onChange` 3회 연속 호출 시 각 호출이 원본 config snapshot 기준으로 덮어써 마지막 호출만 적용
- **수정**: `onChange('__raw', { ...config, tableName, schemaName, columns })` 단일 호출로 변경

### [BUG-03] 컬럼 조회 빈 결과

- **증상**: `getTableSchema` API 호출 시 columns 빈 배열 반환
- **원인**: `SchemaService.kt`에서 모든 DB 타입에 `tableName.uppercase()` 적용 → PostgreSQL은 소문자 저장이므로 "EMPLOYEE" 매칭 실패
- **수정**: Oracle만 대문자 변환, PostgreSQL/MariaDB는 원본 케이스 유지

### [BUG-04] 순환 의존성

- **증상**: 백엔드 기동 실패 (Circular dependency)
- **원인**: `ConnectionService` → `SchemaService` → `ConnectionService`
- **수정**: `ConnectionService`에서 사용하지 않는 `SchemaService` 주입 제거

---

## 9. 미구현 / 향후 과제

- [ ] T_FILE_INPUT / T_FILE_OUTPUT 구현
- [ ] SQL Pushdown 실행 엔진 완성 (SqlPushdownAdapter 로직)
- [ ] 잡 스케줄링 (cron 기반 자동 실행)
- [ ] 실행 이력 목록 페이지 (현재 마지막 실행만 표시)
- [ ] 사용자 인증/권한 관리
- [ ] 데이터 프리뷰 (100행 미리보기 결과 표시)
- [ ] T_MAP Expression 유효성 검사
- [ ] 잡 버전 관리 (현재 단일 버전)
- [ ] 다중 Output 포트 (REJECT 라인)
- [ ] 폴더 구조 (folders 테이블 존재, UI 미구현)
- [ ] Oracle / MariaDB 실 연결 테스트
- [ ] AI Agent: 백엔드 프록시 구현 (현재 프론트엔드에서 직접 호출 → CORS/키 노출 위험)
- [ ] AI Agent: Grok 프로덕션 배포 시 서버사이드 프록시 전환 (현재 Vite dev 프록시만 지원)

---

## 10. 알려진 이슈 / 참고사항

- **React Router 경고**: `v7_relativeSplatPath` future flag 미설정 경고 (동작에 무관)
- **Vite 포트**: `vite.config.ts`에 3000으로 설정되어 있으나 실제 3001로 기동됨 (포트 충돌 시 자동 증가)
- **Oracle JDBC**: `ojdbc11:23.4.0.24.05` 의존성 포함되어 있으나 실제 Oracle DB 연결 미테스트
- **암호화**: 커넥션 비밀번호는 AES로 암호화 저장. 환경변수 `ENCRYPTION_SECRET` 미설정 시 `default-dev-secret-change-in-prod` 사용 (프로덕션 시 반드시 변경)
- **SchemaService**: PostgreSQL `tableName.uppercase()` 버그 수정으로 정상 동작. Oracle은 별도 테스트 필요
- **컬럼 정보 저장**: 노드 config의 `columns` 필드에 `ColumnInfo[]` 저장됨 (IR로 직렬화되어 잡 저장/불러오기 시 유지)
- **AI API 키 보안**: 현재 Vite env로 브라우저에 노출됨. 프로덕션 전 백엔드 프록시 전환 필요
- **ai.png 경로**: Vite 정적 자산은 `public/` 폴더 기준 `/ai.png`로 접근. `img/` 폴더의 원본은 별도 복사 필요
- **Grok CORS**: `api.x.ai` CORS 미지원으로 Vite 프록시 경유. `vite.config.ts` 변경 후 `npm run dev` 재시작 필수
- **NodeToolbar (React Flow v12)**: 노드 내부 DOM에 버튼 배치 시 React Flow 네이티브 드래그 이벤트와 충돌 발생. NodeToolbar 포털 렌더링으로 해결
- **extractPatchSpec/extractGraphSpec**: 응답 내 첫 번째 JSON 블록만 검사하면 다중 블록 응답에서 patch 감지 실패. 전체 블록 순회(`regex.exec` 루프)로 수정 완료

---

## 11. 변경 이력

### 2026-03-06

#### Job Designer 캔버스 개선

- **T_LOG_ROW 양방향 연결**: TOS 설계 기준 passthrough 컴포넌트(T_LOG_ROW)는 Input/Output 핸들 모두 표시. T_DIE만 Output 전용 유지
- **NodeToolbar 추가**: 노드 선택 시 복제(+)/삭제(−) 버튼 표시. React Flow 포털로 렌더링하여 드래그 이벤트 충돌 완전 해소
- **엣지 실행 결과 표시**: 실행 중 animated 파란 엣지, 완료 후 row수·시간을 엣지 레이블로 표시 (rows>0 초록, JOB FAIL+0row 빨간+error)
- **Schema Browser 드래그 리사이즈**: 구분선 드래그로 높이 80~600px 자유 조절
- **속성 패널 너비**: 260px → 300px, 컬럼 미리보기 폰트 2단계 확대
- **Delete/Backspace 키**: 선택된 노드/엣지 삭제 (`deleteKeyCode` 설정)

#### AI Agent 전면 개편

- **Grok (xAI) 공급자 추가**: Grok 3 / 3 Mini / 2, Vite 프록시(`/xai-proxy`)로 CORS 해결
- **공급자 전환 시 에러 초기화**: provider/model 변경 시 기존 오류 메시지 자동 클리어
- **파이프라인 IR 컨텍스트**: 현재 캔버스 노드/엣지를 AI에게 전달 (columns는 개수만)
- **실행 결과 컨텍스트**: 실행 로그·nodeResults·오류를 AI에게 전달
- **patch 포맷 지원**: AI가 `{ "action": "patch", "patches": [...] }` 형식으로 응답 시 보라색 "파이프라인에 적용" 버튼 표시
- **patch 적용 피드백**: 적용 후 "적용 완료" 상태 전환 + 수정 항목 요약 표시
- **다중 JSON 블록 렌더링**: `CodeBlock` 재귀 처리, `extractPatchSpec/extractGraphSpec` 전체 블록 탐색
- **빠른 질문 버튼 재설계**: 상황별(실행전/FAILED/SUCCESS) 버튼 세트. 자동 수정은 FAILED 시만 활성화
- **최신 메시지 하이라이트**: 응답 도착 시 메시지 버블에 conic-gradient 회전 테두리 + 리플 애니메이션. hover 시 해제
- **시스템 프롬프트 개선**: 간결 응답 강제, 의심 결과 플래그 필수, 분석+patch 동시 출력 규칙

### 2026-03-08

#### 전체 UI 라이트 테마 전환 (AWS Glue Studio 스타일)

**배경 및 목표**

- 기존 전체 다크 테마 → 사이드바·하단 터미널 제외한 모든 UI를 라이트 테마로 전환
- 참조 이미지: AWS Glue Studio (밝은 캔버스, 흰 패널, 어두운 좌측 사이드바)
- 하단 터미널(SQL View / Execution Logs / Job Summary)은 **다크 유지** (사용자 명시 요청)

**라이트 테마 컬러 팔레트**
| 용도 | 색상 |
|------|------|
| 캔버스 배경 | `#f8fafc` |
| 패널 배경 | `#ffffff` |
| 서브 배경 | `#f8fafc` |
| 보더 | `#e2e8f0` |
| 기본 텍스트 | `#0f172a` |
| 보조 텍스트 | `#64748b` |
| 뮤트 텍스트 | `#94a3b8` |
| 액센트 블루 | `#2563eb` |
| 성공 그린 | `#16a34a` |
| 보라 (적용버튼) | `#7c3aed` |
| 터미널/사이드바 | `#232b37` |

**수정된 파일 목록 및 변경 내용**

`frontend/src/index.css`

- `.react-flow__background` dark 오버라이드 제거 (기존 `#0d1117 !important` → 삭제)
- `.react-flow__edge-path` stroke: `#58a6ff` → `#2563eb`
- `.react-flow__edge.selected` stroke: `#79c0ff` → `#1d4ed8`
- > **주의**: index.css에 `!important` 글로벌 오버라이드가 있어 인라인 style보다 우선 적용됨. 캔버스 배경색 변경 시 이 파일을 함께 수정해야 함.

`frontend/src/pages/JobDesignerPage.tsx`

- ReactFlow 래퍼 div에 CSS 도트 패턴 배경 직접 적용 (`radial-gradient`): `#dde1e7`, 간격 `12px`
  - `<Background>` 컴포넌트 제거 → 래퍼 div의 CSS 배경으로 대체 (캔버스 패닝/줌과 무관하게 고정)
- ReactFlow `style` → `background: "transparent"` (래퍼 배경 비침)
- MiniMap maskColor: `rgba(13,17,23,0.8)` → `rgba(240,244,248,0.8)`
- 엣지 defaultEdgeOptions stroke: `#58a6ff` → `#2563eb`
- irToFlow 엣지 labelBgStyle `fill`: `#0d1117` → `#ffffff`
- 우측 패널: 다크 배경 → 흰 배경, 보더 `#e2e8f0`
- AI 토글 버튼: 다크 보라 → 연한 인디고 (`#e0e7ff`)
- ContextVarsPanel: 다크 → 라이트, Context 변수 강조색 `#ef4444`
- 하단 터미널 패널: `#161b27` → `#232b37`, 내부 카드: `#0d1117` → `#1a2233`

`frontend/src/components/job/ComponentPalette.tsx`

- 컨테이너: 다크 배경 → `#ffffff`, 보더 `#e2e8f0`
- 검색 입력: 다크 → `#f8fafc` 배경, `#d1d5db` 보더
- 컴포넌트 그룹 헤더 색상: 다크 계열 → 라이트 계열 (INPUT `#16a34a`, TRANSFORM `#2563eb`, OUTPUT `#ea580c`, ORCHESTRATION `#7c3aed`, LOGS `#ca8a04`)
- 아이콘 배경: 다크 (`#0f2d1a` 등) → 라이트 (`#f0fdf4` 등)
- Context 변수 그룹: `#2d0f0f` → `#fef2f2`, 텍스트 `#f85149` → `#ef4444`

`frontend/src/components/job/CustomNodes.tsx`

- `GROUP_COLORS` 전면 교체: 다크 → 라이트
  ```typescript
  INPUT:         { bg: '#f0fdf4', border: '#86efac', icon: '#16a34a', text: '#15803d' }
  TRANSFORM:     { bg: '#eff6ff', border: '#93c5fd', icon: '#2563eb', text: '#1d4ed8' }
  OUTPUT:        { bg: '#fff7ed', border: '#fdba74', icon: '#ea580c', text: '#c2410c' }
  ORCHESTRATION: { bg: '#faf5ff', border: '#d8b4fe', icon: '#7c3aed', text: '#6d28d9' }
  LOGS:          { bg: '#fefce8', border: '#fde047', icon: '#ca8a04', text: '#a16207' }
  ```
- STATUS_COLORS: running `#2563eb`, success `#16a34a`, failed `#dc2626`
- NodeToolbar 버튼: 흰 배경, 라이트 보더
- writeMode 배지: 라이트 오렌지

`frontend/src/components/job/PropertiesPanel.tsx`

- 헤더: 흰 배경, `#0f172a` 텍스트
- 모든 textarea/input: 다크 배경 → `#f8fafc`, `#d1d5db` 보더, `#0f172a` 텍스트
- 컬럼 리스트: 다크 → `#f8fafc` 배경
- MapConfig 힌트박스: 다크 → `#eff6ff` 배경, `#bfdbfe` 보더
- 삭제 버튼 hover: `#fef2f2` 배경, `#dc2626` 텍스트
- > **버그 수정**: onMouseLeave 핸들러 뒤에 `>` 누락으로 구문 오류 발생 → 수정 완료

`frontend/src/components/job/AiAgentPanel.tsx`

- 컨테이너: 흰 배경, `#e2e8f0` 보더
- 채팅 버블: user `#2563eb` 파란 배경, assistant `#f1f5f9` 연회색
- 입력창: `#f8fafc` 배경, focus시 `#2563eb` 보더
- 전송 버튼: `#238636` → `#2563eb`
- Quick action 버튼: 다크 → 라이트

`frontend/src/components/job/SchemaTree.tsx`

- DB 타입 색상: PG `#2563eb`, Oracle `#7c3aed`, MariaDB `#16a34a`
- DB 타입 배경: PG `#eff6ff`, Oracle `#faf5ff`, MariaDB `#f0fdf4`
- hover: `#f8fafc`
- 컬럼명: `#64748b`, PK 아이콘: `#ca8a04`, 점 인디케이터: `#cbd5e1`

`frontend/src/components/job/TablePickerModal.tsx`

- 검색입력, 테이블 리스트, 스키마 헤더 전체 라이트화
- 선택 행: `#eff6ff`, VIEW 배지: 라이트 보라, 확인 버튼: `#16a34a`

`frontend/src/components/job/MappingEditorModal.tsx`

- ROW_COLORS: GitHub 다크 계열 → 라이트 계열 (`#2563eb`, `#16a34a`, `#7c3aed` 등)
- 입력 필드: 다크 투명 → 라이트 텍스트 (`#374151`)
- Expression 입력: `#bc8cff` → `#7c3aed`
- Type 셀렉트: `#8b949e` → `#64748b`
- 삭제 버튼 hover: `#fef2f2` 배경, `#dc2626` 텍스트
- Add Row 버튼: `#eff6ff` hover, `#2563eb` 텍스트
- 경고 배너: `#2d2000` → `#fffbeb`
- 푸터: `#0d1117` → `#f8fafc` 배경
- Apply 버튼: `#232b37` (사이드바와 동일 색상 통일)

`frontend/src/components/layout/Sidebar.tsx`

- 사이드바 배경: `#0b1628` → `#232b37`

**캔버스 배경 고정 방식 (중요)**

- React Flow `<Background>` 컴포넌트는 캔버스 뷰포트를 따라 이동/스케일됨
- 고정 배경을 원할 경우: `<Background>` 제거 + 래퍼 div에 CSS `radial-gradient` 적용
- 현재 설정: `radial-gradient(circle, #dde1e7 1px, transparent 1px)`, `backgroundSize: 12px 12px`

### 2026-03-07

#### Trigger 최소 구현 (On Component Ok / On Component Error)

- **IR**: `TriggerCondition { ON_OK, ON_ERROR }` enum 추가, `EdgeIR.triggerCondition` 필드 추가
- **실행 엔진**: TRIGGER 엣지 존재 시 `hasTriggerEdges` 모드 — 노드 실패 시 즉시 중단 대신 ON_ERROR 경로 계속 실행; `checkTriggerCondition()` 함수로 조건 체크
- **프론트엔드**: 우클릭 컨텍스트 메뉴 → "On Component Ok" / "On Component Error" 선택 → pendingTrigger 상태 → 대상 노드 클릭 시 점선 TRIGGER 엣지 생성 (초록=OK, 빨강=ERROR); ESC 취소

#### Transaction Control 도입 (T_DB_COMMIT / T_DB_ROLLBACK)

**배경**: 현재 Output 노드가 각자 독립 Connection + 즉시 commit 방식이라 다중 테이블 적재 시 원자성 보장 불가.

**구현 내용**

- **`backend/src/main/kotlin/com/platform/etl/ir/JobIR.kt`**
  - `ComponentType` enum에 `T_DB_COMMIT`, `T_DB_ROLLBACK` 추가 (Orchestration → Transaction Control 섹션)

- **`backend/src/main/kotlin/com/platform/etl/execution/SqlPushdownAdapter.kt`**
  - `execute()`: 트랜잭션 모드 자동 감지 (T_DB_COMMIT/ROLLBACK 노드 존재 시 활성화), `sharedConnections: MutableMap<String, java.sql.Connection>?` 생성, 오류 시 rollback, `finally`에서 close
  - `executeNode()`: `sharedConnections` 파라미터 추가. T_DB_COMMIT → commit all, T_DB_ROLLBACK → rollback all, Preview Mode → SKIPPED
  - `executeOutputNode()`: `sharedConnections` 분기 — 트랜잭션 모드 시 공유 커넥션 재사용 + commit 보류, 일반 모드 시 기존 동작 유지

- **`frontend/src/types/index.ts`**: `ComponentType`에 `'T_DB_COMMIT' | 'T_DB_ROLLBACK'` 추가

- **`frontend/src/components/job/ComponentPalette.tsx`**: Orchestration 그룹에 DB Commit (초록), DB Rollback (빨강) 추가

- **`frontend/src/components/job/CustomNodes.tsx`**:
  - `getGroupColors()`: T_DB_COMMIT → 초록 계열, T_DB_ROLLBACK → 빨강 계열
  - `isOutput`: T_DB_ROLLBACK 추가 (터미널 노드 — Output 핸들 없음)
  - `ComponentIcon`: T_DB_COMMIT (체크마크), T_DB_ROLLBACK (undo 화살표) 아이콘 추가

**동작 방식**

- 트랜잭션 모드: Job IR에 T_DB_COMMIT/ROLLBACK이 하나라도 있으면 활성화
- 일반 모드와 완전 하위 호환 (T_DB_COMMIT/ROLLBACK 없으면 기존 노드별 즉시 commit)
- Preview Mode: T_DB_COMMIT/ROLLBACK 모두 SKIPPED (No-op)
- 오류 발생 시: 공유 커넥션 전체 자동 rollback 후 FAILED 반환

#### Trigger 기능 보완 (ROW 연쇄 SKIP / 노드 핸들 / CTE 수정 / 점선 유지)

**ROW 연쇄 SKIP**

- **문제**: A→[ON_OK]→B→[ROW]→C 구조에서 B가 SKIP되어도 C가 실행됨
- **수정**: `SqlPushdownAdapter.checkTriggerCondition()`에 ROW 소스 SKIP 체크 추가
  - 모든 ROW 소스가 SKIPPED이면 해당 노드도 SKIP (데이터 없으므로)

**Input 노드 핸들 수정**

- **문제**: T_JDBC_INPUT, T_FILE_INPUT에 target 핸들이 없어 T_PRE_JOB에서 trigger 연결 불가
- **수정**: `CustomNodes.tsx`의 `isInput`을 `T_PRE_JOB`만으로 한정 (Input 노드는 양방향 핸들)

**SQL Compiler CTE 오류 수정**

- **문제**: TRIGGER 엣지가 데이터 predecessor로 포함되어 `relation "cte_t_jdbc_output_..." does not exist` 오류
- **수정**: `SqlPushdownCompiler.compile()`에서 `incomingEdges`를 `LinkType.ROW`만 필터링

**Trigger 엣지 점선 스타일 유지**

- **문제**: Job 실행 후 TRIGGER 엣지의 점선이 실선으로 변경됨
- **수정**: `JobDesignerPage.tsx`의 3개 `setEdges` 위치(시작/완료/에러)에서 TRIGGER 엣지 스타일 보존 로직 추가

**T_LOG_ROW 데이터 캡처**

- **기능**: T_LOG_ROW 컴포넌트가 실제 데이터 행을 캡처하여 "Row Logs" 탭에 표시
- **구현**: `executeLogRowNode()` — BFS로 상위 Input 노드 탐색 → LIMIT 100 샘플 쿼리 실행 → LogRowData(columns, rows)
- **UI**: 하단 패널에 "Row Logs" 탭 추가, 다중 LOG_ROW 노드 간 탭 전환 지원
