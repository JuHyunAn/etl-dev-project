package com.platform.etl.execution

import com.platform.etl.domain.connection.ConnectionService
import com.platform.etl.ir.*
import org.springframework.stereotype.Component
import java.util.UUID

/**
 * IR(JobIR) → CTE 기반 INSERT...SELECT SQL 컴파일러
 *
 * 파이프라인의 모든 변환 노드를 WITH 절(CTE)로 컴파일하고,
 * Output 노드의 연결에서 단일 INSERT 문으로 실행합니다.
 *
 * 크로스 스키마 지원: Input 노드의 커넥션 schema를 읽어 tableName에 자동 prefix.
 * (Input/Output이 같은 DB 서버, 다른 schema인 경우도 정상 동작)
 *
 * 지원 노드: T_JDBC_INPUT, T_MAP, T_FILTER_ROW, T_AGGREGATE_ROW,
 *            T_SORT_ROW, T_JOIN, T_UNION_ROW, T_CONVERT_TYPE, T_REPLACE, T_LOG_ROW
 */
@Component
class SqlPushdownCompiler(
    private val connectionService: ConnectionService,
    private val watermarkService: WatermarkService
) {

    data class CompiledPipeline(
        val sql: String,
        val outputConnectionId: UUID,
        val writeMode: String,
        val outputTable: String
    )

    data class MappingEntry(
        val sourceColumn: String,
        val targetName: String,
        val expression: String
    )

    /**
     * 특정 Output 노드를 대상으로 컴파일합니다.
     * 해당 Output 노드의 upstream ROW 경로만 추적하여 CTE를 생성합니다.
     * Multi-output 환경에서 각 Output마다 독립적인 SQL을 생성할 수 있습니다.
     */
    fun compile(plan: ExecutionPlan, targetOutputNode: NodeIR): CompiledPipeline {
        // Watermark 값을 읽어 Input 노드 config에 _watermarkWhere 주입
        val irWithWatermark = injectWatermarkConditions(plan)
        val planToCompile = plan.copy(ir = irWithWatermark)
        return compileInternal(planToCompile, targetOutputNode)
    }

    private fun compileInternal(plan: ExecutionPlan, targetOutputNode: NodeIR): CompiledPipeline {
        val ir = plan.ir
        val incomingEdges = ir.edges.groupBy { it.target }

        val outputConnId = targetOutputNode.config["connectionId"]?.toString()
            ?: throw IllegalStateException("Output 노드 '${targetOutputNode.label}'에 connectionId 미설정")
        val outputTable = targetOutputNode.config["tableName"]?.toString()
            ?: throw IllegalStateException("Output 노드 '${targetOutputNode.label}'에 tableName 미설정")
        val writeMode = targetOutputNode.config["writeMode"]?.toString() ?: "INSERT"

        // 이 Output 노드의 upstream 노드 ID 집합 (ROW 엣지 역추적)
        val upstreamIds = collectUpstreamIds(targetOutputNode.id, ir)

        // 위상 정렬 순서대로 CTE 생성 — 이 Output의 upstream에 해당하는 노드만 포함
        val ctes = mutableListOf<Pair<String, String>>()
        for (nodeId in plan.sortedNodeIds) {
            var node = ir.nodes.find { it.id == nodeId } ?: continue
            if (node.type == ComponentType.T_JDBC_OUTPUT) continue
            if (nodeId !in upstreamIds) continue

            // T_MAP: outputMappings[targetOutputNode.id]가 있으면 해당 매핑을 우선 적용
            if (node.type == ComponentType.T_MAP) {
                @Suppress("UNCHECKED_CAST")
                val outputMappings = node.config["outputMappings"] as? Map<String, Any?>
                val specificMappings = outputMappings?.get(targetOutputNode.id)
                if (specificMappings != null) {
                    node = node.copy(config = node.config + mapOf("mappings" to specificMappings))
                }
            }

            val predecessorIds = (incomingEdges[nodeId] ?: emptyList())
                .filter { it.linkType == LinkType.ROW }
                .map { it.source }
            val prevCte = predecessorIds.firstOrNull()?.let { cteNameOf(it) }

            val body = buildCteSql(node, prevCte, predecessorIds) ?: continue
            ctes.add(cteNameOf(nodeId) to body)
        }

        require(ctes.isNotEmpty()) { "Output '${targetOutputNode.label}'에 연결된 컴파일 가능한 노드가 없습니다" }

        val finalCte = ctes.last().first

        val outputCols = parseColumnList(targetOutputNode.config["columns"])
        val colDecl   = if (outputCols.isNotEmpty()) " (${outputCols.joinToString(", ")})" else ""
        val selectCols = if (outputCols.isNotEmpty()) outputCols.joinToString(", ") else "*"

        val withClause = "WITH\n" + ctes.joinToString(",\n\n") { (name, body) ->
            val indented = body.trimIndent().replace("\n", "\n  ")
            "$name AS (\n  $indented\n)"
        }

        val insertSql = "INSERT INTO $outputTable$colDecl\nSELECT $selectCols FROM $finalCte"

        return CompiledPipeline(
            sql = "$withClause\n$insertSql",
            outputConnectionId = UUID.fromString(outputConnId),
            writeMode = writeMode,
            outputTable = outputTable
        )
    }

    /**
     * 하위 호환용 — Output 노드가 하나일 때 사용합니다.
     */
    fun compile(plan: ExecutionPlan): CompiledPipeline {
        val outputNode = plan.ir.nodes.find { it.type == ComponentType.T_JDBC_OUTPUT }
            ?: throw IllegalStateException("T_JDBC_OUTPUT 노드가 없습니다")
        return compile(plan, outputNode)
    }

    /**
     * 실행 성공 후 watermark 갱신.
     * 반드시 타겟 write 완전 성공 확인 후 호출할 것.
     */
    fun saveWatermarks(plan: ExecutionPlan) {
        plan.ir.nodes
            .filter { it.type == ComponentType.T_JDBC_INPUT }
            .forEach { node ->
                @Suppress("UNCHECKED_CAST")
                val incremental = node.config["incremental"] as? Map<String, Any?> ?: return@forEach
                if (incremental["enabled"] != true) return@forEach

                val watermarkVar = incremental["watermarkVar"]?.toString() ?: return@forEach
                // _nextWatermark 는 실행 전 주입된 다음 watermark 값 (실행 시작 시각 UTC)
                val nextVal = node.config["_nextWatermark"]?.toString() ?: return@forEach

                watermarkService.save(plan.jobId, node.id, watermarkVar, nextVal)
            }
    }

    /**
     * IR의 T_JDBC_INPUT 노드에 watermark WHERE 조건을 주입.
     * - incremental.mode = TIMESTAMP: WHERE {column} >= '{watermark}' (패턴 A: >= + UPSERT)
     * - incremental.mode = OFFSET:    WHERE {column} > {watermark}
     * - watermark 없으면 (첫 실행) WHERE 조건 없음 → FULL SCAN
     * 또한 _nextWatermark = 현재 UTC 시각 (성공 후 저장용)
     */
    private fun injectWatermarkConditions(plan: ExecutionPlan): JobIR {
        val now = java.time.Instant.now().toString()  // UTC ISO-8601
        val updatedNodes = plan.ir.nodes.map { node ->
            if (node.type != ComponentType.T_JDBC_INPUT) return@map node

            @Suppress("UNCHECKED_CAST")
            val incremental = node.config["incremental"] as? Map<String, Any?> ?: return@map node
            if (incremental["enabled"] != true) return@map node

            val mode = incremental["mode"]?.toString() ?: "FULL"
            val column = incremental["column"]?.toString() ?: return@map node
            val watermarkVar = incremental["watermarkVar"]?.toString() ?: return@map node

            val lastValue = watermarkService.load(plan.jobId, node.id, watermarkVar)

            val whereClause = when {
                lastValue == null -> null  // 첫 실행: FULL SCAN
                mode == "TIMESTAMP" -> "$column >= '$lastValue'"   // 패턴 A: >=
                mode == "OFFSET"    -> "$column > $lastValue"      // OFFSET: >
                else -> null
            }

            val extraConfig = mutableMapOf<String, Any?>()
            if (whereClause != null) extraConfig["_watermarkWhere"] = whereClause
            extraConfig["_nextWatermark"] = now

            node.copy(config = node.config + extraConfig)
        }
        return plan.ir.copy(nodes = updatedNodes)
    }

    data class LogRowQuery(val sql: String, val connectionId: UUID)

    /**
     * tLog 노드까지의 CTE 체인을 빌드하여 실행 가능한 SELECT 쿼리를 반환합니다.
     * tMap 등 upstream 변환이 적용된 실제 데이터 흐름을 캡처합니다.
     */
    fun compileForLogRow(plan: ExecutionPlan, logNode: NodeIR, maxRows: Int = 100): LogRowQuery {
        val ir = plan.ir
        val incomingEdges = ir.edges.groupBy { it.target }

        val upstreamIds = collectUpstreamIds(logNode.id, ir)

        val inputNode = ir.nodes.find { it.id in upstreamIds && it.type == ComponentType.T_JDBC_INPUT }
            ?: throw IllegalStateException("tLog '${logNode.label}': upstream INPUT 노드를 찾을 수 없습니다")
        val connId = inputNode.config["connectionId"]?.toString()
            ?: throw IllegalStateException("tLog '${logNode.label}': upstream connectionId 미설정")

        val ctes = mutableListOf<Pair<String, String>>()
        for (nodeId in plan.sortedNodeIds) {
            val node = ir.nodes.find { it.id == nodeId } ?: continue
            if (node.type == ComponentType.T_JDBC_OUTPUT) continue
            if (nodeId !in upstreamIds) continue

            val predecessorIds = (incomingEdges[nodeId] ?: emptyList())
                .filter { it.linkType == LinkType.ROW }
                .map { it.source }
            val prevCte = predecessorIds.firstOrNull()?.let { cteNameOf(it) }

            val body = buildCteSql(node, prevCte, predecessorIds) ?: continue
            ctes.add(cteNameOf(nodeId) to body)
        }

        require(ctes.isNotEmpty()) { "tLog '${logNode.label}'에 연결된 컴파일 가능한 노드가 없습니다" }

        val finalCte = ctes.last().first
        val withClause = "WITH\n" + ctes.joinToString(",\n\n") { (name, body) ->
            val indented = body.trimIndent().replace("\n", "\n  ")
            "$name AS (\n  $indented\n)"
        }

        return LogRowQuery(
            sql = "$withClause\nSELECT * FROM $finalCte LIMIT $maxRows",
            connectionId = UUID.fromString(connId)
        )
    }

    /**
     * Preview Mode용: T_JDBC_OUTPUT 기준으로 upstream CTE 체인을 빌드하고
     * INSERT 없이 SELECT만 실행하여 실제 적재될 데이터를 미리 확인합니다.
     */
    fun compileForPreview(plan: ExecutionPlan, outputNode: NodeIR, maxRows: Int = 100): LogRowQuery {
        val ir = plan.ir
        val incomingEdges = ir.edges.groupBy { it.target }
        val upstreamIds = collectUpstreamIds(outputNode.id, ir)

        val inputNode = ir.nodes.find { it.id in upstreamIds && it.type == ComponentType.T_JDBC_INPUT }
            ?: throw IllegalStateException("Output '${outputNode.label}': upstream INPUT 노드를 찾을 수 없습니다")
        val connId = inputNode.config["connectionId"]?.toString()
            ?: throw IllegalStateException("Output '${outputNode.label}': upstream connectionId 미설정")

        val ctes = mutableListOf<Pair<String, String>>()
        for (nodeId in plan.sortedNodeIds) {
            var node = ir.nodes.find { it.id == nodeId } ?: continue
            if (node.type == ComponentType.T_JDBC_OUTPUT) continue
            if (nodeId !in upstreamIds) continue

            // T_MAP: outputNode별 매핑 적용
            if (node.type == ComponentType.T_MAP) {
                @Suppress("UNCHECKED_CAST")
                val outputMappings = node.config["outputMappings"] as? Map<String, Any?>
                val specificMappings = outputMappings?.get(outputNode.id)
                if (specificMappings != null) {
                    node = node.copy(config = node.config + mapOf("mappings" to specificMappings))
                }
            }

            val predecessorIds = (incomingEdges[nodeId] ?: emptyList())
                .filter { it.linkType == LinkType.ROW }
                .map { it.source }
            val prevCte = predecessorIds.firstOrNull()?.let { cteNameOf(it) }

            val body = buildCteSql(node, prevCte, predecessorIds) ?: continue
            ctes.add(cteNameOf(nodeId) to body)
        }

        require(ctes.isNotEmpty()) { "Output '${outputNode.label}'에 컴파일 가능한 upstream 노드가 없습니다" }

        val finalCte = ctes.last().first
        val withClause = "WITH\n" + ctes.joinToString(",\n\n") { (name, body) ->
            val indented = body.trimIndent().replace("\n", "\n  ")
            "$name AS (\n  $indented\n)"
        }

        return LogRowQuery(
            sql = "$withClause\nSELECT * FROM $finalCte LIMIT $maxRows",
            connectionId = UUID.fromString(connId)
        )
    }

    /**
     * 임의 노드(targetNode) 기준으로 upstream CTE 체인을 빌드하고 SELECT만 반환합니다.
     * - T_JDBC_OUTPUT이면 outputNode와 동일하므로 해당 output의 매핑을 적용합니다.
     * - T_MAP이면 outputNode가 주어질 때 해당 output 매핑 적용, 없으면 첫 번째 output 기준.
     * - 기타 변환 노드이면 targetNode까지의 CTE 체인을 그대로 SELECT.
     */
    fun compileForNodePreview(
        plan: ExecutionPlan,
        targetNode: NodeIR,
        outputNode: NodeIR? = null,
        maxRows: Int = 100
    ): LogRowQuery {
        val ir = plan.ir
        val incomingEdges = ir.edges.groupBy { it.target }

        // 실질적인 "조회 기준 노드" 결정:
        // OUTPUT이면 자기 자신, 아니면 targetNode 까지의 upstream 포함
        val resolvedOutputNode: NodeIR? = when {
            targetNode.type == ComponentType.T_JDBC_OUTPUT -> targetNode
            outputNode != null -> outputNode
            // T_MAP이면 downstream 첫 OUTPUT 탐색
            else -> ir.edges
                .filter { it.source == targetNode.id && it.linkType == LinkType.ROW }
                .mapNotNull { e -> ir.nodes.find { it.id == e.target } }
                .firstOrNull { it.type == ComponentType.T_JDBC_OUTPUT }
        }

        val upstreamIds = collectUpstreamIds(targetNode.id, ir) + targetNode.id

        val inputNode = ir.nodes.find { it.id in upstreamIds && it.type == ComponentType.T_JDBC_INPUT }
            ?: throw IllegalStateException("'${targetNode.label}': upstream INPUT 노드를 찾을 수 없습니다")
        val connId = inputNode.config["connectionId"]?.toString()
            ?: throw IllegalStateException("'${targetNode.label}': upstream connectionId 미설정")

        val ctes = mutableListOf<Pair<String, String>>()
        for (nodeId in plan.sortedNodeIds) {
            var node = ir.nodes.find { it.id == nodeId } ?: continue
            if (node.type == ComponentType.T_JDBC_OUTPUT) continue
            if (nodeId !in upstreamIds) continue

            // T_MAP: resolvedOutputNode 기준 매핑 적용
            if (node.type == ComponentType.T_MAP && resolvedOutputNode != null) {
                @Suppress("UNCHECKED_CAST")
                val outputMappings = node.config["outputMappings"] as? Map<String, Any?>
                val specificMappings = outputMappings?.get(resolvedOutputNode.id)
                    ?: outputMappings?.values?.firstOrNull()
                if (specificMappings != null) {
                    node = node.copy(config = node.config + mapOf("mappings" to specificMappings))
                }
            }

            val predecessorIds = (incomingEdges[nodeId] ?: emptyList())
                .filter { it.linkType == LinkType.ROW }
                .map { it.source }
            val prevCte = predecessorIds.firstOrNull()?.let { cteNameOf(it) }

            val body = buildCteSql(node, prevCte, predecessorIds) ?: continue
            ctes.add(cteNameOf(nodeId) to body)
        }

        require(ctes.isNotEmpty()) { "'${targetNode.label}' 노드에 컴파일 가능한 upstream이 없습니다" }

        val finalCte = ctes.last().first
        val withClause = "WITH\n" + ctes.joinToString(",\n\n") { (name, body) ->
            val indented = body.trimIndent().replace("\n", "\n  ")
            "$name AS (\n  $indented\n)"
        }

        return LogRowQuery(
            sql = "$withClause\nSELECT * FROM $finalCte LIMIT $maxRows",
            connectionId = UUID.fromString(connId)
        )
    }

    /**
     * T_LOG_ROW → 특정 T_JDBC_OUTPUT 사이의 변환 노드까지 포함하여 컴파일합니다.
     * T_LOG_ROW 이후 T_MAP 등 downstream 변환이 있을 때, 실제로 OUTPUT에 쓰일 데이터를 캡처합니다.
     */
    fun compileForLogRowDownstream(
        plan: ExecutionPlan,
        logNode: NodeIR,
        outputNode: NodeIR,
        maxRows: Int = 100
    ): LogRowQuery {
        val ir = plan.ir
        val incomingEdges = ir.edges.groupBy { it.target }

        // T_LOG_ROW의 upstream + T_LOG_ROW 자신 + OUTPUT까지 사이의 노드들
        val upstreamIds = collectUpstreamIds(logNode.id, ir)
        val betweenIds = collectUpstreamIds(outputNode.id, ir) - upstreamIds - outputNode.id + logNode.id
        val allIds = upstreamIds + betweenIds

        val inputNode = ir.nodes.find { it.id in upstreamIds && it.type == ComponentType.T_JDBC_INPUT }
            ?: throw IllegalStateException("tLog '${logNode.label}': upstream INPUT 노드를 찾을 수 없습니다")
        val connId = inputNode.config["connectionId"]?.toString()
            ?: throw IllegalStateException("tLog '${logNode.label}': upstream connectionId 미설정")

        val ctes = mutableListOf<Pair<String, String>>()
        for (nodeId in plan.sortedNodeIds) {
            var node = ir.nodes.find { it.id == nodeId } ?: continue
            if (node.type == ComponentType.T_JDBC_OUTPUT) continue
            if (nodeId !in allIds) continue

            // T_MAP: outputNode별 매핑 적용 (메인 컴파일러와 동일)
            if (node.type == ComponentType.T_MAP) {
                @Suppress("UNCHECKED_CAST")
                val outputMappings = node.config["outputMappings"] as? Map<String, Any?>
                val specificMappings = outputMappings?.get(outputNode.id)
                if (specificMappings != null) {
                    node = node.copy(config = node.config + mapOf("mappings" to specificMappings))
                }
            }

            val predecessorIds = (incomingEdges[nodeId] ?: emptyList())
                .filter { it.linkType == LinkType.ROW }
                .map { it.source }
            val prevCte = predecessorIds.firstOrNull()?.let { cteNameOf(it) }

            val body = buildCteSql(node, prevCte, predecessorIds) ?: continue
            ctes.add(cteNameOf(nodeId) to body)
        }

        require(ctes.isNotEmpty()) { "tLog '${logNode.label}' → '${outputNode.label}' 경로에 컴파일 가능한 노드가 없습니다" }

        val finalCte = ctes.last().first
        val withClause = "WITH\n" + ctes.joinToString(",\n\n") { (name, body) ->
            val indented = body.trimIndent().replace("\n", "\n  ")
            "$name AS (\n  $indented\n)"
        }

        return LogRowQuery(
            sql = "$withClause\nSELECT * FROM $finalCte LIMIT $maxRows",
            connectionId = UUID.fromString(connId)
        )
    }

    // ── CTE 이름 생성 (nodeId의 특수문자 → 언더스코어) ──────────
    fun cteNameOf(nodeId: String): String =
        "cte_${nodeId.replace(Regex("[^a-zA-Z0-9]"), "_")}"

    // ── 노드 타입별 CTE SQL 본문 생성 ───────────────────────────
    @Suppress("UNCHECKED_CAST")
    private fun buildCteSql(
        node: NodeIR,
        prevCte: String?,
        predecessorIds: List<String>
    ): String? {
        return when (node.type) {

        // ── Input ──────────────────────────────────────────────
        ComponentType.T_JDBC_INPUT -> {
            val query = node.config["query"]?.toString()
            val table = node.config["tableName"]?.toString()
            val cols  = parseColumnList(node.config["columns"])
            when {
                // 커스텀 query가 있으면 그대로 사용 (schema 처리는 쿼리 작성자 책임)
                !query.isNullOrBlank() -> query
                !table.isNullOrBlank() -> {
                    val colStr = if (cols.isNotEmpty()) cols.joinToString(", ") else "*"
                    // 테이블명에 schema prefix가 없으면 Input 커넥션의 schema를 자동으로 붙임.
                    val qualifiedTable = qualifyTableName(table, node.config["connectionId"]?.toString())
                    val baseSql = "SELECT $colStr FROM $qualifiedTable"
                    // Watermark 증분 WHERE 조건 추가 (_watermarkWhere 는 compile() 단계에서 주입)
                    val watermarkWhere = node.config["_watermarkWhere"]?.toString()
                    if (!watermarkWhere.isNullOrBlank()) "$baseSql WHERE $watermarkWhere" else baseSql
                }
                else -> null
            }
        }

        // ── Map (컬럼 매핑 + 표현식) ────────────────────────────
        ComponentType.T_MAP -> {
            val prev = prevCte ?: return null
            val mappings = parseMappings(node.config["mappings"])

            // Var 정의 파싱 (name → expression 맵)
            val varExprMap = parseVarExpressions(node.config["vars"])

            if (mappings.isEmpty()) {
                "SELECT * FROM $prev"
            } else {
                val exprs = mappings.joinToString(",\n    ") { m ->
                    val rawExpr = m.expression.ifBlank { m.sourceColumn }
                    val expr = expandExpression(rawExpr, varExprMap)
                    if (m.targetName.isNotBlank() && m.targetName != expr)
                        "$expr AS ${quoteIfNeeded(m.targetName)}"
                    else expr
                }
                "SELECT\n    $exprs\nFROM $prev"
            }
        }

        // ── Filter (WHERE 조건) ─────────────────────────────────
        ComponentType.T_FILTER_ROW -> {
            val prev = prevCte ?: return null
            val condition = node.config["condition"]?.toString()
            if (condition.isNullOrBlank()) "SELECT * FROM $prev"
            else "SELECT * FROM $prev\nWHERE $condition"
        }

        // ── Aggregate (GROUP BY) ────────────────────────────────
        ComponentType.T_AGGREGATE_ROW -> {
            val prev = prevCte ?: return null
            val groupBy = node.config["groupBy"]?.toString()
            val aggExprs = (node.config["aggregations"] as? List<*>)
                ?.filterIsInstance<Map<*, *>>()
                ?.joinToString(", ") { agg ->
                    val func  = agg["function"]?.toString() ?: "COUNT"
                    val col   = agg["column"]?.toString() ?: "*"
                    val alias = agg["alias"]?.toString()
                        ?: "${func.lowercase()}_${col.replace("*", "all")}"
                    "$func($col) AS $alias"
                } ?: "COUNT(*) AS cnt"

            buildString {
                append("SELECT ")
                if (!groupBy.isNullOrBlank()) append("$groupBy, ")
                append("$aggExprs\nFROM $prev")
                if (!groupBy.isNullOrBlank()) append("\nGROUP BY $groupBy")
            }
        }

        // ── Sort (ORDER BY) ─────────────────────────────────────
        ComponentType.T_SORT_ROW -> {
            val prev = prevCte ?: return null
            val sortCols = (node.config["columns"] as? List<*>)
                ?.filterIsInstance<Map<*, *>>()
                ?.mapNotNull { c ->
                    val col   = c["column"]?.toString() ?: return@mapNotNull null
                    val order = c["order"]?.toString() ?: "ASC"
                    "$col $order"
                }
            if (sortCols.isNullOrEmpty()) "SELECT * FROM $prev"
            else "SELECT * FROM $prev\nORDER BY ${sortCols.joinToString(", ")}"
        }

        // ── Join (INNER / LEFT / RIGHT) ─────────────────────────
        ComponentType.T_JOIN -> {
            if (predecessorIds.size < 2) return prevCte?.let { "SELECT * FROM $it" }
            val leftCte   = cteNameOf(predecessorIds[0])
            val rightCte  = cteNameOf(predecessorIds[1])
            val joinType  = node.config["joinType"]?.toString() ?: "INNER"
            val condition = node.config["condition"]?.toString() ?: "1=1"
            "SELECT l.*, r.*\nFROM $leftCte l\n$joinType JOIN $rightCte r ON $condition"
        }

        // ── Union (UNION ALL) ───────────────────────────────────
        ComponentType.T_UNION_ROW -> {
            if (predecessorIds.size < 2) return prevCte?.let { "SELECT * FROM $it" }
            predecessorIds.joinToString("\nUNION ALL\n") { "SELECT * FROM ${cteNameOf(it)}" }
        }

        // ── Convert Type ────────────────────────────────────────
        // expression 필드가 있으면 해당 식으로 변환, 없으면 CAST 생성.
        // 변환 결과는 동일 컬럼명으로 덮어씀 (서브쿼리 활용).
        ComponentType.T_CONVERT_TYPE -> {
            val prev = prevCte ?: return null
            val conversions = (node.config["conversions"] as? List<*>)
                ?.filterIsInstance<Map<*, *>>()
                ?.mapNotNull { c ->
                    val col  = c["column"]?.toString() ?: return@mapNotNull null
                    val expr = c["expression"]?.toString()
                        ?: c["targetType"]?.toString()?.let { "CAST($col AS $it)" }
                        ?: return@mapNotNull null
                    "$expr AS $col"
                }
            if (conversions.isNullOrEmpty()) "SELECT * FROM $prev"
            else {
                // 서브쿼리로 감싸 컬럼명 중복 없이 덮어씀
                val exprStr = conversions.joinToString(", ")
                "SELECT s.*\nFROM (\n  SELECT *, $exprStr\n  FROM $prev\n) s"
            }
        }

        // ── Replace (CASE WHEN 치환) ────────────────────────────
        ComponentType.T_REPLACE -> {
            val prev   = prevCte ?: return null
            val column = node.config["column"]?.toString() ?: return "SELECT * FROM $prev"
            val rules  = (node.config["rules"] as? List<*>)?.filterIsInstance<Map<*, *>>()
                ?: return "SELECT * FROM $prev"

            val caseExpr = buildString {
                append("CASE")
                var hasElse = false
                rules.forEach { rule ->
                    val from = rule["from"]?.toString()
                    val to   = rule["to"]?.toString()
                    val toSql = if (to == null) "NULL" else "'$to'"
                    if (from == null) { append("\n  ELSE $toSql"); hasElse = true }
                    else append("\n  WHEN $column = '$from' THEN $toSql")
                }
                if (!hasElse) append("\n  ELSE $column")
                append("\nEND AS $column")
            }
            "SELECT s.*\nFROM (\n  SELECT *, $caseExpr\n  FROM $prev\n) s"
        }

        // ── Log (pass-through) ──────────────────────────────────
        ComponentType.T_LOG_ROW -> prevCte?.let { "SELECT * FROM $it" }

        // ── 그 외 (pass-through) ────────────────────────────────
        else -> prevCte?.let { "SELECT * FROM $it" }
        }
    }

    // ── 유틸 ────────────────────────────────────────────────────

    /**
     * targetNodeId에서 ROW 엣지를 역방향으로 BFS하여 모든 upstream 노드 ID를 반환합니다.
     * 결과에 targetNodeId 자신도 포함됩니다.
     */
    private fun collectUpstreamIds(targetNodeId: String, ir: JobIR): Set<String> {
        val rowEdgesByTarget = ir.edges
            .filter { it.linkType == LinkType.ROW }
            .groupBy { it.target }
        val visited = mutableSetOf<String>()
        val queue   = ArrayDeque<String>()
        queue.add(targetNodeId)
        while (queue.isNotEmpty()) {
            val id = queue.removeFirst()
            if (visited.add(id)) {
                rowEdgesByTarget[id]?.forEach { queue.add(it.source) }
            }
        }
        return visited
    }

    /**
     * config["vars"] → { varName → sqlExpression } 맵 파싱.
     * vars 배열: [{ id, name, type, expression }, ...]
     */
    @Suppress("UNCHECKED_CAST")
    private fun parseVarExpressions(raw: Any?): Map<String, String> {
        val list = raw as? List<*> ?: return emptyMap()
        return list.filterIsInstance<Map<*, *>>().mapNotNull { v ->
            val name = v["name"]?.toString()?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val expr = v["expression"]?.toString() ?: ""
            name to expr
        }.toMap()
    }

    /**
     * Expression DSL 전개 (SQL Pushdown용):
     * - var.xxx  → 해당 Var의 expression을 재귀 전개 (괄호로 감쌈, 체이닝 지원)
     * - col.xxx  → xxx  (prefix 제거, 하위 호환)
     * - ctx.xxx  → xxx  (prefix 제거, 향후 context 값 주입 예정)
     * - prefix 없는 레거시 표현식 → 그대로 (하위 호환)
     */
    private fun expandExpression(expr: String, varExprMap: Map<String, String>, depth: Int = 0): String {
        if (depth > 10) return expr  // 순환 참조 안전장치

        var result = expr

        // var.xxx → 해당 Var expression 재귀 전개
        result = Regex("""(?<![A-Za-z0-9_])var\.([A-Za-z_][A-Za-z0-9_]*)""").replace(result) { match ->
            val varName = match.groupValues[1]
            val varExpr = varExprMap[varName]
            if (varExpr != null) "(${expandExpression(varExpr, varExprMap, depth + 1)})"
            else match.value  // 미존재 Var → 그대로 (validate 단계에서 오류 처리)
        }

        // col.xxx → xxx
        result = Regex("""(?<![A-Za-z0-9_])col\.([A-Za-z_][A-Za-z0-9_]*)""").replace(result) { match ->
            match.groupValues[1]
        }

        // ctx.xxx → xxx (향후 plan.ir.context 값으로 대체 예정)
        result = Regex("""(?<![A-Za-z0-9_])ctx\.([A-Za-z_][A-Za-z0-9_]*)""").replace(result) { match ->
            match.groupValues[1]
        }

        return result
    }

    @Suppress("UNCHECKED_CAST")
    private fun parseMappings(raw: Any?): List<MappingEntry> =
        (raw as? List<*>)?.filterIsInstance<Map<*, *>>()?.mapNotNull { m ->
            val source = m["sourceColumn"]?.toString() ?: return@mapNotNull null
            val target = m["targetName"]?.toString() ?: source
            val expr   = m["expression"]?.toString() ?: ""
            MappingEntry(source, target, expr)
        } ?: emptyList()

    @Suppress("UNCHECKED_CAST")
    private fun parseColumnList(raw: Any?): List<String> =
        (raw as? List<*>)?.filterIsInstance<Map<*, *>>()
            ?.mapNotNull { it["columnName"]?.toString() }
            ?: emptyList()

    private fun quoteIfNeeded(name: String): String =
        if (name.contains(' ') || name.contains('-') || name.all { it.isUpperCase() })
            "\"$name\""
        else name

    /**
     * 테이블명에 prefix가 없으면 커넥션 정보를 기반으로 자동으로 붙입니다.
     * - "emp"         → "source_schema.emp"  (PostgreSQL: schema prefix)
     * - "emp"         → "mydb.emp"           (MariaDB: database prefix — 이기종 크로스DB 참조 대비)
     * - "emp"         → "emp"                (PostgreSQL schema=null 이면 그대로)
     * - "source.emp"  → "source.emp"         (이미 prefix 있으면 그대로)
     */
    private fun qualifyTableName(tableName: String, connectionId: String?): String {
        if (tableName.contains('.')) return tableName
        if (connectionId.isNullOrBlank()) return tableName

        return try {
            val conn = connectionService.get(UUID.fromString(connectionId))
            val prefix = when (conn.dbType) {
                com.platform.etl.domain.connection.DbType.MARIADB ->
                    // database 공란(전체 접근)이면 prefix 없음 — 테이블명을 db.table 형식으로 직접 입력해야 함
                    // database 지정 커넥션이면 database명을 prefix로 사용
                    conn.database.ifBlank { null }
                com.platform.etl.domain.connection.DbType.ORACLE ->
                    conn.schema ?: conn.username
                com.platform.etl.domain.connection.DbType.POSTGRESQL ->
                    conn.schema  // null이면 prefix 없음 (현재 search_path 기본값 사용)
            }
            if (!prefix.isNullOrBlank()) "$prefix.$tableName" else tableName
        } catch (e: Exception) {
            tableName
        }
    }
}
