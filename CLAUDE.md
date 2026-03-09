# ETL Platform - Claude Agent 작업 지침

이 파일은 이 프로젝트에서 Claude와 효율적으로 협업하기 위한 지침입니다.
사용자의 실제 작업 패턴을 분석하여 작성되었습니다.

---

## 1. 언어 및 소통 방식

- **응답은 반드시 한국어**로 한다.
- 사용자 메시지가 짧고 직접적이면 응답도 짧고 직접적으로 한다.
- "I'll help you...", "Great question!" 같은 형식적 서두 금지.
- 실행 완료 후 불필요한 요약 반복 금지.

---

## 2. 작업 시작 전 필수 확인

### 참조 문서 우선 확인 (Source of Truth)
복잡한 기능 추가/수정 전 반드시 아래 파일들을 먼저 읽어라:

| 파일 | 용도 |
|------|------|
| `제안사항.md` | 기능 스펙 및 구현 우선순위 (최우선) |
| `Plan_ETL.md` | 전체 아키텍처 설계 문서 |
| `WORK_HISTORY.md` | 현재까지 구현된 기능 이력 |
| `memory/MEMORY.md` | Claude 세션 간 기억 (버그 이력, 환경 정보) |

제안사항.md에 명시된 스펙과 다른 방향으로 구현하면 롤백 요청이 온다.
**읽기 전에 추측으로 구현하지 말 것.**

### 코드 먼저 읽기
수정할 파일은 반드시 Read로 먼저 읽고 파악한 뒤 Edit한다.
추측으로 코드를 작성하면 기존 로직과 충돌한다.

---

## 3. 구현 원칙

### 최소 변경 (No Over-Engineering)
- 요청된 것만 구현한다. 요청하지 않은 개선, 리팩터링, 주석, 타입 추가 금지.
- 유사 코드 3줄이 있어도 불필요한 추상화 레이어 만들지 않는다.
- 에러 핸들링은 시스템 경계(사용자 입력, 외부 API)에만 추가한다.

### 디자인 기준: Talend Open Studio (TOS)
- UI/UX 결정은 Talend의 동작 방식을 기준으로 한다.
- 예: context.변수명 패턴, 노드 연결 방식, Job 실행 흐름

### 보안
- `.env` 파일은 절대 커밋하지 않는다. `.gitignore`에 항상 포함.
- API 키는 `import.meta.env.VITE_*` 패턴으로만 참조한다.
- CORS 우회는 Vite 프록시로 해결한다 (브라우저 직접 노출 금지).

---

## 4. 기술 스택 및 환경

### 실행 환경
- **Frontend**: React + TypeScript + Vite, `http://localhost:3001` (vite.config는 3000이지만 실제 3001)
- **Backend**: Spring Boot + Kotlin, `http://localhost:8080`
- **Meta DB**: Docker PostgreSQL `localhost:5433` (로컬 5432는 PostgreSQL 18이 점유)
- **Java**: `~/.vscode/extensions/redhat.java-1.53.0-win32-x64/jre/21.0.10-win32-x86_64`
- **Gradle**: `~/.gradle/wrapper/dists/gradle-8.14-all/c2qonpi39x1mddn7hk5gh9iqj/gradle-8.14/bin/gradle`

### 실행 방법
cd C:\Users\안주현\Desktop\ETL_Platform\backend > .\gradlew.bat bootRun --no-daemon
cd C:\Users\안주현\Desktop\ETL_Platform\frontend > npm run dev

### 주요 라이브러리
- React Flow v12 (노드 에디터)
- Tailwind CSS (스타일링)
- Zustand (상태관리)
- Spring Data JPA + QueryDSL (백엔드)

### AI API 연동
- Claude: `https://api.anthropic.com/v1/messages` (브라우저 직접 호출, `anthropic-dangerous-allow-browser: true`)
- OpenAI: `https://api.openai.com/v1/chat/completions`
- Gemini: `https://generativelanguage.googleapis.com/v1beta/models/...`
- Grok: `/xai-proxy/v1/chat/completions` (Vite 프록시 → `https://api.x.ai`, CORS 우회)

---

## 5. 파일 수정 후 처리

### WORK_HISTORY.md 업데이트
유의미한 기능 추가/버그 수정 완료 후 WORK_HISTORY.md의 해당 섹션을 업데이트한다.
(사용자가 별도 요청하지 않아도 작업 완료 시 자동으로 수행)

### 메모리 업데이트
반복되는 버그 패턴, 환경 특이사항, 구조적 결정은 `memory/MEMORY.md`에 기록한다.

---

## 6. 사용자 작업 패턴 및 선호

### 작업 스타일
- **짧고 직접적인 지시**: "재시작 부탁해", "추가해줘", "확인해봐" 같은 단문 지시가 많다.
  → 즉시 실행한다. 추가 확인 질문 최소화.
- **반복 수정 요청**: 구현 후 UX/동작이 기대와 다르면 곧바로 수정 피드백을 준다.
  → 첫 구현 시 스펙 문서(제안사항.md)와 정확히 일치하도록 한다.
- **롤백 요청**: 방향이 틀리면 "이전 방식으로 돌려줘" 요청이 온다.
  → 대규모 변경 전에는 현재 코드의 핵심 부분을 먼저 확인하고 방향을 맞춘다.

### UX에 민감
- 색상 코딩, 애니메이션, 시각적 상태 표시를 중요하게 생각한다.
- 버튼 색상(보라색 = 적용, 파란색 = 실행 등)은 한번 정해지면 일관성을 유지한다.
- 비활성화 상태(disabled)도 명확하게 시각화한다.

### 복잡한 요청 처리
- 여러 파일에 걸친 기능 구현 시: 먼저 관련 파일들을 읽고 → 변경 범위 파악 → 구현 순서대로 처리.
- 분석이 필요한 경우 분석 결과를 먼저 보여주고 구현 진행.

---

## 7. 자주 하는 실수 (주의)

1. **스펙 문서 미확인 후 구현** → 롤백 필요
2. **기존 코드 미읽기** → 중복 구현 또는 기존 로직 파괴
3. **불필요한 추가 기능** → 사용자가 요청하지 않은 기능 추가는 혼란을 유발
4. **에러 메시지를 새 에러 상태로 덮어쓰지 않기** → provider 변경 시 이전 error 상태 초기화 필수
5. **Vite 설정 변경 후 재시작 필요** → proxy 추가 등 vite.config.ts 변경은 dev 서버 재시작 없이 적용 안 됨

---

## 8. 프로젝트 구조 요약

```
ETL_Platform/
├── frontend/                    # React + Vite
│   ├── src/
│   │   ├── api/                 # API 클라이언트 (ai.ts, jobs.ts, connections.ts 등)
│   │   ├── components/
│   │   │   ├── job/             # AiAgentPanel.tsx, CustomNodes.tsx 등
│   │   │   ├── node/            # 노드별 설정 컴포넌트
│   │   │   └── ...
│   │   └── pages/
│   │       └── JobDesignerPage.tsx  # 핵심 - Job 편집기
│   ├── vite.config.ts
│   └── .env                     # API 키 (커밋 금지)
├── backend/                     # Spring Boot + Kotlin
│   └── src/main/kotlin/com/platform/etl/
│       ├── execution/           # SqlPushdownAdapter.kt (실행 엔진)
│       ├── ir/                  # JobIR, NodeIR, ExecutionPlan 등
│       └── domain/              # connection, job, project 도메인
├── Plan_ETL.md                  # 아키텍처 설계 문서
├── WORK_HISTORY.md              # 구현 이력
└── 제안사항.md                   # 기능 스펙 (최우선 참조)
```
