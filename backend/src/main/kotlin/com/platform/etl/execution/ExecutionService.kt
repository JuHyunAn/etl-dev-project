package com.platform.etl.execution

import com.fasterxml.jackson.databind.ObjectMapper
import com.platform.etl.domain.job.JobService
import com.platform.etl.ir.JobIR
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class ExecutionService(
    private val jobService: JobService,
    private val sqlPushdownAdapter: SqlPushdownAdapter,
    private val objectMapper: ObjectMapper
) {
    fun execute(jobId: UUID, context: Map<String, String> = emptyMap(),
                previewMode: Boolean = false): ExecutionResult {
        val job = jobService.get(jobId)
        val ir = objectMapper.readValue(job.irJson, JobIR::class.java)
        val plan = buildPlan(jobId, ir, context, previewMode)

        val engine: ExecutionEngine = when (ir.engineType.name.lowercase()) {
            "python_worker" -> throw UnsupportedOperationException("Python Worker는 준비 중입니다")
            else -> sqlPushdownAdapter
        }

        val validationErrors = engine.validate(plan)
        if (validationErrors.isNotEmpty()) {
            return ExecutionResult(
                executionId = plan.executionId,
                jobId = jobId,
                status = ExecutionStatus.FAILED,
                startedAt = java.time.LocalDateTime.now(),
                finishedAt = java.time.LocalDateTime.now(),
                durationMs = 0,
                nodeResults = emptyMap(),
                errorMessage = validationErrors.joinToString("\n"),
                logs = validationErrors.map { "[VALIDATION] $it" }
            )
        }

        return engine.execute(plan)
    }

    fun previewIr(irJson: String, context: Map<String, String> = emptyMap()): ExecutionResult {
        val ir = objectMapper.readValue(irJson, JobIR::class.java)
        val plan = buildPlan(UUID.randomUUID(), ir, context, previewMode = true)
        return sqlPushdownAdapter.execute(plan)
    }

    private fun buildPlan(jobId: UUID, ir: JobIR, context: Map<String, String>,
                          previewMode: Boolean): ExecutionPlan {
        val sortedIds = topologicalSort(ir)
        return ExecutionPlan(
            jobId = jobId,
            ir = ir,
            sortedNodeIds = sortedIds,
            context = context,
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
}
