package com.platform.etl.ir

import com.fasterxml.jackson.annotation.JsonSubTypes
import com.fasterxml.jackson.annotation.JsonTypeInfo

/**
 * Job IR (Intermediate Representation)
 * UI Canvas → IR(JSON) → ExecutionEngine 변환 체인의 중간 표현.
 * 언어/엔진 중립적 포맷으로 JVM/Python Worker 모두 해석 가능.
 */
data class JobIR(
    val id: String,
    val version: String = "0.1",
    val engineType: EngineType = EngineType.SQL_PUSHDOWN,
    val nodes: List<NodeIR>,
    val edges: List<EdgeIR>,
    val context: Map<String, String> = emptyMap()
)

enum class EngineType {
    SQL_PUSHDOWN,   // 현재 구현 — 타겟 DB에서 SQL 실행
    PYTHON_WORKER,  // 향후 — Python 기반 Row 처리 엔진
    JVM_WORKER      // 향후 — JVM 기반 고성능 엔진
}

data class NodeIR(
    val id: String,
    val type: ComponentType,
    val label: String,
    val position: Position,
    val config: Map<String, Any?> = emptyMap(),
    val inputPorts: List<PortIR> = emptyList(),
    val outputPorts: List<PortIR> = emptyList()
)

data class EdgeIR(
    val id: String,
    val source: String,         // nodeId
    val sourcePort: String,     // portId
    val target: String,         // nodeId
    val targetPort: String,     // portId
    val linkType: LinkType,
    val triggerCondition: TriggerCondition? = null
)

data class PortIR(
    val id: String,
    val name: String,
    val portType: PortType,
    val schema: List<ColumnIR>? = null
)

data class ColumnIR(
    val name: String,
    val type: String,           // VARCHAR, INTEGER, TIMESTAMP, etc.
    val nullable: Boolean = true,
    val length: Int? = null,
    val precision: Int? = null,
    val scale: Int? = null
)

data class Position(val x: Double, val y: Double)

enum class PortType {
    ROW,        // 일반 데이터 행 흐름
    TRIGGER,    // 실행 트리거 (데이터 없음)
    REJECT,     // 거부된 행 (에러 처리)
    LOOKUP      // 룩업 조인용
}

enum class LinkType {
    ROW,
    TRIGGER,
    REJECT,
    LOOKUP
}

enum class TriggerCondition {
    ON_OK,      // 선행 노드 성공 시 실행
    ON_ERROR    // 선행 노드 실패 시 실행
}

/**
 * 지원 컴포넌트 타입 (TOS 계열 벤치마킹)
 * INPUT / TRANSFORM / OUTPUT / ORCHESTRATION / LOGS / AETL_ADVANCED
 */
enum class ComponentType {
    // ── Input ──────────────────────────────────────
    T_JDBC_INPUT,           // DB 테이블/쿼리 입력
    T_FILE_INPUT,           // CSV/TSV 파일 입력

    // ── Transform ──────────────────────────────────
    T_MAP,                  // 컬럼 매핑 + 표현식
    T_FILTER_ROW,           // 조건 필터
    T_AGGREGATE_ROW,        // 집계 (GROUP BY)
    T_SORT_ROW,             // 정렬
    T_JOIN,                 // 조인 (INNER/LEFT/RIGHT)
    T_CONVERT_TYPE,         // 타입 변환
    T_REPLACE,              // 값 치환
    T_UNION_ROW,            // UNION

    // ── Output ──────────────────────────────────────
    T_JDBC_OUTPUT,          // DB 테이블 출력 (INSERT/UPSERT/UPDATE/DELETE)
    T_FILE_OUTPUT,          // CSV 파일 출력

    // ── Orchestration ───────────────────────────────
    T_PRE_JOB,              // Job 시작 전 처리
    T_POST_JOB,             // Job 종료 후 처리
    T_RUN_JOB,              // 서브 Job 실행
    T_SLEEP,                // 대기

    // ── Transaction Control ──────────────────────────
    T_DB_COMMIT,            // 트랜잭션 커밋
    T_DB_ROLLBACK,          // 트랜잭션 롤백

    // ── Logs & Error ────────────────────────────────
    T_LOG_ROW,              // 행 로깅
    T_DIE,                  // 강제 종료

    // ── AETL Advanced (현재 레포 기능 통합) ──────────
    T_VALIDATE,             // 검증 SQL 자동 생성 + 실행
    T_PROFILE,              // 데이터 프로파일링
    T_LINEAGE               // 리니지 추적
}
