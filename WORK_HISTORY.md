# ETL Platform - Work History & Reference

> 최종 업데이트: 2026-03-05

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

# 기본 제공사 선택: claude | openai | gemini
VITE_AI_DEFAULT_PROVIDER=gemini
```

> `frontend/.env.example` 참고. `.env`는 git에 커밋하지 않을 것.

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

| 구분 | 기술 | 버전 |
|------|------|------|
| Backend | Spring Boot (Kotlin) | 3.3.5 |
| Backend | Kotlin | 1.9.25 |
| Backend | Java (런타임) | 21 (VS Code redhat 확장) |
| Backend | Gradle | 8.14 |
| Backend | Spring Data JPA + Hibernate | 6.5.x |
| Backend | Flyway (DB 마이그레이션) | 포함 |
| Backend | Spring Security Crypto (AES 암호화) | 포함 |
| Meta DB | PostgreSQL (Docker) | 16, 포트 5433 |
| Target DB | PostgreSQL (로컬) | 18, 포트 5432 |
| Frontend | React | 18.3.1 |
| Frontend | TypeScript | 5.6.3 |
| Frontend | Vite | 5.4.11 |
| Frontend | @xyflow/react (React Flow) | 12.3.2 |
| Frontend | Zustand | 5.0.1 |
| Frontend | Tailwind CSS | 3.4.15 |
| Frontend | Monaco Editor | 4.6.0 |
| Frontend | Axios | 1.7.7 |
| Frontend | React Router DOM | 6.28.0 |

---

## 5. API 엔드포인트

### Connection API
| Method | URL | 설명 |
|--------|-----|------|
| GET | `/api/connections` | 커넥션 목록 |
| GET | `/api/connections/{id}` | 커넥션 상세 |
| POST | `/api/connections` | 커넥션 생성 |
| PUT | `/api/connections/{id}` | 커넥션 수정 |
| DELETE | `/api/connections/{id}` | 커넥션 삭제 |
| POST | `/api/connections/{id}/test` | 연결 테스트 |

### Schema API
| Method | URL | 설명 |
|--------|-----|------|
| GET | `/api/connections/{id}/schema/tables` | 테이블 목록 조회 |
| GET | `/api/connections/{id}/schema/tables/{tableName}?schema=` | 컬럼 정보 조회 |

> **주의**: 초기 구현 시 `/api/schema/{id}/tables` 로 잘못 설정되어 있었음. 현재는 위 URL로 수정 완료.

### Project / Job API
| Method | URL | 설명 |
|--------|-----|------|
| GET/POST | `/api/projects` | 프로젝트 목록/생성 |
| GET/PUT/DELETE | `/api/projects/{id}` | 프로젝트 CRUD |
| GET/POST | `/api/projects/{id}/jobs` | 잡 목록/생성 |
| GET/PUT/DELETE | `/api/projects/{id}/jobs/{jobId}` | 잡 CRUD |
| POST | `/api/projects/{id}/jobs/{jobId}/publish` | 잡 게시 |

### Execution API
| Method | URL | 설명 |
|--------|-----|------|
| POST | `/api/jobs/{jobId}/run` | 잡 실행 |

### AI Agent (프론트엔드 직접 호출 - 백엔드 경유 없음)
| 공급자 | Endpoint | 비고 |
|--------|----------|------|
| Anthropic Claude | `https://api.anthropic.com/v1/messages` | `anthropic-dangerous-allow-browser: true` 헤더 필요 |
| OpenAI | `https://api.openai.com/v1/chat/completions` | Bearer 토큰 인증 |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | URL 쿼리 파라미터로 키 전달 |

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

#### 노드 실행 결과 표시
- 실행 완료 후 각 노드에 처리 행 수 및 실행 시간 표시: `1,234 rows in 320ms`
- T_JDBC_OUTPUT 노드에 Write Mode 배지 표시 (INSERT / UPSERT 등)

#### 실행
- Preview Mode 체크박스 (100행 제한 미리보기)
- Run 버튼 → IR 저장 → `/api/jobs/{id}/run` 호출
- 실행 중 노드 상태 표시 (running/success/failed)

### 6-5. AI Agent

#### AI Agent 패널 (우측 슬라이드, AiAgentPanel.tsx)
- **지원 공급자**: Claude (Anthropic), ChatGPT (OpenAI), Gemini (Google)
- **지원 모델**:
  - Claude: Sonnet 4.6, Opus 4.6, Haiku 4.5
  - OpenAI: GPT-4o, GPT-4o mini, GPT-4 Turbo
  - Gemini: 2.0 Flash, 1.5 Pro, 1.5 Flash
- 공급자/모델 드롭다운 선택
- API 키 미설정 시 경고 배너 표시
- 채팅 히스토리 (멀티턴 대화 유지)
- AI 응답 내 JSON 코드 블록 렌더링 + "캔버스에 적용" 버튼
  - 버튼 클릭 시 노드+엣지 JSON을 캔버스에 자동 배치
- 예시 프롬프트 버튼 (빈 채팅 상태에서 표시)
- Enter 전송, Shift+Enter 줄바꿈

#### AI Agent 토글 버튼
- `ai.png` 이미지 사용 (Vite `public/` 정적 자산으로 제공)
- 위치: 우측 패널 왼쪽 상단 영역 (`top-[38%]`)
- **패널 닫힌 상태**: `w-12 h-20` 크기, ai.png 이미지 표시
- **패널 열린 상태**: `w-3 h-16` 얇은 세로 띠로 축소 (이미지 숨김, 콘텐츠 가림 방지)
- 슬라이드 애니메이션: `transition-all duration-300 ease-in-out`

#### AI 시스템 프롬프트 (SYSTEM_PROMPT in ai.ts)
- ETL 컴포넌트 타입 목록 및 역할 설명
- 응답 형식 지정: 설명 + JSON 코드 블록 (`nodes[]` + `edges[]`)
- 사용자 언어로 응답 지시

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
          { "columnName": "emp_id", "dataType": "bigserial", "isPrimaryKey": true, "nullable": false }
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
