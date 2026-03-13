package com.platform.etl.execution

import com.platform.etl.domain.connection.ConnectionService
import com.platform.etl.ir.ComponentType
import com.platform.etl.ir.JobIR
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import java.util.UUID

/**
 * Job 실행 경로 라우터.
 *
 * IR을 분석하여 모든 Input/Output 노드가 동일 DB 서버를 바라보면 SQL Pushdown 경로로,
 * 하나라도 다른 서버를 바라보면 Fetch-and-Process 경로로 분기한다.
 *
 * 동일 서버 판단 기준:
 *   1순위 — connectionId가 동일하면 무조건 같은 서버
 *   2순위 — host:port 문자열 비교 (도메인/IP 불일치 가능성 주의)
 */
@Component
class ExecutionRouter(
    private val connectionService: ConnectionService,
    private val pushdownAdapter: SqlPushdownAdapter,
    private val fetchAndProcessExecutor: FetchAndProcessExecutor
) : ExecutionEngine {

    override val engineType = "router"
    private val log = LoggerFactory.getLogger(javaClass)

    enum class RoutingPath { PUSHDOWN, FETCH_AND_PROCESS }

    override fun execute(plan: ExecutionPlan): ExecutionResult {
        val path = analyze(plan.ir)
        log.info("[ROUTER] Job {} → {} 경로", plan.jobId, path)
        return when (path) {
            RoutingPath.PUSHDOWN -> pushdownAdapter.execute(plan)
            RoutingPath.FETCH_AND_PROCESS -> fetchAndProcessExecutor.execute(plan)
        }
    }

    override fun validate(plan: ExecutionPlan): List<String> {
        return pushdownAdapter.validate(plan)   // validation은 공통
    }

    fun analyze(ir: JobIR): RoutingPath {
        val inputNodes  = ir.nodes.filter { it.type == ComponentType.T_JDBC_INPUT }
        val outputNodes = ir.nodes.filter { it.type == ComponentType.T_JDBC_OUTPUT }

        if (inputNodes.isEmpty() || outputNodes.isEmpty()) return RoutingPath.PUSHDOWN

        // connectionId 목록 수집
        val inputIds  = inputNodes.mapNotNull  { it.config["connectionId"]?.toString() }.toSet()
        val outputIds = outputNodes.mapNotNull { it.config["connectionId"]?.toString() }.toSet()
        val allIds = inputIds + outputIds

        if (allIds.size <= 1) return RoutingPath.PUSHDOWN  // 모두 같은 connectionId

        // connectionId가 다르더라도 실제 host:port가 같으면 Pushdown 가능
        val serverKeys = allIds.mapNotNull { idStr ->
            runCatching {
                val conn = connectionService.get(UUID.fromString(idStr))
                "${conn.host}:${conn.port}/${conn.database}"
            }.getOrNull()
        }.toSet()

        return if (serverKeys.size <= 1) RoutingPath.PUSHDOWN else RoutingPath.FETCH_AND_PROCESS
    }
}
