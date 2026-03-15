package com.platform.etl.execution

import com.platform.etl.domain.connection.ConnectionService
import com.platform.etl.ir.*
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import java.sql.DriverManager
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

@Component
class SqlPushdownAdapter(
    internal val connectionService: ConnectionService,
    internal val compiler: SqlPushdownCompiler
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

        // tMap → tOutput 타겟 컬럼 존재 여부 검사
        // (tOutput.config.columns가 캐시돼 있을 때만 검사)
        ir.nodes.filter { it.type == ComponentType.T_MAP }.forEach { mapNode ->
            @Suppress("UNCHECKED_CAST")
            val outputMappings = mapNode.config["outputMappings"] as? Map<String, Any?>

            if (!outputMappings.isNullOrEmpty()) {
                // outputMappings[outputId] 방식 — Output별 각각 검증
                outputMappings.forEach { (outputId, rawMappings) ->
                    val mappings = parseMappingsForValidation(rawMappings)
                    if (mappings.isEmpty()) return@forEach

                    val outputNode = ir.nodes.find { it.id == outputId } ?: return@forEach
                    val targetCols = parseTargetColumns(outputNode.config["columns"])
                    if (targetCols.isEmpty()) return@forEach  // 컬럼 캐시 없으면 skip

                    mappings.forEach { (targetName) ->
                        if (targetName.isNotBlank() &&
                            targetCols.none { it.equals(targetName, ignoreCase = true) }
                        ) {
                            errors += "[tMap '${mapNode.label}'] 타겟 컬럼 '${targetName}'이(가) '${outputNode.label}' 테이블에 존재하지 않습니다"
                        }
                    }
                }
            } else {
                // legacy: config["mappings"] + 다운스트림 첫 번째 Output
                val mappings = parseMappingsForValidation(mapNode.config["mappings"])
                if (mappings.isEmpty()) return@forEach

                val outputNode = findDownstreamOutput(mapNode.id, ir) ?: return@forEach
                val targetCols = parseTargetColumns(outputNode.config["columns"])
                if (targetCols.isEmpty()) return@forEach

                mappings.forEach { (targetName) ->
                    if (targetName.isNotBlank() &&
                        targetCols.none { it.equals(targetName, ignoreCase = true) }
                    ) {
                        errors += "[tMap '${mapNode.label}'] 타겟 컬럼 '${targetName}'이(가) 타겟 테이블에 존재하지 않습니다"
                    }
                }
            }
        }

        // 미치환 context 변수 검사
        ir.nodes.forEach { node ->
            collectStrings(node.config).forEach { value ->
                contextPattern.findAll(value).forEach { mr ->
                    val varName = mr.groupValues[1]
                    if (!plan.context.containsKey(varName))
                        errors += "노드 '${node.label}': context.${varName} 값이 설정되지 않았습니다"
                }
            }
        }

        return errors
    }

    @Suppress("UNCHECKED_CAST")
    private fun collectStrings(value: Any?): List<String> = when (value) {
        is String    -> listOf(value)
        is List<*>   -> value.flatMap { collectStrings(it) }
        is Map<*, *> -> (value as Map<String, Any?>).values.flatMap { collectStrings(it) }
        else         -> emptyList()
    }

    // ── Execute ───────────────────────────────────────────────────

    override fun execute(plan: ExecutionPlan): ExecutionResult {
        val startedAt = LocalDateTime.now()
        val startMs   = System.currentTimeMillis()
        val nodeResults = mutableMapOf<String, NodeResult>()
        val logs = mutableListOf<String>()

        // context 변수를 IR 전체에 미리 치환 (컴파일러도 치환된 IR을 사용하도록)
        val resolvedPlan = if (plan.context.isEmpty()) plan else plan.copy(
            ir = plan.ir.copy(nodes = plan.ir.nodes.map { resolveNode(it, plan.context) })
        )

        // 트랜잭션 모드: T_DB_COMMIT 또는 T_DB_ROLLBACK 노드가 존재하면 활성화
        val transactionMode = resolvedPlan.ir.nodes.any {
            it.type == ComponentType.T_DB_COMMIT || it.type == ComponentType.T_DB_ROLLBACK
        }
        val sharedConnections: MutableMap<String, java.sql.Connection>? =
            if (transactionMode) mutableMapOf() else null

        // Trigger 엣지 존재 여부 — 있으면 노드 실패 시 즉시 중단하지 않고 ON_ERROR 경로 처리
        val hasTriggerEdges = resolvedPlan.ir.edges.any { it.linkType == com.platform.etl.ir.LinkType.TRIGGER }

        // T_LOOP 노드가 관리하는 "루프 바디" 노드 집합 — 메인 루프에서 제외됨
        val loopBodyNodes = resolvedPlan.ir.nodes
            .filter { it.type == ComponentType.T_LOOP }
            .flatMap { collectLoopBodyIds(it.id, resolvedPlan.ir) }
            .toSet()

        try {
            logs += "[${LocalDateTime.now()}] Job 실행 시작: ${resolvedPlan.jobId}"
            if (transactionMode) logs += "[TX] 트랜잭션 모드 활성화"
            if (hasTriggerEdges) logs += "[TRIGGER] Trigger 모드 활성화"

            for (nodeId in resolvedPlan.sortedNodeIds) {
                if (resolvedPlan.cancelFlag.get()) {
                    logs += "[CANCEL] 취소 요청으로 실행 중단"
                    throw InterruptedException("실행이 취소되었습니다")
                }

                // 루프 바디 노드는 T_LOOP 실행 시 처리됨
                if (nodeId in loopBodyNodes) continue

                val node = resolvedPlan.ir.nodes.find { it.id == nodeId } ?: continue

                // Trigger 조건 체크: 이 노드로 들어오는 TRIGGER 엣지가 있으면 조건 확인
                if (hasTriggerEdges) {
                    val skipReason = checkTriggerCondition(nodeId, resolvedPlan.ir, nodeResults)
                    if (skipReason != null) {
                        nodeResults[nodeId] = NodeResult(nodeId, node.type.name, ExecutionStatus.SKIPPED, durationMs = 0)
                        logs += "[SKIP] 노드 '${node.label}': $skipReason"
                        continue
                    }
                }

                val result = if (node.type == ComponentType.T_LOOP) {
                    executeLoop(node, resolvedPlan, logs, sharedConnections, nodeResults)
                } else {
                    executeNode(node, resolvedPlan, logs, sharedConnections)
                }
                nodeResults[nodeId] = result

                if (result.status == ExecutionStatus.FAILED) {
                    logs += "[ERROR] 노드 '${node.label}' 실패: ${result.errorMessage}"
                    if (!hasTriggerEdges) {
                        if (sharedConnections != null) {
                            sharedConnections.values.forEach { runCatching { it.rollback() } }
                            logs += "[TX] 트랜잭션 롤백 완료 (오류)"
                        }
                        return buildResult(resolvedPlan, ExecutionStatus.FAILED, startedAt, startMs,
                            nodeResults, logs, result.errorMessage)
                    }
                } else {
                    logs += "[OK] 노드 '${node.label}': ${result.rowsProcessed}행 처리"
                }
            }

            logs += "[${LocalDateTime.now()}] Job 완료"
            val failedResult = nodeResults.values.firstOrNull { it.status == ExecutionStatus.FAILED }
            val overallStatus = if (failedResult != null) ExecutionStatus.FAILED else ExecutionStatus.SUCCESS

            // 트랜잭션 모드: 명시적 T_DB_COMMIT 없이 성공한 경우 자동 커밋
            if (sharedConnections != null && overallStatus == ExecutionStatus.SUCCESS) {
                sharedConnections.values.forEach { runCatching { it.commit() } }
                logs += "[TX] 트랜잭션 자동 커밋 완료"
            }

            return buildResult(resolvedPlan, overallStatus, startedAt, startMs, nodeResults, logs, failedResult?.errorMessage)

        } catch (e: Exception) {
            log.error("Job 실행 실패: ${resolvedPlan.jobId}", e)
            sharedConnections?.values?.forEach { runCatching { it.rollback() } }
            return buildResult(resolvedPlan, ExecutionStatus.FAILED, startedAt, startMs, nodeResults, logs, e.message)
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

            // T_LOOP는 execute()에서 직접 처리됨 (여기까지 오면 안 됨)
            ComponentType.T_LOOP -> NodeResult(node.id, node.type.name, ExecutionStatus.SKIPPED,
                durationMs = System.currentTimeMillis() - startMs)

            // T_PRE_JOB, T_POST_JOB, T_SLEEP 등 오케스트레이션 — 향후 구현
            else -> NodeResult(node.id, node.type.name, ExecutionStatus.SKIPPED,
                durationMs = System.currentTimeMillis() - startMs)
        }
    }

    // ── T_LOOP 실행 ───────────────────────────────────────────────

    /**
     * T_LOOP 노드 실행.
     * - 이터레이션 값 생성 → 루프 바디 노드를 N회 반복 실행
     * - 매 반복마다 loopVar 를 context에 주입하고 바디 노드를 재치환
     */
    private fun executeLoop(
        loopNode: NodeIR,
        plan: ExecutionPlan,
        logs: MutableList<String>,
        sharedConnections: MutableMap<String, java.sql.Connection>?,
        nodeResults: MutableMap<String, NodeResult>
    ): NodeResult {
        val startMs = System.currentTimeMillis()
        val config  = loopNode.config
        val loopVar = (config["loopVar"] as? String)?.trim()?.ifBlank { null } ?: "LOOP_VAR"

        val iterations = generateLoopIterations(config)
        if (iterations.isEmpty()) {
            logs += "[LOOP '${loopNode.label}'] 이터레이션 없음 — 건너뜀"
            return NodeResult(loopNode.id, loopNode.type.name, ExecutionStatus.SUCCESS,
                durationMs = System.currentTimeMillis() - startMs)
        }

        // 루프 바디 노드 ID (위상정렬 순서 유지)
        val bodyIdSet   = collectLoopBodyIds(loopNode.id, plan.ir)
        val orderedBody = plan.sortedNodeIds.filter { it in bodyIdSet }

        // WHILE 문 처리
        if (iterations == listOf("__WHILE__")) {
            return executeWhileLoop(loopNode, plan, logs, sharedConnections, nodeResults,
                bodyIdSet, orderedBody, loopVar, startMs)
        }

        logs += "[LOOP '${loopNode.label}'] 시작: ${iterations.size}회 반복 / 변수=$loopVar"

        var totalRows = 0L

        for ((idx, iterVal) in iterations.withIndex()) {
            logs += "[LOOP] ▶ 반복 ${idx + 1}/${iterations.size}: $loopVar = $iterVal"

            // 이번 이터레이션 context (루프 변수 주입)
            val iterContext = plan.context + mapOf(loopVar to iterVal)

            // 바디 노드를 새 context로 재치환
            val resolvedBodyNodes = plan.ir.nodes
                .filter { it.id in bodyIdSet }
                .map { resolveNode(it, iterContext) }
                .associateBy { it.id }

            val iterPlan = plan.copy(context = iterContext)

            for (bodyId in orderedBody) {
                val bodyNode = resolvedBodyNodes[bodyId] ?: continue
                val result   = executeNode(bodyNode, iterPlan, logs, sharedConnections)
                nodeResults[bodyId] = result   // 마지막 이터레이션 결과로 덮어씀
                totalRows += result.rowsProcessed

                if (result.status == ExecutionStatus.FAILED) {
                    val errMsg = "반복 ${idx + 1} 실패 (${bodyNode.label}): ${result.errorMessage}"
                    logs += "[LOOP ERROR] $errMsg"
                    return NodeResult(loopNode.id, loopNode.type.name, ExecutionStatus.FAILED,
                        rowsProcessed = totalRows,
                        durationMs = System.currentTimeMillis() - startMs,
                        errorMessage = errMsg)
                }
            }
        }

        logs += "[LOOP '${loopNode.label}'] 완료: ${iterations.size}회 / 총 ${totalRows}행"
        return NodeResult(loopNode.id, loopNode.type.name, ExecutionStatus.SUCCESS,
            rowsProcessed = totalRows,
            durationMs = System.currentTimeMillis() - startMs)
    }

    /**
     * WHILE 문 실행: conditionSql 결과가 0이 될 때까지 반복.
     * loopVar가 지정된 경우 반복 번호(1부터)를 context에 주입.
     */
    private fun executeWhileLoop(
        loopNode: NodeIR,
        plan: ExecutionPlan,
        logs: MutableList<String>,
        sharedConnections: MutableMap<String, java.sql.Connection>?,
        nodeResults: MutableMap<String, NodeResult>,
        bodyIdSet: Set<String>,
        orderedBody: List<String>,
        loopVar: String,
        startMs: Long
    ): NodeResult {
        val config        = loopNode.config
        val conditionSql  = (config["conditionSql"] as? String)?.trim() ?: ""
        val maxIterations = (config["maxIterations"] as? String)?.toIntOrNull()?.takeIf { it > 0 } ?: 1000
        val connId        = (config["connectionId"] as? String)
            ?: plan.ir.nodes.firstOrNull { it.type.name.contains("INPUT") }?.config?.get("connectionId")?.toString()

        if (conditionSql.isBlank()) {
            logs += "[WHILE '${loopNode.label}'] conditionSql 미설정 — 건너뜀"
            return NodeResult(loopNode.id, loopNode.type.name, ExecutionStatus.SUCCESS,
                durationMs = System.currentTimeMillis() - startMs)
        }
        if (connId == null) {
            logs += "[WHILE '${loopNode.label}'] connectionId 없음 — 건너뜀"
            return NodeResult(loopNode.id, loopNode.type.name, ExecutionStatus.FAILED,
                durationMs = System.currentTimeMillis() - startMs,
                errorMessage = "conditionSql 실행용 connectionId를 찾을 수 없습니다")
        }

        // conditionSql 실행용 JDBC 연결 정보
        val whileConn     = runCatching { connectionService.get(java.util.UUID.fromString(connId)) }.getOrNull()
            ?: return NodeResult(loopNode.id, loopNode.type.name, ExecutionStatus.FAILED,
                durationMs = System.currentTimeMillis() - startMs,
                errorMessage = "connectionId '$connId' 조회 실패")
        val whileJdbcUrl  = connectionService.buildJdbcUrl(whileConn)
        val whilePassword = connectionService.getDecryptedPassword(whileConn.id)

        logs += "[WHILE '${loopNode.label}'] 시작 (최대 ${maxIterations}회)"
        var totalRows = 0L

        for (idx in 1..maxIterations) {
            // 조건 확인
            val conditionResult = runCatching {
                DriverManager.getConnection(whileJdbcUrl, whileConn.username, whilePassword).use { jdbc ->
                    jdbc.createStatement().use { stmt ->
                        stmt.executeQuery(conditionSql).use { rs -> if (rs.next()) rs.getLong(1) else 0L }
                    }
                }
            }.getOrElse { e ->
                logs += "[WHILE ERROR] 조건 SQL 실행 실패: ${e.message}"
                return NodeResult(loopNode.id, loopNode.type.name, ExecutionStatus.FAILED,
                    rowsProcessed = totalRows,
                    durationMs = System.currentTimeMillis() - startMs,
                    errorMessage = e.message)
            }

            if (conditionResult <= 0L) {
                logs += "[WHILE] 조건 결과=0, 루프 종료 (${idx - 1}회 실행)"
                break
            }

            logs += "[WHILE] ▶ 반복 $idx: 조건=$conditionResult / $loopVar=$idx"
            val iterContext       = plan.context + mapOf(loopVar to idx.toString())
            val resolvedBodyNodes = plan.ir.nodes
                .filter { it.id in bodyIdSet }
                .map { resolveNode(it, iterContext) }
                .associateBy { it.id }
            val iterPlan = plan.copy(context = iterContext)

            for (bodyId in orderedBody) {
                val bodyNode = resolvedBodyNodes[bodyId] ?: continue
                val result   = executeNode(bodyNode, iterPlan, logs, sharedConnections)
                nodeResults[bodyId] = result
                totalRows += result.rowsProcessed
                if (result.status == ExecutionStatus.FAILED) {
                    val errMsg = "반복 $idx 실패 (${bodyNode.label}): ${result.errorMessage}"
                    logs += "[WHILE ERROR] $errMsg"
                    return NodeResult(loopNode.id, loopNode.type.name, ExecutionStatus.FAILED,
                        rowsProcessed = totalRows,
                        durationMs = System.currentTimeMillis() - startMs,
                        errorMessage = errMsg)
                }
            }

            if (idx == maxIterations) logs += "[WHILE] 최대 반복 횟수(${maxIterations}) 도달, 강제 종료"
        }

        logs += "[WHILE '${loopNode.label}'] 완료 / 총 ${totalRows}행"
        return NodeResult(loopNode.id, loopNode.type.name, ExecutionStatus.SUCCESS,
            rowsProcessed = totalRows,
            durationMs = System.currentTimeMillis() - startMs)
    }

    /**
     * T_LOOP 노드를 루트로 하는 downstream 노드 ID 집합 (BFS).
     * 모든 엣지 타입(TRIGGER/ROW/LOOKUP)으로 연결된 하위 노드 포함.
     */
    private fun collectLoopBodyIds(loopNodeId: String, ir: JobIR): Set<String> {
        val visited = mutableSetOf<String>()
        val queue   = ArrayDeque<String>()
        ir.edges.filter { it.source == loopNodeId }.forEach { queue.add(it.target) }
        while (queue.isNotEmpty()) {
            val id = queue.removeFirst()
            if (visited.add(id)) {
                ir.edges.filter { it.source == id }.forEach { queue.add(it.target) }
            }
        }
        return visited
    }

    /**
     * loopType에 따라 이터레이션 값 목록 생성.
     *
     * [신규] FOR + forSubType=RANGE : from..to step step (숫자 또는 날짜 yyyyMMdd 자동감지)
     * [신규] FOR + forSubType=LIST  : listValues 콤마 구분 목록
     * [구형 호환] FOR       : start..end step step (정수)
     * [구형 호환] FOR_DATE  : startDate..endDate step dateStep일
     * [구형 호환] LIST      : listValues 콤마 구분 목록
     */
    private val DATE8_PATTERN = Regex("^(19|20)\\d{6}$")

    private fun generateLoopIterations(config: Map<String, Any?>): List<String> {
        val loopType   = config["loopType"]   as? String ?: "FOR"
        val forSubType = config["forSubType"] as? String ?: "RANGE"

        // WHILE문 — executeLoop에서 별도 처리 (여기서는 빈 목록 반환 안 함, 호출부에서 분기)
        if (loopType == "WHILE") return listOf("__WHILE__")

        // 신규 LIST 포맷
        if (loopType == "FOR" && forSubType == "LIST") {
            return (config["listValues"] as? String)
                ?.split(",")?.map { it.trim() }?.filter { it.isNotBlank() }
                ?: emptyList()
        }

        // 신규 RANGE 포맷 (from/to 키 사용)
        if (loopType == "FOR" && config.containsKey("from")) {
            val from = config["from"] as? String ?: return emptyList()
            val to   = config["to"]   as? String ?: return emptyList()
            val step = (config["step"] as? String)?.toLongOrNull()?.takeIf { it > 0 } ?: 1L

            return if (DATE8_PATTERN.matches(from) || DATE8_PATTERN.matches(to)) {
                // 날짜 범위
                val dtf       = DateTimeFormatter.ofPattern("yyyyMMdd")
                val startDate = runCatching { LocalDate.parse(from, dtf) }.getOrNull() ?: return emptyList()
                val endDate   = runCatching { LocalDate.parse(to,   dtf) }.getOrNull() ?: return emptyList()
                val stepUnit  = (config["stepUnit"] as? String) ?: "DAY"
                val result    = mutableListOf<String>()
                var cur = startDate
                while (!cur.isAfter(endDate)) {
                    result += cur.format(dtf)
                    cur = when (stepUnit) {
                        "MONTH" -> cur.plusMonths(step)
                        "YEAR"  -> cur.plusYears(step)
                        else    -> cur.plusDays(step)
                    }
                }
                result
            } else {
                // 숫자 범위
                val s = from.toLongOrNull() ?: return emptyList()
                val e = to.toLongOrNull()   ?: return emptyList()
                val result = mutableListOf<String>()
                var cur = s
                while (cur <= e) { result += cur.toString(); cur += step }
                result
            }
        }

        // 구형 호환: FOR_DATE
        if (loopType == "FOR_DATE") {
            val fmt       = (config["dateFormat"] as? String)?.takeIf { it.isNotBlank() } ?: "yyyyMMdd"
            val dtf       = DateTimeFormatter.ofPattern(fmt)
            val startDate = runCatching { LocalDate.parse(config["startDate"] as? String ?: "", dtf) }.getOrNull()
                ?: return emptyList()
            val endDate   = runCatching { LocalDate.parse(config["endDate"]   as? String ?: "", dtf) }.getOrNull()
                ?: return emptyList()
            val step      = (config["dateStep"] as? String)?.toLongOrNull()?.takeIf { it > 0 } ?: 1L
            val result    = mutableListOf<String>()
            var cur = startDate
            while (!cur.isAfter(endDate)) { result += cur.format(dtf); cur = cur.plusDays(step) }
            return result
        }

        // 구형 호환: FOR (start/end) 또는 LIST
        return when (loopType) {
            "FOR" -> {
                val start = (config["start"] as? String)?.toLongOrNull() ?: 0L
                val end   = (config["end"]   as? String)?.toLongOrNull() ?: 0L
                val step  = (config["step"]  as? String)?.toLongOrNull()?.takeIf { it != 0L } ?: 1L
                val result = mutableListOf<String>()
                if (step > 0 && start <= end) {
                    var cur = start; while (cur <= end) { result += cur.toString(); cur += step }
                } else if (step < 0 && start >= end) {
                    var cur = start; while (cur >= end) { result += cur.toString(); cur += step }
                }
                result
            }
            "LIST" -> {
                (config["listValues"] as? String)
                    ?.split(",")?.map { it.trim() }?.filter { it.isNotBlank() }
                    ?: emptyList()
            }
            else -> emptyList()
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
            // INSERT 없이 CTE SELECT만 실행하여 실제 적재될 데이터 미리 보기
            return try {
                val query = compiler.compileForPreview(plan, node)
                val conn = connectionService.get(query.connectionId)
                val jdbcUrl = connectionService.buildJdbcUrl(conn)
                val password = connectionService.getDecryptedPassword(conn.id)

                DriverManager.getConnection(jdbcUrl, conn.username, password).use { jdbc ->
                    jdbc.createStatement().use { stmt ->
                        stmt.executeQuery(query.sql).use { rs ->
                            val meta = rs.metaData
                            val columns = (1..meta.columnCount).map { meta.getColumnName(it) }
                            val rows = mutableListOf<List<Any?>>()
                            while (rs.next()) {
                                rows += (1..meta.columnCount).map { rs.getObject(it) }
                            }
                            val count = rows.size.toLong()
                            logs += "[PREVIEW] '${node.label}': ${count}행 (INSERT 미실행)"
                            NodeResult(
                                node.id, node.type.name, ExecutionStatus.SUCCESS,
                                rowsProcessed = count,
                                durationMs = System.currentTimeMillis() - startMs,
                                generatedSql = query.sql,
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

        return try {
            // 1. 이 Output 노드의 upstream 경로만 추적하여 CTE 기반 INSERT...SELECT SQL 컴파일
            val compiled = compiler.compile(plan, node)
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
                        // 커밋 성공 후 watermark 갱신 (R1 원자성 보장: write 먼저, watermark 나중)
                        runCatching { compiler.saveWatermarks(plan) }

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

    // ── T_LOG_ROW: upstream CTE 체인 실행 후 샘플 rows 캡처 ─────────

    // T_LOG_ROW는 Talend 규칙상 ROW 출력 1개만 허용.
    // 항상 downstream OUTPUT 노드의 매핑을 반영한 변환 후 데이터를 캡처합니다.
    private fun executeLogRowNode(
        node: NodeIR, plan: ExecutionPlan,
        logs: MutableList<String>, startMs: Long
    ): NodeResult {
        return try {
            // T_LOG_ROW → downstream ROW 엣지로 연결된 직접/간접 OUTPUT 노드
            val downstreamOutput = plan.ir.edges
                .filter { it.source == node.id && it.linkType == com.platform.etl.ir.LinkType.ROW }
                .mapNotNull { edge -> plan.ir.nodes.find { it.id == edge.target } }
                .firstOrNull { it.type == com.platform.etl.ir.ComponentType.T_JDBC_OUTPUT }

            if (downstreamOutput != null) {
                // downstream OUTPUT이 있으면: 해당 output의 매핑이 적용된 변환 후 데이터 캡처
                val query = compiler.compileForLogRowDownstream(plan, node, downstreamOutput)
                val conn = connectionService.get(query.connectionId)
                val jdbcUrl = connectionService.buildJdbcUrl(conn)
                val password = connectionService.getDecryptedPassword(conn.id)

                DriverManager.getConnection(jdbcUrl, conn.username, password).use { jdbc ->
                    jdbc.createStatement().use { stmt ->
                        stmt.executeQuery(query.sql).use { rs ->
                            val meta = rs.metaData
                            val columns = (1..meta.columnCount).map { meta.getColumnName(it) }
                            val rows = mutableListOf<List<Any?>>()
                            while (rs.next()) {
                                rows += (1..meta.columnCount).map { rs.getObject(it) }
                            }
                            val count = rows.size.toLong()
                            logs += "[LOG] '${node.label}' → '${downstreamOutput.label}': ${count}행 캡처"
                            NodeResult(
                                node.id, node.type.name, ExecutionStatus.SUCCESS,
                                rowsProcessed = count,
                                durationMs = System.currentTimeMillis() - startMs,
                                rowSamples = LogRowData(columns, rows)
                            )
                        }
                    }
                }
            } else {
                // OUTPUT 없음 (파이프라인 말단에 T_LOG_ROW) — upstream 데이터 캡처
                val query = compiler.compileForLogRow(plan, node)
                val conn = connectionService.get(query.connectionId)
                val jdbcUrl = connectionService.buildJdbcUrl(conn)
                val password = connectionService.getDecryptedPassword(conn.id)

                DriverManager.getConnection(jdbcUrl, conn.username, password).use { jdbc ->
                    jdbc.createStatement().use { stmt ->
                        stmt.executeQuery(query.sql).use { rs ->
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
            }
        } catch (e: Exception) {
            NodeResult(node.id, node.type.name, ExecutionStatus.FAILED,
                durationMs = System.currentTimeMillis() - startMs,
                errorMessage = e.message)
        }
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

    // ── tMap 컬럼 검증용 헬퍼 ───────────────────────────────────────

    /** tMap 노드에서 다운스트림 T_JDBC_OUTPUT 노드를 BFS로 탐색 */
    private fun findDownstreamOutput(startId: String, ir: JobIR): NodeIR? {
        val adj = ir.edges.groupBy { it.source }.mapValues { e -> e.value.map { it.target } }
        val visited = mutableSetOf<String>()
        val queue = ArrayDeque<String>()
        queue += (adj[startId] ?: emptyList())
        while (queue.isNotEmpty()) {
            val cur = queue.removeFirst()
            if (!visited.add(cur)) continue
            val node = ir.nodes.find { it.id == cur } ?: continue
            if (node.type == ComponentType.T_JDBC_OUTPUT) return node
            queue += (adj[cur] ?: emptyList())
        }
        return null
    }

    /** tMap config.mappings 파싱 → (targetName) 목록 반환 */
    @Suppress("UNCHECKED_CAST")
    private fun parseMappingsForValidation(raw: Any?): List<Pair<String, String>> =
        (raw as? List<*>)?.filterIsInstance<Map<*, *>>()?.mapNotNull { m ->
            val target = m["targetName"]?.toString() ?: return@mapNotNull null
            val source = m["sourceColumn"]?.toString() ?: ""
            Pair(target, source)
        } ?: emptyList()

    /** tOutput config.columns 파싱 → 컬럼명 목록 반환 */
    @Suppress("UNCHECKED_CAST")
    private fun parseTargetColumns(raw: Any?): List<String> =
        (raw as? List<*>)?.filterIsInstance<Map<*, *>>()?.mapNotNull { col ->
            col["columnName"]?.toString()
        } ?: emptyList()

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
