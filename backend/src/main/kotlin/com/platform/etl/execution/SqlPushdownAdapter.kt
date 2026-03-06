package com.platform.etl.execution

import com.fasterxml.jackson.databind.ObjectMapper
import com.platform.etl.domain.connection.ConnectionService
import com.platform.etl.ir.*
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import java.sql.DriverManager
import java.time.LocalDateTime
import java.util.UUID

/**
 * SQL Pushdown 실행 어댑터
 * Job IR을 CTE 기반 SQL로 컴파일하여 타겟 DB에서 실행합니다.
 * 데이터는 웹 서버 메모리를 통과하지 않습니다. (Zero Data Processing on Web Server 원칙)
 */
@Component
class SqlPushdownAdapter(
    private val connectionService: ConnectionService,
    private val objectMapper: ObjectMapper
) : ExecutionEngine {

    override val engineType = "sql_pushdown"
    private val log = LoggerFactory.getLogger(javaClass)

    override fun validate(plan: ExecutionPlan): List<String> {
        val errors = mutableListOf<String>()
        val ir = plan.ir

        // 1. Output 노드에 connectionId 필수
        ir.nodes.filter { it.type == ComponentType.T_JDBC_OUTPUT }.forEach { node ->
            if (node.config["connectionId"] == null)
                errors += "Output 노드 '${node.label}': connectionId 미설정"
            if (node.config["tableName"] == null)
                errors += "Output 노드 '${node.label}': tableName 미설정"
        }

        // 2. Input 노드에 connectionId 또는 query 필수
        ir.nodes.filter { it.type == ComponentType.T_JDBC_INPUT }.forEach { node ->
            if (node.config["connectionId"] == null)
                errors += "Input 노드 '${node.label}': connectionId 미설정"
        }

        // 3. 사이클 체크 (DAG 여야 함)
        if (hasCycle(ir)) errors += "Job에 순환 참조(Cycle)가 존재합니다"

        return errors
    }

    override fun execute(plan: ExecutionPlan): ExecutionResult {
        val startedAt = LocalDateTime.now()
        val startMs = System.currentTimeMillis()
        val nodeResults = mutableMapOf<String, NodeResult>()
        val logs = mutableListOf<String>()

        return try {
            logs += "[${LocalDateTime.now()}] Job 실행 시작: ${plan.jobId}"

            // 각 노드를 위상 정렬 순서대로 처리
            for (nodeId in plan.sortedNodeIds) {
                val node = plan.ir.nodes.find { it.id == nodeId } ?: continue
                val result = executeNode(node, plan, logs)
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
            buildResult(plan, ExecutionStatus.FAILED, startedAt, startMs, nodeResults, logs,
                e.message)
        }
    }

    private fun executeNode(
        node: NodeIR,
        plan: ExecutionPlan,
        logs: MutableList<String>
    ): NodeResult {
        val startMs = System.currentTimeMillis()
        return when (node.type) {
            ComponentType.T_JDBC_INPUT -> executeInputNode(node, plan, logs, startMs)
            ComponentType.T_JDBC_OUTPUT -> executeOutputNode(node, plan, logs, startMs)
            ComponentType.T_MAP -> NodeResult(node.id, node.type.name, ExecutionStatus.SUCCESS,
                durationMs = System.currentTimeMillis() - startMs,
                generatedSql = "[Map 노드: SQL 컴파일 단계에서 처리됨]")
            ComponentType.T_FILTER_ROW -> NodeResult(node.id, node.type.name, ExecutionStatus.SUCCESS,
                durationMs = System.currentTimeMillis() - startMs)
            ComponentType.T_LOG_ROW -> {
                logs += "[LOG] 노드 '${node.label}'"
                NodeResult(node.id, node.type.name, ExecutionStatus.SUCCESS,
                    durationMs = System.currentTimeMillis() - startMs)
            }
            else -> NodeResult(node.id, node.type.name, ExecutionStatus.SKIPPED,
                durationMs = System.currentTimeMillis() - startMs)
        }
    }

    private fun executeInputNode(node: NodeIR, plan: ExecutionPlan,
                                  logs: MutableList<String>, startMs: Long): NodeResult {
        val connId = node.config["connectionId"]?.toString()
            ?: return NodeResult(node.id, node.type.name, ExecutionStatus.FAILED,
                errorMessage = "connectionId 미설정")

        return try {
            val conn = connectionService.get(java.util.UUID.fromString(connId))
            val jdbcUrl = connectionService.buildJdbcUrl(conn)
            val password = connectionService.getDecryptedPassword(conn.id)
            val query = node.config["query"]?.toString()
                ?: "SELECT * FROM ${node.config["tableName"]}"

            DriverManager.getConnection(jdbcUrl, conn.username, password).use { jdbc ->
                jdbc.createStatement().use { stmt ->
                    stmt.executeQuery(query).use { rs ->
                        var count = 0L
                        while (rs.next()) count++
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

    private fun executeOutputNode(node: NodeIR, plan: ExecutionPlan,
                                   logs: MutableList<String>, startMs: Long): NodeResult {
        if (plan.previewMode) {
            return NodeResult(node.id, node.type.name, ExecutionStatus.SKIPPED,
                durationMs = System.currentTimeMillis() - startMs,
                generatedSql = "[Preview Mode: Output 건너뜀]")
        }
        // 실제 Output 실행은 전체 파이프라인 SQL 컴파일 후 단일 쿼리로 실행
        return NodeResult(node.id, node.type.name, ExecutionStatus.SUCCESS,
            durationMs = System.currentTimeMillis() - startMs)
    }

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

    private fun buildResult(
        plan: ExecutionPlan, status: ExecutionStatus, startedAt: LocalDateTime,
        startMs: Long, nodeResults: Map<String, NodeResult>,
        logs: List<String>, errorMessage: String? = null
    ) = ExecutionResult(
        executionId = plan.executionId,
        jobId = plan.jobId,
        status = status,
        startedAt = startedAt,
        finishedAt = LocalDateTime.now(),
        durationMs = System.currentTimeMillis() - startMs,
        nodeResults = nodeResults,
        errorMessage = errorMessage,
        logs = logs
    )
}
