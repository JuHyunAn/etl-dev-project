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
    private val connectionService: ConnectionService
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

    fun compile(plan: ExecutionPlan): CompiledPipeline {
        val ir = plan.ir
        val incomingEdges = ir.edges.groupBy { it.target }

        val outputNode = ir.nodes.find { it.type == ComponentType.T_JDBC_OUTPUT }
            ?: throw IllegalStateException("T_JDBC_OUTPUT 노드가 없습니다")

        val outputConnId = outputNode.config["connectionId"]?.toString()
            ?: throw IllegalStateException("Output 노드에 connectionId 미설정")
        val outputTable = outputNode.config["tableName"]?.toString()
            ?: throw IllegalStateException("Output 노드에 tableName 미설정")
        val writeMode = outputNode.config["writeMode"]?.toString() ?: "INSERT"

        // 각 노드를 위상 정렬 순서대로 CTE로 변환 (Output 노드 제외)
        val ctes = mutableListOf<Pair<String, String>>() // cteName -> cte body sql
        for (nodeId in plan.sortedNodeIds) {
            val node = ir.nodes.find { it.id == nodeId } ?: continue
            if (node.type == ComponentType.T_JDBC_OUTPUT) continue

            // ROW 엣지만 데이터 파이프라인 predecessor로 취급 (TRIGGER는 실행 제어 흐름)
            val predecessorIds = (incomingEdges[nodeId] ?: emptyList())
                .filter { it.linkType == LinkType.ROW }
                .map { it.source }
            val prevCte = predecessorIds.firstOrNull()?.let { cteNameOf(it) }

            val body = buildCteSql(node, prevCte, predecessorIds) ?: continue
            ctes.add(cteNameOf(nodeId) to body)
        }

        require(ctes.isNotEmpty()) { "컴파일 가능한 노드가 없습니다" }

        val finalCte = ctes.last().first

        // Output 컬럼 목록
        val outputCols = parseColumnList(outputNode.config["columns"])
        val colDecl = if (outputCols.isNotEmpty()) " (${outputCols.joinToString(", ")})" else ""
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
                    // 이를 통해 Output 커넥션(다른 schema)에서 실행되어도 소스 테이블을 찾을 수 있음.
                    val qualifiedTable = qualifyTableName(table, node.config["connectionId"]?.toString())
                    "SELECT $colStr FROM $qualifiedTable"
                }
                else -> null
            }
        }

        // ── Map (컬럼 매핑 + 표현식) ────────────────────────────
        ComponentType.T_MAP -> {
            val prev = prevCte ?: return null
            val mappings = parseMappings(node.config["mappings"])
            if (mappings.isEmpty()) {
                "SELECT * FROM $prev"
            } else {
                val exprs = mappings.joinToString(",\n    ") { m ->
                    val expr = m.expression.ifBlank { m.sourceColumn }
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
     * 테이블명에 schema prefix가 없으면 Input 커넥션의 schema를 자동으로 붙입니다.
     * - "emp"            → "source_schema.emp"
     * - "source.emp"     → "source.emp" (이미 있으면 그대로)
     * - connectionId 없음 → 그대로
     */
    private fun qualifyTableName(tableName: String, connectionId: String?): String {
        // 이미 schema.table 형태이면 그대로 반환
        if (tableName.contains('.')) return tableName
        if (connectionId.isNullOrBlank()) return tableName

        return try {
            val conn = connectionService.get(UUID.fromString(connectionId))
            val schema = conn.schema
            if (!schema.isNullOrBlank()) "$schema.$tableName" else tableName
        } catch (e: Exception) {
            tableName  // 커넥션 조회 실패 시 원본 유지
        }
    }
}
