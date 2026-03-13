package com.platform.etl.execution

import com.platform.etl.domain.connection.ConnectionService
import com.platform.etl.domain.connection.DbType
import com.platform.etl.ir.*
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import java.sql.DriverManager
import java.sql.ResultSet
import java.time.LocalDateTime
import java.util.UUID

/**
 * 이기종 DB 실행 엔진.
 *
 * Input 노드(소스 DB)에서 청크 단위로 데이터를 fetch하고,
 * tMap/tFilter/tAggregateRow 등 변환을 인메모리로 적용한 뒤,
 * Output 노드(타겟 DB)에 배치 기록합니다.
 *
 * 지원 시나리오:
 *  - 이기종 DB 간 단순 복사 (Input → Output)
 *  - tMap 컬럼 매핑/표현식 적용 후 복사
 *  - Broadcast Join (소규모 테이블 전체 fetch → 대용량 스트리밍 룩업)
 *  - writeMode: INSERT | UPSERT | TRUNCATE_INSERT
 *
 * 제약:
 *  - 동일 서버 환경에서는 SqlPushdownAdapter 사용 (더 효율적)
 *  - tAggregateRow, tSortRow 등 집계/정렬은 현재 지원 안 됨 (SKIPPED)
 */
@Component
class FetchAndProcessExecutor(
    private val connectionService: ConnectionService
) : ExecutionEngine {

    override val engineType = "fetch_and_process"
    private val log = LoggerFactory.getLogger(javaClass)

    override fun validate(plan: ExecutionPlan): List<String> {
        val errors = mutableListOf<String>()
        val ir = plan.ir
        ir.nodes.filter { it.type == ComponentType.T_JDBC_INPUT }.forEach { node ->
            if (node.config["connectionId"] == null)
                errors += "Input 노드 '${node.label}': connectionId 미설정"
            if (node.config["tableName"] == null && node.config["query"] == null)
                errors += "Input 노드 '${node.label}': tableName 또는 query 미설정"
        }
        ir.nodes.filter { it.type == ComponentType.T_JDBC_OUTPUT }.forEach { node ->
            if (node.config["connectionId"] == null)
                errors += "Output 노드 '${node.label}': connectionId 미설정"
            if (node.config["tableName"] == null)
                errors += "Output 노드 '${node.label}': tableName 미설정"
        }
        return errors
    }

    override fun execute(plan: ExecutionPlan): ExecutionResult {
        val startedAt = LocalDateTime.now()
        val startMs = System.currentTimeMillis()
        val nodeResults = mutableMapOf<String, NodeResult>()
        val logs = mutableListOf<String>()

        logs += "[${LocalDateTime.now()}] Job 실행 시작 (Fetch-and-Process 경로): ${plan.jobId}"

        try {
            val ir = plan.ir
            val outputNodes = ir.nodes.filter { it.type == ComponentType.T_JDBC_OUTPUT }

            if (outputNodes.isEmpty()) {
                return buildResult(plan, ExecutionStatus.FAILED, startedAt, startMs,
                    nodeResults, logs, "Output 노드가 없습니다")
            }

            // context 변수 치환
            val resolvedPlan = resolvePlan(plan)

            // Output 노드별로 독립 파이프라인 실행
            for (outputNode in outputNodes) {
                val result = executePipeline(outputNode, resolvedPlan, logs)
                nodeResults[outputNode.id] = result
                if (result.status == ExecutionStatus.FAILED) {
                    logs += "[ERROR] Output '${outputNode.label}' 실패: ${result.errorMessage}"
                    return buildResult(resolvedPlan, ExecutionStatus.FAILED, startedAt, startMs,
                        nodeResults, logs, result.errorMessage)
                }
                logs += "[OK] Output '${outputNode.label}': ${result.rowsProcessed}행 적재 완료"
            }

            // T_LOG_ROW 노드 샘플 캡처 (성공 후)
            val logRowNodes = resolvedPlan.ir.nodes.filter { it.type == ComponentType.T_LOG_ROW }
            for (logNode in logRowNodes) {
                val sampleResult = captureLogRowSample(logNode, outputNodes, resolvedPlan, logs)
                if (sampleResult != null) nodeResults[logNode.id] = sampleResult
            }

            logs += "[${LocalDateTime.now()}] Job 완료 (Fetch-and-Process)"
            return buildResult(resolvedPlan, ExecutionStatus.SUCCESS, startedAt, startMs, nodeResults, logs, null)

        } catch (e: Exception) {
            log.error("FetchAndProcess 실행 실패: ${plan.jobId}", e)
            return buildResult(plan, ExecutionStatus.FAILED, startedAt, startMs, nodeResults, logs, e.message)
        }
    }

    // ── 파이프라인 실행 (단일 Output 노드 기준) ──────────────────

    private fun executePipeline(
        outputNode: NodeIR,
        plan: ExecutionPlan,
        logs: MutableList<String>
    ): NodeResult {
        val startMs = System.currentTimeMillis()
        val ir = plan.ir

        return try {
            // upstream 경로 수집 (ROW 엣지 역추적)
            val upstreamIds = collectUpstreamIds(outputNode.id, ir)
            val inputNode = ir.nodes.find { it.id in upstreamIds && it.type == ComponentType.T_JDBC_INPUT }
                ?: throw IllegalStateException("Output '${outputNode.label}'의 upstream Input 노드를 찾을 수 없습니다")

            // tMap 노드 수집 (upstream 순서대로)
            val sortedUpstream = topologicalOrder(plan.sortedNodeIds, upstreamIds)
            val mapNodes = sortedUpstream
                .mapNotNull { id -> ir.nodes.find { it.id == id && it.type == ComponentType.T_MAP } }

            // tFilter 노드 수집
            val filterNodes = sortedUpstream
                .mapNotNull { id -> ir.nodes.find { it.id == id && it.type == ComponentType.T_FILTER_ROW } }

            // Broadcast Join 대상 감지 (T_JOIN 노드 + LOOKUP 엣지)
            val joinNodes = sortedUpstream
                .mapNotNull { id -> ir.nodes.find { it.id == id && it.type == ComponentType.T_JOIN } }

            // 소스 커넥션
            val srcConnId = inputNode.config["connectionId"]?.toString()
                ?: throw IllegalStateException("Input connectionId 미설정")
            val srcConn = connectionService.get(UUID.fromString(srcConnId))
            val srcUrl  = connectionService.buildJdbcUrl(srcConn)
            val srcPwd  = connectionService.getDecryptedPassword(srcConn.id)

            // 타겟 커넥션
            val dstConnId = outputNode.config["connectionId"]?.toString()
                ?: throw IllegalStateException("Output connectionId 미설정")
            val dstConn = connectionService.get(UUID.fromString(dstConnId))
            val dstUrl  = connectionService.buildJdbcUrl(dstConn)
            val dstPwd  = connectionService.getDecryptedPassword(dstConn.id)
            val dstTable = outputNode.config["tableName"]?.toString()
                ?: throw IllegalStateException("Output tableName 미설정")
            val writeMode = outputNode.config["writeMode"]?.toString() ?: "INSERT"

            // 소스 쿼리 구성
            val srcQuery = buildSourceQuery(inputNode, srcConn.schema)
            logs += "[FAP] 소스: ${srcConn.host}:${srcConn.port} / ${inputNode.label}"
            logs += "[FAP] 타겟: ${dstConn.host}:${dstConn.port} / $dstTable ($writeMode)"
            logs += "[FAP] 쿼리: $srcQuery"

            // Broadcast 맵 구성 (JOIN 노드가 있는 경우)
            val broadcastMaps = buildBroadcastMaps(joinNodes, ir, logs)

            // tMap 매핑 준비
            val mappingEntries = extractMappings(mapNodes, outputNode)

            var totalRows = 0L

            // 타겟 커넥션으로 배치 기록
            DriverManager.getConnection(dstUrl, dstConn.username, dstPwd).use { dstJdbc ->
                dstJdbc.autoCommit = false

                // 타겟 컬럼 결정
                val targetColumns = resolveTargetColumns(outputNode, mappingEntries)
                val pkColumns = parsePkColumns(outputNode)

                val writer = TargetWriter(
                    jdbc = dstJdbc,
                    dbType = dstConn.dbType,
                    table = dstTable,
                    columns = targetColumns,
                    pkColumns = pkColumns,
                    writeMode = writeMode
                )

                // 소스에서 청크 단위로 fetch
                DriverManager.getConnection(srcUrl, srcConn.username, srcPwd).use { srcJdbc ->
                    srcJdbc.createStatement(
                        ResultSet.TYPE_FORWARD_ONLY,
                        ResultSet.CONCUR_READ_ONLY
                    ).also {
                        it.fetchSize = CHUNK_SIZE
                    }.use { stmt ->
                        stmt.executeQuery(srcQuery).use { rs ->
                            val meta = rs.metaData
                            val srcColumns = (1..meta.columnCount).map { meta.getColumnName(it) }

                            val batch = mutableListOf<List<Any?>>()
                            while (rs.next()) {
                                if (plan.cancelFlag.get()) {
                                    logs += "[FAP] 취소 요청으로 실행 중단"
                                    throw InterruptedException("실행이 취소되었습니다")
                                }
                                val srcRow = srcColumns.map { col ->
                                    runCatching { rs.getObject(col) }.getOrNull()
                                }

                                // tFilter 적용
                                if (!applyFilters(filterNodes, srcColumns, srcRow)) continue

                                // tMap 변환 적용 + Broadcast JOIN 룩업
                                val dstRow = applyMappings(
                                    mappingEntries, srcColumns, srcRow,
                                    broadcastMaps, targetColumns
                                )

                                batch += dstRow
                                if (batch.size >= CHUNK_SIZE) {
                                    writer.writeBatch(batch)
                                    totalRows += batch.size
                                    logs += "[FAP] ${totalRows}행 처리 중..."
                                    batch.clear()
                                }
                            }
                            if (batch.isNotEmpty()) {
                                writer.writeBatch(batch)
                                totalRows += batch.size
                            }
                        }
                    }
                }

                dstJdbc.commit()
                logs += "[FAP] 커밋 완료"
            }

            logs += "[FAP] '${outputNode.label}': ${totalRows}행 적재 완료"
            NodeResult(outputNode.id, outputNode.type.name, ExecutionStatus.SUCCESS,
                rowsProcessed = totalRows,
                durationMs = System.currentTimeMillis() - startMs)

        } catch (e: Exception) {
            NodeResult(outputNode.id, outputNode.type.name, ExecutionStatus.FAILED,
                durationMs = System.currentTimeMillis() - startMs,
                errorMessage = e.message)
        }
    }

    // ── T_LOG_ROW 샘플 캡처 (FAP 경로) ────────────────────────────

    private fun captureLogRowSample(
        logNode: NodeIR,
        outputNodes: List<NodeIR>,
        plan: ExecutionPlan,
        logs: MutableList<String>
    ): NodeResult? {
        val startMs = System.currentTimeMillis()
        return try {
            val ir = plan.ir
            val upstreamIds = collectUpstreamIds(logNode.id, ir)
            val inputNode = ir.nodes.find { it.id in upstreamIds && it.type == ComponentType.T_JDBC_INPUT }
                ?: return null

            val srcConnId = inputNode.config["connectionId"]?.toString() ?: return null
            val srcConn = connectionService.get(UUID.fromString(srcConnId))
            val srcUrl = connectionService.buildJdbcUrl(srcConn)
            val srcPwd = connectionService.getDecryptedPassword(srcConn.id)
            val srcQuery = buildSourceQuery(inputNode, srcConn.schema)

            // 이 T_LOG_ROW에 직접 연결된 downstream OUTPUT 노드 목록
            val downstreamOutputs = ir.edges
                .filter { it.source == logNode.id && it.linkType == com.platform.etl.ir.LinkType.ROW }
                .mapNotNull { edge -> outputNodes.find { it.id == edge.target } }

            val sortedUpstream = topologicalOrder(plan.sortedNodeIds, upstreamIds)
            val mapNodes = sortedUpstream
                .mapNotNull { id -> ir.nodes.find { it.id == id && it.type == ComponentType.T_MAP } }
            val filterNodes = sortedUpstream
                .mapNotNull { id -> ir.nodes.find { it.id == id && it.type == ComponentType.T_FILTER_ROW } }
            val joinNodes = sortedUpstream
                .mapNotNull { id -> ir.nodes.find { it.id == id && it.type == ComponentType.T_JOIN } }
            val broadcastMaps = buildBroadcastMaps(joinNodes, ir, logs)

            if (downstreamOutputs.size > 1) {
                // Output별 매핑을 각각 적용해서 tableRowSamples 구성
                val tableRowSamples = mutableMapOf<String, LogRowData>()

                DriverManager.getConnection(srcUrl, srcConn.username, srcPwd).use { srcJdbc ->
                    for (outputNode in downstreamOutputs) {
                        val mappingEntries = extractMappings(mapNodes, outputNode)
                        val targetColumns = resolveTargetColumns(outputNode, mappingEntries)
                        // display 컬럼: output 노드의 실제 타겟 스키마 우선 (output마다 다른 컬럼 구성 반영)
                        val configCols = parseColumnList(outputNode.config["columns"])
                        val displayCols = configCols.takeIf { it.isNotEmpty() } ?: targetColumns

                        val rows = mutableListOf<List<Any?>>()

                        srcJdbc.createStatement().use { stmt ->
                            stmt.executeQuery(srcQuery).use { rs ->
                                val meta = rs.metaData
                                val srcColumns = (1..meta.columnCount).map { meta.getColumnName(it) }
                                var count = 0
                                while (rs.next() && count < LOG_SAMPLE_ROWS) {
                                    val srcRow = srcColumns.map { col -> runCatching { rs.getObject(col) }.getOrNull() }
                                    if (!applyFilters(filterNodes, srcColumns, srcRow)) continue
                                    // 매핑 적용 → {targetName: value} 맵 구성
                                    val dstRow = if (mappingEntries.isEmpty() && targetColumns.isEmpty()) srcRow
                                        else applyMappings(mappingEntries, srcColumns, srcRow, broadcastMaps, targetColumns)
                                    val valueMap: Map<String, Any?> = targetColumns.zip(dstRow).toMap()
                                        .let { m -> m + srcColumns.zip(srcRow).filter { (k, _) -> !m.containsKey(k) } }
                                    // displayCols 순서로 값 재정렬
                                    val displayRow = if (displayCols == targetColumns) dstRow
                                        else displayCols.map { col ->
                                            valueMap[col]
                                                ?: valueMap[col.lowercase()]
                                                ?: valueMap[col.uppercase()]
                                                ?: valueMap.entries.firstOrNull { it.key.equals(col, ignoreCase = true) }?.value
                                        }
                                    rows += displayRow
                                    count++
                                }
                            }
                        }

                        val tableName = outputNode.config["tableName"]?.toString() ?: outputNode.label
                        // 탭 key: 테이블명 기준, 중복 시 label로 구분
                        val tableKey = if (tableRowSamples.containsKey(tableName)) "${outputNode.label}:$tableName" else tableName
                        tableRowSamples[tableKey] = LogRowData(displayCols.ifEmpty { listOf() }, rows)
                        logs += "[LOG] '${logNode.label}' → '$tableKey': ${rows.size}행 캡처 (FAP)"
                    }
                }

                NodeResult(logNode.id, logNode.type.name, ExecutionStatus.SUCCESS,
                    rowsProcessed = tableRowSamples.values.maxOfOrNull { it.rows.size.toLong() } ?: 0,
                    durationMs = System.currentTimeMillis() - startMs,
                    tableRowSamples = tableRowSamples)
            } else {
                // 단일 Output 또는 Output 없음: 첫 번째 Output 매핑 적용
                val outputNode = downstreamOutputs.firstOrNull()
                val mappingEntries = if (outputNode != null) extractMappings(mapNodes, outputNode) else emptyList()
                val targetColumns = if (outputNode != null) resolveTargetColumns(outputNode, mappingEntries) else emptyList()
                val rows = mutableListOf<List<Any?>>()
                var sampleCols: List<String> = targetColumns

                DriverManager.getConnection(srcUrl, srcConn.username, srcPwd).use { srcJdbc ->
                    srcJdbc.createStatement().use { stmt ->
                        stmt.executeQuery(srcQuery).use { rs ->
                            val meta = rs.metaData
                            val srcColumns = (1..meta.columnCount).map { meta.getColumnName(it) }
                            if (targetColumns.isEmpty()) sampleCols = srcColumns
                            var count = 0
                            while (rs.next() && count < LOG_SAMPLE_ROWS) {
                                val srcRow = srcColumns.map { col -> runCatching { rs.getObject(col) }.getOrNull() }
                                if (!applyFilters(filterNodes, srcColumns, srcRow)) continue
                                val dstRow = if (mappingEntries.isEmpty() && targetColumns.isEmpty()) srcRow
                                    else applyMappings(mappingEntries, srcColumns, srcRow, broadcastMaps, targetColumns)
                                rows += dstRow
                                count++
                            }
                        }
                    }
                }

                logs += "[LOG] '${logNode.label}': ${rows.size}행 캡처 (FAP)"
                NodeResult(logNode.id, logNode.type.name, ExecutionStatus.SUCCESS,
                    rowsProcessed = rows.size.toLong(),
                    durationMs = System.currentTimeMillis() - startMs,
                    rowSamples = LogRowData(sampleCols, rows))
            }
        } catch (e: Exception) {
            logs += "[LOG] '${logNode.label}' 캡처 실패: ${e.message}"
            null
        }
    }

    private val LOG_SAMPLE_ROWS = 100

    // ── 소스 쿼리 구성 ────────────────────────────────────────────

    private fun buildSourceQuery(inputNode: NodeIR, schema: String?): String {
        val query = inputNode.config["query"]?.toString()
        if (!query.isNullOrBlank()) return query

        val table = inputNode.config["tableName"]?.toString()
            ?: throw IllegalStateException("Input 노드에 tableName 또는 query 미설정")
        val qualifiedTable = if (!schema.isNullOrBlank() && !table.contains(".")) "$schema.$table" else table

        val cols = parseColumnList(inputNode.config["columns"])
        val colStr = if (cols.isNotEmpty()) cols.joinToString(", ") else "*"
        return "SELECT $colStr FROM $qualifiedTable"
    }

    // ── tMap 매핑 준비 ────────────────────────────────────────────

    private data class MappingEntry(
        val sourceColumn: String,
        val targetName: String,
        val expression: String
    )

    private fun extractMappings(mapNodes: List<NodeIR>, outputNode: NodeIR): List<MappingEntry> {
        if (mapNodes.isEmpty()) return emptyList()

        val lastMap = mapNodes.last()

        // outputMappings[outputNode.id] 우선, 없으면 config["mappings"]
        @Suppress("UNCHECKED_CAST")
        val outputMappings = lastMap.config["outputMappings"] as? Map<String, Any?>
        val rawMappings = outputMappings?.get(outputNode.id) ?: lastMap.config["mappings"]

        return parseMappingEntries(rawMappings)
    }

    @Suppress("UNCHECKED_CAST")
    private fun parseMappingEntries(raw: Any?): List<MappingEntry> {
        val list = raw as? List<*> ?: return emptyList()
        return list.mapNotNull { item ->
            val map = item as? Map<String, Any?> ?: return@mapNotNull null
            val src = map["sourceColumn"]?.toString() ?: return@mapNotNull null
            val tgt = map["targetName"]?.toString() ?: src
            val exp = map["expression"]?.toString()?.takeIf { it.isNotBlank() } ?: src
            MappingEntry(src, tgt, exp)
        }
    }

    // ── tFilter 적용 ──────────────────────────────────────────────

    private fun applyFilters(
        filterNodes: List<NodeIR>,
        columns: List<String>,
        row: List<Any?>
    ): Boolean {
        for (filterNode in filterNodes) {
            val condition = filterNode.config["condition"]?.toString() ?: continue
            if (!evaluateSimpleCondition(condition, columns, row)) return false
        }
        return true
    }

    /**
     * 단순 조건 평가: `col = 'value'`, `col IS NOT NULL`, `col > 0` 등.
     * 복잡한 조건(AND/OR 중첩, 서브쿼리 등)은 미지원 → true 반환(통과).
     */
    private fun evaluateSimpleCondition(condition: String, columns: List<String>, row: List<Any?>): Boolean {
        return try {
            val colMap = columns.zip(row).toMap()
            val c = condition.trim()

            // IS NULL / IS NOT NULL
            if (c.contains("IS NOT NULL", ignoreCase = true)) {
                val col = c.replace(Regex("(?i)IS NOT NULL"), "").trim()
                return colMap[col] != null
            }
            if (c.contains("IS NULL", ignoreCase = true)) {
                val col = c.replace(Regex("(?i)IS NULL"), "").trim()
                return colMap[col] == null
            }
            // = 비교
            if (c.contains("=") && !c.contains("!=") && !c.contains(">=") && !c.contains("<=")) {
                val parts = c.split("=")
                if (parts.size == 2) {
                    val col = parts[0].trim()
                    val expected = parts[1].trim().removeSurrounding("'")
                    return colMap[col]?.toString() == expected
                }
            }
            true   // 복잡한 조건은 통과
        } catch (_: Exception) {
            true
        }
    }

    // ── 컬럼 매핑 + 표현식 적용 ───────────────────────────────────

    private fun applyMappings(
        mappings: List<MappingEntry>,
        srcColumns: List<String>,
        srcRow: List<Any?>,
        broadcastMaps: Map<String, Map<Any?, Map<String, Any?>>>,
        targetColumns: List<String>
    ): List<Any?> {
        val srcMap = srcColumns.zip(srcRow).toMap().toMutableMap()

        // Broadcast JOIN 룩업 결과를 srcMap에 병합
        broadcastMaps.forEach { (_, hashMap) ->
            // 조인 키 추정: hashMap의 첫 번째 키와 srcMap의 컬럼명 매칭 시도
            val joinKeyCol = srcMap.keys.firstOrNull { hashMap.containsKey(srcMap[it]) }
            if (joinKeyCol != null) {
                val lookupResult = hashMap[srcMap[joinKeyCol]]
                lookupResult?.forEach { (k, v) -> srcMap.putIfAbsent(k, v) }
            }
        }

        if (mappings.isEmpty()) {
            // 매핑 없으면 타겟 컬럼명으로 소스 맵에서 대소문자 무관 조회
            return targetColumns.map { tgtCol ->
                srcMap[tgtCol]
                    ?: srcMap[tgtCol.lowercase()]
                    ?: srcMap[tgtCol.uppercase()]
                    ?: srcMap.entries.firstOrNull { it.key.equals(tgtCol, ignoreCase = true) }?.value
            }
        }

        return mappings.map { entry ->
            evaluateExpression(entry.expression, srcMap)
        }
    }

    /**
     * Expression 평가 (단순 패턴만 처리).
     * 복잡한 표현식은 소스 컬럼값 그대로 반환.
     */
    private fun evaluateExpression(expr: String, colMap: Map<String, Any?>): Any? {
        val e = expr.trim()

        // 대소문자 무관 컬럼 조회 헬퍼
        fun lookupCol(name: String): Any? =
            colMap[name]
                ?: colMap[name.lowercase()]
                ?: colMap[name.uppercase()]
                ?: colMap.entries.firstOrNull { it.key.equals(name, ignoreCase = true) }?.value

        // 단순 컬럼 참조 (exact)
        if (colMap.containsKey(e)) return colMap[e]

        // table.column 점 표기 처리 (row1.emp_id → emp_id)
        if (e.contains('.') && !e.contains('(')) {
            val colName = e.substringAfterLast('.')
            return lookupCol(colName)
        }

        // CAST(col AS TYPE) — 타입 변환은 JDBC에 위임, 값만 추출
        val castMatch = Regex("""(?i)CAST\(([^)]+)\s+AS\s+\w+\)""").find(e)
        if (castMatch != null) {
            val col = castMatch.groupValues[1].trim()
            return lookupCol(col)
        }

        // UPPER(TRIM(col)) 또는 UPPER(col) — TRIM보다 먼저 검사
        val upperMatch = Regex("""(?i)UPPER\(TRIM\(([^)]+)\)\)""").find(e)
            ?: Regex("""(?i)UPPER\(([^)]+)\)""").find(e)
        if (upperMatch != null) {
            val col = upperMatch.groupValues[1].trim()
            return lookupCol(col)?.toString()?.trim()?.uppercase()
        }

        // TRIM(col)
        val trimMatch = Regex("""(?i)TRIM\(([^)]+)\)""").find(e)
        if (trimMatch != null) {
            val col = trimMatch.groupValues[1].trim()
            return lookupCol(col)?.toString()?.trim()
        }

        // COALESCE(col, default)
        val coalesceMatch = Regex("""(?i)COALESCE\(([^,]+),\s*(.+)\)""").find(e)
        if (coalesceMatch != null) {
            val col = coalesceMatch.groupValues[1].trim()
            val default = coalesceMatch.groupValues[2].trim().removeSurrounding("'")
            val value = lookupCol(col)
            return value ?: (default.toDoubleOrNull() ?: default)
        }

        // 리터럴 문자열
        if (e.startsWith("'") && e.endsWith("'")) return e.removeSurrounding("'")

        // 숫자 리터럴
        e.toLongOrNull()?.let { return it }
        e.toDoubleOrNull()?.let { return it }

        // 최종 fallback: 대소문자 무관 컬럼 조회
        return lookupCol(e)
    }

    // ── Broadcast Join ────────────────────────────────────────────

    private fun buildBroadcastMaps(
        joinNodes: List<NodeIR>,
        ir: JobIR,
        logs: MutableList<String>
    ): Map<String, Map<Any?, Map<String, Any?>>> {
        if (joinNodes.isEmpty()) return emptyMap()

        val result = mutableMapOf<String, Map<Any?, Map<String, Any?>>>()

        for (joinNode in joinNodes) {
            // LOOKUP 엣지로 연결된 소규모 Input 노드 찾기
            val lookupEdge = ir.edges.find {
                it.target == joinNode.id && it.linkType == LinkType.LOOKUP
            } ?: continue
            val lookupInputNode = ir.nodes.find {
                it.id == lookupEdge.source && it.type == ComponentType.T_JDBC_INPUT
            } ?: continue

            val connId = lookupInputNode.config["connectionId"]?.toString() ?: continue
            val conn = runCatching { connectionService.get(UUID.fromString(connId)) }.getOrNull() ?: continue
            val url  = connectionService.buildJdbcUrl(conn)
            val pwd  = connectionService.getDecryptedPassword(conn.id)
            val query = buildSourceQuery(lookupInputNode, conn.schema)
            val joinKey = joinNode.config["joinKey"]?.toString()

            logs += "[FAP] Broadcast 테이블 로딩: ${lookupInputNode.label} (최대 ${MAX_BROADCAST_ROWS}행)"

            val hashMap = mutableMapOf<Any?, MutableMap<String, Any?>>()
            var rowCount = 0

            DriverManager.getConnection(url, conn.username, pwd).use { jdbc ->
                jdbc.createStatement().use { stmt ->
                    stmt.executeQuery(query).use { rs ->
                        val meta = rs.metaData
                        val cols = (1..meta.columnCount).map { meta.getColumnName(it) }
                        val keyCol = joinKey ?: cols.firstOrNull()

                        while (rs.next()) {
                            if (rowCount >= MAX_BROADCAST_ROWS) {
                                logs += "[FAP] ⚠️ Broadcast 크기 초과(${MAX_BROADCAST_ROWS}행) — 이후 데이터 무시"
                                break
                            }
                            val row = cols.associateWith { c ->
                                runCatching { rs.getObject(c) }.getOrNull()
                            }.toMutableMap()
                            val key = if (keyCol != null) rs.getObject(keyCol) else rowCount
                            hashMap[key] = row
                            rowCount++
                        }
                    }
                }
            }

            logs += "[FAP] Broadcast 로드 완료: ${lookupInputNode.label} ${rowCount}행"
            result[joinNode.id] = hashMap
        }

        return result
    }

    // ── 타겟 컬럼 결정 ────────────────────────────────────────────

    private fun resolveTargetColumns(outputNode: NodeIR, mappings: List<MappingEntry>): List<String> {
        // 1순위: tMap 매핑의 targetName — dstRow 값 순서와 반드시 일치해야 함
        if (mappings.isNotEmpty()) return mappings.map { it.targetName }

        // 2순위: Output 노드 config.columns (매핑 없을 때 사용)
        val configCols = parseColumnList(outputNode.config["columns"])
        if (configCols.isNotEmpty()) return configCols

        // 3순위: 빈 목록 (INSERT 시 컬럼 선언 없이 실행)
        return emptyList()
    }

    private fun parsePkColumns(outputNode: NodeIR): List<String> {
        @Suppress("UNCHECKED_CAST")
        val pk = outputNode.config["pkColumns"]
        return when (pk) {
            is List<*> -> pk.mapNotNull { it?.toString() }
            is String  -> pk.split(",").map { it.trim() }.filter { it.isNotBlank() }
            else -> emptyList()
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun parseColumnList(raw: Any?): List<String> = when (raw) {
        is List<*> -> raw.mapNotNull { item ->
            when (item) {
                is String -> item
                is Map<*, *> -> (item as? Map<String, Any?>)?.get("name")?.toString()
                else -> null
            }
        }.filter { it.isNotBlank() }
        is String  -> if (raw.isBlank()) emptyList() else raw.split(",").map { it.trim() }
        else -> emptyList()
    }

    // ── 위상 정렬 내 upstream 필터링 ─────────────────────────────

    private fun topologicalOrder(sortedIds: List<String>, upstreamIds: Set<String>): List<String> =
        sortedIds.filter { it in upstreamIds }

    private fun collectUpstreamIds(nodeId: String, ir: JobIR): Set<String> {
        val visited = mutableSetOf<String>()
        val queue   = ArrayDeque<String>()
        ir.edges.filter { it.target == nodeId && it.linkType == LinkType.ROW }
            .forEach { queue.add(it.source) }
        while (queue.isNotEmpty()) {
            val id = queue.removeFirst()
            if (visited.add(id)) {
                ir.edges.filter { it.target == id && it.linkType == LinkType.ROW }
                    .forEach { queue.add(it.source) }
            }
        }
        return visited
    }

    // ── 결과 빌더 ─────────────────────────────────────────────────

    private fun buildResult(
        plan: ExecutionPlan, status: ExecutionStatus,
        startedAt: LocalDateTime, startMs: Long,
        nodeResults: Map<String, NodeResult>,
        logs: List<String>, errorMessage: String?
    ): ExecutionResult {
        val now = LocalDateTime.now()
        return ExecutionResult(
            executionId = plan.executionId,
            jobId = plan.jobId,
            status = status,
            startedAt = startedAt,
            finishedAt = now,
            durationMs = System.currentTimeMillis() - startMs,
            nodeResults = nodeResults,
            errorMessage = errorMessage,
            logs = logs
        )
    }

    // ── context 변수 치환 ─────────────────────────────────────────

    private val contextPattern = Regex("""context\.([A-Za-z_][A-Za-z0-9_]*)""")

    private fun resolveStr(value: String, context: Map<String, String>): String =
        contextPattern.replace(value) { mr -> context[mr.groupValues[1]] ?: mr.value }

    @Suppress("UNCHECKED_CAST")
    private fun resolveAny(value: Any?, context: Map<String, String>): Any? = when {
        context.isEmpty() -> value
        value is String   -> resolveStr(value, context)
        value is List<*>  -> value.map { resolveAny(it, context) }
        value is Map<*, *> -> (value as Map<String, Any?>).mapValues { resolveAny(it.value, context) }
        else -> value
    }

    private fun resolvePlan(plan: ExecutionPlan): ExecutionPlan {
        if (plan.context.isEmpty()) return plan
        return plan.copy(
            ir = plan.ir.copy(nodes = plan.ir.nodes.map { node ->
                node.copy(config = node.config.mapValues { resolveAny(it.value, plan.context) })
            })
        )
    }

    companion object {
        const val CHUNK_SIZE = 10_000
        const val MAX_BROADCAST_ROWS = 1_000_000  // OOM 방지 상한
    }
}
