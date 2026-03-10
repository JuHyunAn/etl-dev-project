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
    private val objectMapper: ObjectMapper
) {
    fun execute(
        jobId: UUID,
        context: Map<String, String> = emptyMap(),
        previewMode: Boolean = false,
        triggeredBy: String = "manual"
    ): ExecutionResult {
        val job = jobService.get(jobId)
        val ir = objectMapper.readValue(job.irJson, JobIR::class.java)
        val plan = buildPlan(jobId, ir, context, previewMode)

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

        val engine: ExecutionEngine = when (ir.engineType.name.lowercase()) {
            "python_worker" -> throw UnsupportedOperationException("Python Worker는 준비 중입니다")
            else -> sqlPushdownAdapter
        }

        val validationErrors = engine.validate(plan)
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
            engine.execute(plan)
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
        context: Map<String, String>, previewMode: Boolean
    ): ExecutionPlan {
        val sortedIds = topologicalSort(ir)
        val mergedContext = ir.context + context
        return ExecutionPlan(
            jobId = jobId,
            ir = ir,
            sortedNodeIds = sortedIds,
            context = mergedContext,
            previewMode = previewMode
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
