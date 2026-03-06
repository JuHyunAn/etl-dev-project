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

        return try {
            logs += "[${LocalDateTime.now()}] Job 실행 시작: ${plan.jobId}"

            for (nodeId in plan.sortedNodeIds) {
                val node = plan.ir.nodes.find { it.id == nodeId } ?: continue
                val resolved = resolveNode(node, plan.context)
                val result   = executeNode(resolved, plan, logs)
                nodeResults[nodeId] = result

                if (result.status == ExecutionStatus.FAILED) {
                    logs += "[ERROR] 노드 '${node.label}' 실패: ${result.errorMessage}"
                    return buildResult(plan, ExecutionStatus.FAILED, startedAt, startMs,
                        nodeResults, logs, result.errorMessage)
                }
                logs += "[OK] 노드 '${node.label}': ${result.rowsProcessed}행 처리"
            }

            logs += "[${LocalDateTime.now()}] Job 완료"
            buildResult(plan, ExecutionStatus.SUCCESS, startedAt, startMs, nodeResults, logs)

        } catch (e: Exception) {
            log.error("Job 실행 실패: ${plan.jobId}", e)
            buildResult(plan, ExecutionStatus.FAILED, startedAt, startMs, nodeResults, logs, e.message)
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
        logs: MutableList<String>
    ): NodeResult {
        val startMs = System.currentTimeMillis()
        return when (node.type) {
            ComponentType.T_JDBC_INPUT  -> executeInputNode(node, plan, logs, startMs)
            ComponentType.T_JDBC_OUTPUT -> executeOutputNode(node, plan, logs, startMs)

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

            ComponentType.T_LOG_ROW -> {
                logs += "[LOG] 노드 '${node.label}'"
                NodeResult(node.id, node.type.name, ExecutionStatus.SUCCESS,
                    durationMs = System.currentTimeMillis() - startMs)
            }

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
        logs: MutableList<String>, startMs: Long
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

            // 2. Output 커넥션으로 실행
            val conn     = connectionService.get(compiled.outputConnectionId)
            val jdbcUrl  = connectionService.buildJdbcUrl(conn)
            val password = connectionService.getDecryptedPassword(conn.id)

            DriverManager.getConnection(jdbcUrl, conn.username, password).use { jdbc ->
                jdbc.autoCommit = false
                try {
                    // TRUNCATE_INSERT: INSERT 전 테이블 비우기
                    if (compiled.writeMode.uppercase() == "TRUNCATE_INSERT") {
                        logs += "[SQL] TRUNCATE TABLE ${compiled.outputTable}"
                        jdbc.createStatement().use { it.execute("TRUNCATE TABLE ${compiled.outputTable}") }
                    }

                    // INSERT...SELECT 실행
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
        } catch (e: Exception) {
            log.error("Output 노드 실행 실패: ${node.label}", e)
            NodeResult(node.id, node.type.name, ExecutionStatus.FAILED,
                durationMs = System.currentTimeMillis() - startMs,
                errorMessage = e.message)
        }
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
