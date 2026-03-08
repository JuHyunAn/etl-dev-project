package com.platform.etl.execution

import com.platform.etl.domain.connection.ConnectionService
import com.platform.etl.ir.*
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import java.sql.DriverManager
import java.time.LocalDateTime

@Component
class SqlPushdownAdapter(
    private val connectionService: ConnectionService,
    private val compiler: SqlPushdownCompiler
) : ExecutionEngine {

    override val engineType = "sql_pushdown"
    private val log = LoggerFactory.getLogger(javaClass)

    // ── Validate ─────────────────────────────────────────────────

    override fun validate(plan: ExecutionPlan): List<String> {
        val errors = mutableListOf<String>()
        val ir = plan.ir

        ir.nodes.filter { it.type == ComponentType.T_JDBC_OUTPUT }.forEach { node ->
            if (node.config["connectionId"] == null)
                errors += "Output 노드 '${node.label}': connectionId 미설정"
            if (node.config["tableName"] == null)
                errors += "Output 노드 '${node.label}': tableName 미설정"
        }
        ir.nodes.filter { it.type == ComponentType.T_JDBC_INPUT }.forEach { node ->
            if (node.config["connectionId"] == null)
                errors += "Input 노드 '${node.label}': connectionId 미설정"
        }
        if (hasCycle(ir)) errors += "Job에 순환 참조(Cycle)가 존재합니다"

        return errors
    }

    // ── Execute ───────────────────────────────────────────────────

    override fun execute(plan: ExecutionPlan): ExecutionResult {
        val startedAt = LocalDateTime.now()
        val startMs   = System.currentTimeMillis()
        val nodeResults = mutableMapOf<String, NodeResult>()
        val logs = mutableListOf<String>()

        // 트랜잭션 모드: T_DB_COMMIT 또는 T_DB_ROLLBACK 노드가 존재하면 활성화
        val transactionMode = plan.ir.nodes.any {
            it.type == ComponentType.T_DB_COMMIT || it.type == ComponentType.T_DB_ROLLBACK
        }
        val sharedConnections: MutableMap<String, java.sql.Connection>? =
            if (transactionMode) mutableMapOf() else null

        // Trigger 엣지 존재 여부 — 있으면 노드 실패 시 즉시 중단하지 않고 ON_ERROR 경로 처리
        val hasTriggerEdges = plan.ir.edges.any { it.linkType == com.platform.etl.ir.LinkType.TRIGGER }

        try {
            logs += "[${LocalDateTime.now()}] Job 실행 시작: ${plan.jobId}"
            if (transactionMode) logs += "[TX] 트랜잭션 모드 활성화"
            if (hasTriggerEdges) logs += "[TRIGGER] Trigger 모드 활성화"

            for (nodeId in plan.sortedNodeIds) {
                val node = plan.ir.nodes.find { it.id == nodeId } ?: continue

                // Trigger 조건 체크: 이 노드로 들어오는 TRIGGER 엣지가 있으면 조건 확인
                if (hasTriggerEdges) {
                    val skipReason = checkTriggerCondition(nodeId, plan.ir, nodeResults)
                    if (skipReason != null) {
                        nodeResults[nodeId] = NodeResult(nodeId, node.type.name, ExecutionStatus.SKIPPED, durationMs = 0)
                        logs += "[SKIP] 노드 '${node.label}': $skipReason"
                        continue
                    }
                }

                val resolved = resolveNode(node, plan.context)
                val result   = executeNode(resolved, plan, logs, sharedConnections)
                nodeResults[nodeId] = result

                if (result.status == ExecutionStatus.FAILED) {
                    logs += "[ERROR] 노드 '${node.label}' 실패: ${result.errorMessage}"
                    if (!hasTriggerEdges) {
                        // 기존 동작: 즉시 중단
                        if (sharedConnections != null) {
                            sharedConnections.values.forEach { runCatching { it.rollback() } }
                            logs += "[TX] 트랜잭션 롤백 완료 (오류)"
                        }
                        return buildResult(plan, ExecutionStatus.FAILED, startedAt, startMs,
                            nodeResults, logs, result.errorMessage)
                    }
                    // Trigger 모드: 계속 실행 (ON_ERROR 경로가 처리)
                } else {
                    logs += "[OK] 노드 '${node.label}': ${result.rowsProcessed}행 처리"
                }
            }

            logs += "[${LocalDateTime.now()}] Job 완료"
            val failedResult = nodeResults.values.firstOrNull { it.status == ExecutionStatus.FAILED }
            val overallStatus = if (failedResult != null) ExecutionStatus.FAILED else ExecutionStatus.SUCCESS
            return buildResult(plan, overallStatus, startedAt, startMs, nodeResults, logs, failedResult?.errorMessage)

        } catch (e: Exception) {
            log.error("Job 실행 실패: ${plan.jobId}", e)
            sharedConnections?.values?.forEach { runCatching { it.rollback() } }
            return buildResult(plan, ExecutionStatus.FAILED, startedAt, startMs, nodeResults, logs, e.message)
        } finally {
            sharedConnections?.values?.forEach { runCatching { it.close() } }
        }
    }

    // ── Context 변수 치환 ─────────────────────────────────────────

    private val contextPattern = Regex("""context\.([A-Za-z_][A-Za-z0-9_]*)""")

    private fun resolveStr(value: String, context: Map<String, String>): String =
        if (context.isEmpty()) value
        else contextPattern.replace(value) { mr -> context[mr.groupValues[1]] ?: mr.value }

    @Suppress("UNCHECKED_CAST")
    private fun resolveAny(value: Any?, context: Map<String, String>): Any? = when {
        context.isEmpty() -> value
        value is String   -> resolveStr(value, context)
        value is List<*>  -> value.map { resolveAny(it, context) }
        value is Map<*, *> -> (value as Map<String, Any?>).mapValues { resolveAny(it.value, context) }
        else              -> value
    }

    private fun resolveNode(node: NodeIR, context: Map<String, String>): NodeIR =
        if (context.isEmpty()) node
        else node.copy(config = node.config.mapValues { resolveAny(it.value, context) })

    // ── Node 실행 라우터 ──────────────────────────────────────────

    private fun executeNode(
        node: NodeIR,
        plan: ExecutionPlan,
        logs: MutableList<String>,
        sharedConnections: MutableMap<String, java.sql.Connection>? = null
    ): NodeResult {
        val startMs = System.currentTimeMillis()
        return when (node.type) {
            ComponentType.T_JDBC_INPUT  -> executeInputNode(node, plan, logs, startMs)
            ComponentType.T_JDBC_OUTPUT -> executeOutputNode(node, plan, logs, startMs, sharedConnections)

            ComponentType.T_DB_COMMIT -> {
                if (plan.previewMode || sharedConnections == null) {
                    logs += "[TX] Commit 노드 SKIPPED (Preview Mode 또는 비트랜잭션 모드)"
                    NodeResult(node.id, node.type.name, ExecutionStatus.SKIPPED,
                        durationMs = System.currentTimeMillis() - startMs)
                } else {
                    try {
                        sharedConnections.values.forEach { it.commit() }
                        logs += "[TX] COMMIT 완료 (${sharedConnections.size}개 커넥션)"
                        NodeResult(node.id, node.type.name, ExecutionStatus.SUCCESS,
                            durationMs = System.currentTimeMillis() - startMs)
                    } catch (e: Exception) {
                        NodeResult(node.id, node.type.name, ExecutionStatus.FAILED,
                            durationMs = System.currentTimeMillis() - startMs,
                            errorMessage = e.message)
                    }
                }
            }

            ComponentType.T_DB_ROLLBACK -> {
                if (plan.previewMode || sharedConnections == null) {
                    logs += "[TX] Rollback 노드 SKIPPED (Preview Mode 또는 비트랜잭션 모드)"
                    NodeResult(node.id, node.type.name, ExecutionStatus.SKIPPED,
                        durationMs = System.currentTimeMillis() - startMs)
                } else {
                    try {
                        sharedConnections.values.forEach { it.rollback() }
                        logs += "[TX] ROLLBACK 완료 (${sharedConnections.size}개 커넥션)"
                        NodeResult(node.id, node.type.name, ExecutionStatus.SUCCESS,
                            durationMs = System.currentTimeMillis() - startMs)
                    } catch (e: Exception) {
                        NodeResult(node.id, node.type.name, ExecutionStatus.FAILED,
                            durationMs = System.currentTimeMillis() - startMs,
                            errorMessage = e.message)
                    }
                }
            }

            // 변환 노드: SQL 컴파일러가 처리 — 개별 실행 불필요
            ComponentType.T_MAP,
            ComponentType.T_FILTER_ROW,
            ComponentType.T_AGGREGATE_ROW,
            ComponentType.T_SORT_ROW,
            ComponentType.T_JOIN,
            ComponentType.T_UNION_ROW,
            ComponentType.T_CONVERT_TYPE,
            ComponentType.T_REPLACE -> NodeResult(
                node.id, node.type.name, ExecutionStatus.SUCCESS,
                durationMs = System.currentTimeMillis() - startMs,
                generatedSql = "[SQL Pushdown: CTE 컴파일 단계에서 처리됨]"
            )

            ComponentType.T_LOG_ROW -> executeLogRowNode(node, plan, logs, startMs)

            // T_PRE_JOB, T_POST_JOB, T_SLEEP 등 오케스트레이션 — 향후 구현
            else -> NodeResult(node.id, node.type.name, ExecutionStatus.SKIPPED,
                durationMs = System.currentTimeMillis() - startMs)
        }
    }

    // ── Input 노드: 소스 row 수 카운트 (유효성 확인 + 로그용) ────────

    private fun executeInputNode(
        node: NodeIR, @Suppress("UNUSED_PARAMETER") plan: ExecutionPlan,
        logs: MutableList<String>, startMs: Long
    ): NodeResult {
        val connId = node.config["connectionId"]?.toString()
            ?: return NodeResult(node.id, node.type.name, ExecutionStatus.FAILED,
                errorMessage = "connectionId 미설정")

        return try {
            val conn     = connectionService.get(java.util.UUID.fromString(connId))
            val jdbcUrl  = connectionService.buildJdbcUrl(conn)
            val password = connectionService.getDecryptedPassword(conn.id)
            val query    = node.config["query"]?.toString()
                ?: "SELECT * FROM ${node.config["tableName"]}"

            DriverManager.getConnection(jdbcUrl, conn.username, password).use { jdbc ->
                // COUNT 래핑으로 소스 row 수 확인 (전체 데이터를 메모리로 올리지 않음)
                val countSql = "SELECT COUNT(*) FROM ($query) _src"
                jdbc.createStatement().use { stmt ->
                    stmt.executeQuery(countSql).use { rs ->
                        val count = if (rs.next()) rs.getLong(1) else 0L
                        logs += "[INPUT] '${node.label}': 소스 ${count}행 확인"
                        NodeResult(node.id, node.type.name, ExecutionStatus.SUCCESS,
                            rowsProcessed = count,
                            durationMs = System.currentTimeMillis() - startMs,
                            generatedSql = query)
                    }
                }
            }
        } catch (e: Exception) {
            NodeResult(node.id, node.type.name, ExecutionStatus.FAILED,
                durationMs = System.currentTimeMillis() - startMs,
                errorMessage = e.message)
        }
    }

    // ── Output 노드: 전체 파이프라인 SQL 컴파일 후 INSERT 실행 ─────

    private fun executeOutputNode(
        node: NodeIR, plan: ExecutionPlan,
        logs: MutableList<String>, startMs: Long,
        sharedConnections: MutableMap<String, java.sql.Connection>? = null
    ): NodeResult {
        if (plan.previewMode) {
            return NodeResult(node.id, node.type.name, ExecutionStatus.SKIPPED,
                durationMs = System.currentTimeMillis() - startMs,
                generatedSql = "[Preview Mode: Output 건너뜀]")
        }

        return try {
            // 1. 파이프라인 전체를 CTE 기반 INSERT...SELECT SQL로 컴파일
            val compiled = compiler.compile(plan)
            logs += "[SQL] 컴파일 완료 (${compiled.sql.lines().size}줄)"
            log.debug("Generated SQL:\n{}", compiled.sql)

            // 2. Output 커넥션 정보 조회
            val conn     = connectionService.get(compiled.outputConnectionId)
            val jdbcUrl  = connectionService.buildJdbcUrl(conn)
            val password = connectionService.getDecryptedPassword(conn.id)
            val connKey  = compiled.outputConnectionId.toString()

            if (sharedConnections != null) {
                // 트랜잭션 모드: 공유 커넥션 사용 — commit은 T_DB_COMMIT 노드에서 처리
                val jdbc = sharedConnections.getOrPut(connKey) {
                    DriverManager.getConnection(jdbcUrl, conn.username, password).also {
                        it.autoCommit = false
                    }
                }

                if (compiled.writeMode.uppercase() == "TRUNCATE_INSERT") {
                    logs += "[SQL] TRUNCATE TABLE ${compiled.outputTable}"
                    jdbc.createStatement().use { it.execute("TRUNCATE TABLE ${compiled.outputTable}") }
                }

                logs += "[SQL] INSERT 실행 중..."
                val rows = jdbc.createStatement().use { it.executeUpdate(compiled.sql).toLong() }
                logs += "[SQL] ${rows}행 적재 완료 (커밋 대기 중)"

                NodeResult(
                    node.id, node.type.name, ExecutionStatus.SUCCESS,
                    rowsProcessed = rows,
                    durationMs = System.currentTimeMillis() - startMs,
                    generatedSql = compiled.sql
                )
            } else {
                // 일반 모드: 노드별 독립 커넥션 + 즉시 커밋 (기존 동작)
                DriverManager.getConnection(jdbcUrl, conn.username, password).use { jdbc ->
                    jdbc.autoCommit = false
                    try {
                        if (compiled.writeMode.uppercase() == "TRUNCATE_INSERT") {
                            logs += "[SQL] TRUNCATE TABLE ${compiled.outputTable}"
                            jdbc.createStatement().use { it.execute("TRUNCATE TABLE ${compiled.outputTable}") }
                        }

                        logs += "[SQL] INSERT 실행 중..."
                        val rows = jdbc.createStatement()
                            .use { it.executeUpdate(compiled.sql).toLong() }

                        jdbc.commit()
                        logs += "[SQL] ${rows}행 적재 완료"

                        NodeResult(
                            node.id, node.type.name, ExecutionStatus.SUCCESS,
                            rowsProcessed = rows,
                            durationMs = System.currentTimeMillis() - startMs,
                            generatedSql = compiled.sql
                        )
                    } catch (e: Exception) {
                        runCatching { jdbc.rollback() }
                        throw e
                    }
                }
            }
        } catch (e: Exception) {
            log.error("Output 노드 실행 실패: ${node.label}", e)
            NodeResult(node.id, node.type.name, ExecutionStatus.FAILED,
                durationMs = System.currentTimeMillis() - startMs,
                errorMessage = e.message)
        }
    }

    // ── T_LOG_ROW: upstream 쿼리 실행 후 샘플 rows 캡처 ─────────

    private fun executeLogRowNode(
        node: NodeIR, plan: ExecutionPlan,
        logs: MutableList<String>, startMs: Long
    ): NodeResult {
        return try {
            val inputNode = findUpstreamInputNode(node.id, plan.ir)
                ?: run {
                    logs += "[LOG] '${node.label}': upstream Input 노드를 찾을 수 없습니다"
                    return NodeResult(node.id, node.type.name, ExecutionStatus.SUCCESS,
                        durationMs = System.currentTimeMillis() - startMs)
                }

            val connId = inputNode.config["connectionId"]?.toString()
                ?: return NodeResult(node.id, node.type.name, ExecutionStatus.FAILED,
                    durationMs = System.currentTimeMillis() - startMs,
                    errorMessage = "upstream connectionId 미설정")

            val conn     = connectionService.get(java.util.UUID.fromString(connId))
            val jdbcUrl  = connectionService.buildJdbcUrl(conn)
            val password = connectionService.getDecryptedPassword(conn.id)
            val sourceQuery = inputNode.config["query"]?.toString()
                ?: "SELECT * FROM ${inputNode.config["tableName"]}"

            val sampleSql = "SELECT * FROM ($sourceQuery) _logrow LIMIT 100"

            DriverManager.getConnection(jdbcUrl, conn.username, password).use { jdbc ->
                jdbc.createStatement().use { stmt ->
                    stmt.executeQuery(sampleSql).use { rs ->
                        val meta = rs.metaData
                        val columns = (1..meta.columnCount).map { meta.getColumnName(it) }
                        val rows = mutableListOf<List<Any?>>()
                        while (rs.next()) {
                            rows += (1..meta.columnCount).map { rs.getObject(it) }
                        }
                        val count = rows.size.toLong()
                        logs += "[LOG] '${node.label}': ${count}행 캡처 (최대 100행 샘플)"
                        NodeResult(
                            node.id, node.type.name, ExecutionStatus.SUCCESS,
                            rowsProcessed = count,
                            durationMs = System.currentTimeMillis() - startMs,
                            rowSamples = LogRowData(columns, rows)
                        )
                    }
                }
            }
        } catch (e: Exception) {
            NodeResult(node.id, node.type.name, ExecutionStatus.FAILED,
                durationMs = System.currentTimeMillis() - startMs,
                errorMessage = e.message)
        }
    }

    private fun findUpstreamInputNode(nodeId: String, ir: com.platform.etl.ir.JobIR): NodeIR? {
        val visited = mutableSetOf<String>()
        val queue = ArrayDeque<String>()
        queue += nodeId
        while (queue.isNotEmpty()) {
            val current = queue.removeFirst()
            if (!visited.add(current)) continue
            val upstreamIds = ir.edges
                .filter { it.target == current && it.linkType == com.platform.etl.ir.LinkType.ROW }
                .map { it.source }
            for (srcId in upstreamIds) {
                val srcNode = ir.nodes.find { it.id == srcId } ?: continue
                if (srcNode.type == com.platform.etl.ir.ComponentType.T_JDBC_INPUT) return srcNode
                queue += srcId
            }
        }
        return null
    }

    // ── Trigger 조건 체크 + ROW 연쇄 SKIP ───────────────────────

    private fun checkTriggerCondition(
        nodeId: String, ir: com.platform.etl.ir.JobIR,
        nodeResults: Map<String, NodeResult>
    ): String? {
        // 1. TRIGGER 엣지 조건 체크
        val incomingTrigger = ir.edges.filter {
            it.target == nodeId && it.linkType == com.platform.etl.ir.LinkType.TRIGGER
        }
        for (edge in incomingTrigger) {
            val sourceResult = nodeResults[edge.source]
                ?: return "선행 노드 미실행"
            val conditionMet = when (edge.triggerCondition) {
                com.platform.etl.ir.TriggerCondition.ON_OK    -> sourceResult.status == ExecutionStatus.SUCCESS
                com.platform.etl.ir.TriggerCondition.ON_ERROR -> sourceResult.status == ExecutionStatus.FAILED
                null -> true
            }
            if (!conditionMet) {
                val condStr = when (edge.triggerCondition) {
                    com.platform.etl.ir.TriggerCondition.ON_OK    -> "On Component Ok"
                    com.platform.etl.ir.TriggerCondition.ON_ERROR -> "On Component Error"
                    null -> "Trigger"
                }
                return "Trigger 조건 불충족 ($condStr)"
            }
        }

        // 2. ROW 연쇄 SKIP: 모든 ROW 소스가 SKIP이면 데이터가 없으므로 이 노드도 SKIP
        //    (ROW 소스 중 하나라도 SUCCESS/FAILED면 실행 유지)
        val incomingRow = ir.edges.filter {
            it.target == nodeId && it.linkType == com.platform.etl.ir.LinkType.ROW
        }
        if (incomingRow.isNotEmpty() &&
            incomingRow.all { nodeResults[it.source]?.status == ExecutionStatus.SKIPPED }) {
            return "상위 데이터 노드 SKIP으로 인한 연쇄 SKIP"
        }

        return null
    }

    // ── 사이클 감지 ───────────────────────────────────────────────

    private fun hasCycle(ir: JobIR): Boolean {
        val adj = ir.edges.groupBy { it.source }.mapValues { e -> e.value.map { it.target } }
        val visited = mutableSetOf<String>()
        val inStack = mutableSetOf<String>()

        fun dfs(node: String): Boolean {
            visited += node; inStack += node
            for (neighbor in adj[node] ?: emptyList()) {
                if (neighbor !in visited && dfs(neighbor)) return true
                if (neighbor in inStack) return true
            }
            inStack -= node
            return false
        }

        return ir.nodes.any { it.id !in visited && dfs(it.id) }
    }

    // ── 결과 빌더 ────────────────────────────────────────────────

    private fun buildResult(
        plan: ExecutionPlan, status: ExecutionStatus, startedAt: LocalDateTime,
        startMs: Long, nodeResults: Map<String, NodeResult>,
        logs: List<String>, errorMessage: String? = null
    ) = ExecutionResult(
        executionId  = plan.executionId,
        jobId        = plan.jobId,
        status       = status,
        startedAt    = startedAt,
        finishedAt   = LocalDateTime.now(),
        durationMs   = System.currentTimeMillis() - startMs,
        nodeResults  = nodeResults,
        errorMessage = errorMessage,
        logs         = logs
    )
}
