package com.platform.etl.execution

import com.fasterxml.jackson.databind.ObjectMapper
import com.platform.etl.domain.job.JobRepository
import com.platform.etl.domain.job.JobService
import com.platform.etl.ir.JobIR
import org.springframework.data.domain.Page
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.stereotype.Service
import java.time.LocalDateTime
import java.time.Duration
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

data class ExecutionSummaryDto(
    val id: UUID,
    val jobId: UUID,
    val jobName: String,
    val jobVersion: String,
    val status: ExecutionStatus,
    val previewMode: Boolean,
    val startedAt: LocalDateTime,
    val finishedAt: LocalDateTime?,
    val durationMs: Long?,
    val errorMessage: String?,
    val triggeredBy: String
)

@Service
class ExecutionService(
    private val jobService: JobService,
    private val jobRepository: JobRepository,
    private val executionRepository: ExecutionRepository,
    private val sqlPushdownAdapter: SqlPushdownAdapter,
    private val executionRouter: ExecutionRouter,
    private val executionLockService: ExecutionLockService,
    private val objectMapper: ObjectMapper,
    private val contextFunctionEvaluator: ContextFunctionEvaluator
) {
    private val log = org.slf4j.LoggerFactory.getLogger(javaClass)
    // cancelToken → cancelFlag 레지스트리
    private val cancelRegistry = ConcurrentHashMap<String, AtomicBoolean>()

    fun cancel(cancelToken: String): Boolean {
        val flag = cancelRegistry[cancelToken] ?: return false
        flag.set(true)
        log.info("[CANCEL] cancelToken=$cancelToken 취소 요청")
        return true
    }

    fun execute(
        jobId: UUID,
        context: Map<String, String> = emptyMap(),
        previewMode: Boolean = false,
        triggeredBy: String = "manual",
        cancelToken: String? = null
    ): ExecutionResult {
        // 동시 실행 방지 (previewMode는 잠금 불필요)
        if (!previewMode && !executionLockService.tryLock(jobId)) {
            val msg = "Job $jobId 가 이미 실행 중입니다. 중복 실행을 방지합니다."
            log.warn("[LOCK] {}", msg)
            val now = LocalDateTime.now()
            return ExecutionResult(
                executionId = UUID.randomUUID(),
                jobId = jobId,
                status = ExecutionStatus.FAILED,
                startedAt = now,
                finishedAt = now,
                durationMs = 0,
                nodeResults = emptyMap(),
                errorMessage = msg,
                logs = listOf("[LOCK] $msg")
            )
        }

        // cancelToken 레지스트리 등록
        val cancelFlag = AtomicBoolean(false)
        if (cancelToken != null) cancelRegistry[cancelToken] = cancelFlag

        try {
            val job = jobService.get(jobId)
            val ir = objectMapper.readValue(job.irJson, JobIR::class.java)
            val plan = buildPlan(jobId, ir, context, previewMode, cancelFlag)

            // 실행 시작 — RUNNING으로 저장
            val startedAt = LocalDateTime.now()
            val record = Execution(
                id = plan.executionId,
                jobId = jobId,
                jobVersion = job.version,
                status = ExecutionStatus.RUNNING,
                previewMode = previewMode,
                startedAt = startedAt,
                triggeredBy = triggeredBy
            )
            executionRepository.save(record)

            // previewMode는 항상 Pushdown 경로 (결과 확인용)
            val engine: ExecutionEngine = when {
                previewMode -> sqlPushdownAdapter
                ir.engineType.name.lowercase() == "python_worker" ->
                    throw UnsupportedOperationException("Python Worker는 준비 중입니다")
                else -> executionRouter   // 자동 라우팅 (Pushdown vs Fetch-and-Process)
            }

            val validationErrors = if (engine is ExecutionRouter) engine.validate(plan)
                                   else (engine as SqlPushdownAdapter).validate(plan)
            if (validationErrors.isNotEmpty()) {
                val result = ExecutionResult(
                    executionId = plan.executionId,
                    jobId = jobId,
                    status = ExecutionStatus.FAILED,
                    startedAt = startedAt,
                    finishedAt = LocalDateTime.now(),
                    durationMs = 0,
                    nodeResults = emptyMap(),
                    errorMessage = validationErrors.joinToString("\n"),
                    logs = validationErrors.map { "[VALIDATION] $it" }
                )
                updateRecord(record, result)
                return result
            }

            val result = try {
                if (engine is ExecutionRouter) engine.execute(plan) else engine.execute(plan)
            } catch (e: Exception) {
                val now = LocalDateTime.now()
                ExecutionResult(
                    executionId = plan.executionId,
                    jobId = jobId,
                    status = ExecutionStatus.FAILED,
                    startedAt = startedAt,
                    finishedAt = now,
                    durationMs = Duration.between(startedAt, now).toMillis(),
                    nodeResults = emptyMap(),
                    errorMessage = e.message,
                    logs = listOf("[ERROR] ${e.message}")
                )
            }

            updateRecord(record, result)
            return result
        } finally {
            if (!previewMode) executionLockService.unlock(jobId)
            if (cancelToken != null) cancelRegistry.remove(cancelToken)
        }
    }

    fun previewNode(
        jobId: UUID,
        nodeId: String,
        outputNodeId: String?,
        context: Map<String, String> = emptyMap()
    ): PreviewNodeResult {
        val job = jobService.get(jobId)
        val ir = objectMapper.readValue(job.irJson ?: "{}", com.platform.etl.ir.JobIR::class.java)
        val plan = sqlPushdownAdapter.resolvePlan(buildPlan(jobId, ir, context, previewMode = true))

        val targetNode = plan.ir.nodes.find { it.id == nodeId }
            ?: return PreviewNodeResult(error = "노드 '$nodeId'를 찾을 수 없습니다")
        val outputNode = outputNodeId?.let { oid -> plan.ir.nodes.find { it.id == oid } }

        return try {
            val query = sqlPushdownAdapter.compiler.compileForNodePreview(plan, targetNode, outputNode)
            val conn = sqlPushdownAdapter.connectionService.get(query.connectionId)
            val jdbcUrl = sqlPushdownAdapter.connectionService.buildJdbcUrl(conn)
            val password = sqlPushdownAdapter.connectionService.getDecryptedPassword(conn.id)
            val startMs = System.currentTimeMillis()

            java.sql.DriverManager.getConnection(jdbcUrl, conn.username, password).use { jdbc ->
                jdbc.createStatement().use { stmt ->
                    stmt.executeQuery(query.sql).use { rs ->
                        val meta = rs.metaData
                        val columns = (1..meta.columnCount).map { meta.getColumnName(it) }
                        val rows = mutableListOf<List<Any?>>()
                        while (rs.next()) {
                            rows += (1..meta.columnCount).map { rs.getObject(it) }
                        }
                        PreviewNodeResult(
                            columns = columns,
                            rows = rows,
                            rowCount = rows.size,
                            sql = query.sql,
                            durationMs = System.currentTimeMillis() - startMs
                        )
                    }
                }
            }
        } catch (e: Exception) {
            PreviewNodeResult(error = e.message ?: "Unknown error")
        }
    }

    fun previewIr(irJson: String, context: Map<String, String> = emptyMap()): ExecutionResult {
        val ir = objectMapper.readValue(irJson, JobIR::class.java)
        val plan = buildPlan(UUID.randomUUID(), ir, context, previewMode = true)
        return sqlPushdownAdapter.execute(plan)
    }

    fun listAll(page: Int, size: Int): Page<ExecutionSummaryDto> {
        val pageable = PageRequest.of(page, size, Sort.by("startedAt").descending())
        val execPage = executionRepository.findAllByOrderByStartedAtDesc(pageable)
        val jobIds = execPage.content.map { it.jobId }.toSet()
        val jobMap = jobRepository.findAllById(jobIds).associate { it.id to it.name }
        return execPage.map<ExecutionSummaryDto> { it.toSummaryDto(jobMap[it.jobId] ?: "Unknown Job") }
    }

    fun listByJob(jobId: UUID): List<ExecutionSummaryDto> {
        val jobName = runCatching { jobService.get(jobId).name }.getOrDefault("Unknown Job")
        return executionRepository.findByJobIdOrderByStartedAtDesc(jobId)
            .map { it.toSummaryDto(jobName) }
    }

    fun getDetail(id: UUID): ExecutionResult? {
        val record = executionRepository.findById(id).orElse(null) ?: return null
        val nodeResults: Map<String, NodeResult> = runCatching {
            val mapType = objectMapper.typeFactory.constructMapType(
                HashMap::class.java, String::class.java, NodeResult::class.java
            )
            @Suppress("UNCHECKED_CAST")
            objectMapper.readValue<Map<String, NodeResult>>(record.nodeResultsJson, mapType)
        }.getOrDefault(emptyMap())
        return ExecutionResult(
            executionId = record.id,
            jobId = record.jobId,
            status = record.status,
            startedAt = record.startedAt,
            finishedAt = record.finishedAt,
            durationMs = record.durationMs,
            nodeResults = nodeResults,
            errorMessage = record.errorMessage,
            logs = record.logs.toList()
        )
    }

    private fun updateRecord(record: Execution, result: ExecutionResult) {
        record.status = result.status
        record.finishedAt = result.finishedAt
        record.durationMs = result.durationMs
        record.nodeResultsJson = runCatching {
            objectMapper.writeValueAsString(result.nodeResults)
        }.getOrDefault("{}")
        record.errorMessage = result.errorMessage
        record.logs = result.logs.toTypedArray()
        executionRepository.save(record)
    }

    private fun buildPlan(
        jobId: UUID, ir: JobIR,
        context: Map<String, String>, previewMode: Boolean,
        cancelFlag: AtomicBoolean = AtomicBoolean(false)
    ): ExecutionPlan {
        val sortedIds = topologicalSort(ir)
        // 머징 순서: ir.context.defaultValue → ir.context.value → runtimeContext (뒤가 우선)
        val merged = mutableMapOf<String, String>()
        ir.context.forEach { (k, v) ->
            v.defaultValue?.takeIf { it.isNotBlank() }?.let { merged[k] = it }
        }
        ir.context.forEach { (k, v) ->
            if (v.value.isNotBlank()) merged[k] = v.value
        }
        context.forEach { (k, v) -> merged[k] = v }
        // 내장 함수 평가
        val mergedContext = merged.mapValues { (_, v) -> contextFunctionEvaluator.evaluate(v) }
        return ExecutionPlan(
            jobId = jobId,
            ir = ir,
            sortedNodeIds = sortedIds,
            context = mergedContext,
            previewMode = previewMode,
            cancelFlag = cancelFlag
        )
    }

    private fun topologicalSort(ir: JobIR): List<String> {
        val inDegree = ir.nodes.associate { it.id to 0 }.toMutableMap()
        val adj = mutableMapOf<String, MutableList<String>>()
        ir.nodes.forEach { adj[it.id] = mutableListOf() }
        ir.edges.forEach { edge ->
            adj[edge.source]?.add(edge.target)
            inDegree[edge.target] = (inDegree[edge.target] ?: 0) + 1
        }
        val queue = ArrayDeque(inDegree.filter { it.value == 0 }.keys)
        val result = mutableListOf<String>()
        while (queue.isNotEmpty()) {
            val node = queue.removeFirst()
            result += node
            adj[node]?.forEach { neighbor ->
                inDegree[neighbor] = (inDegree[neighbor] ?: 1) - 1
                if (inDegree[neighbor] == 0) queue.add(neighbor)
            }
        }
        return result
    }

    private fun Execution.toSummaryDto(jobName: String) = ExecutionSummaryDto(
        id = id,
        jobId = jobId,
        jobName = jobName,
        jobVersion = jobVersion,
        status = status,
        previewMode = previewMode,
        startedAt = startedAt,
        finishedAt = finishedAt,
        durationMs = durationMs,
        errorMessage = errorMessage,
        triggeredBy = triggeredBy
    )
}
