package com.platform.etl.execution

import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.util.UUID

data class RunRequest(
    val context: Map<String, String> = emptyMap(),
    val previewMode: Boolean = false,
    val triggeredBy: String = "manual",
    val cancelToken: String? = null
)

data class PreviewNodeRequest(
    val nodeId: String = "",
    val outputNodeId: String? = null,
    val context: Map<String, String> = emptyMap()
)

data class PreviewNodeResult(
    val columns: List<String> = emptyList(),
    val rows: List<List<Any?>> = emptyList(),
    val rowCount: Int = 0,
    val sql: String = "",
    val durationMs: Long = 0,
    val error: String? = null
)

data class PreviewIrRequest(
    val irJson: String,
    val context: Map<String, String> = emptyMap()
)

@RestController
@RequestMapping("/api")
class ExecutionController(private val service: ExecutionService) {

    @PostMapping("/jobs/{jobId}/run")
    fun run(@PathVariable jobId: UUID, @RequestBody req: RunRequest) =
        service.execute(jobId, req.context, req.previewMode, req.triggeredBy, req.cancelToken)

    @PostMapping("/executions/cancel/{token}")
    fun cancel(@PathVariable token: String): ResponseEntity<Map<String, Any>> {
        val cancelled = service.cancel(token)
        return if (cancelled) ResponseEntity.ok(mapOf("cancelled" to true))
        else ResponseEntity.notFound().build()
    }

    @PostMapping("/jobs/{jobId}/preview-node")
    fun previewNode(
        @PathVariable jobId: UUID,
        @RequestBody req: PreviewNodeRequest
    ) = service.previewNode(jobId, req.nodeId, req.outputNodeId, req.context)

    @PostMapping("/execution/preview")
    fun previewIr(@RequestBody req: PreviewIrRequest) =
        service.previewIr(req.irJson, req.context)

    @GetMapping("/executions")
    fun listAll(
        @RequestParam(defaultValue = "0") page: Int,
        @RequestParam(defaultValue = "20") size: Int
    ) = service.listAll(page, size)

    @GetMapping("/jobs/{jobId}/executions")
    fun listByJob(@PathVariable jobId: UUID) =
        service.listByJob(jobId)

    @GetMapping("/executions/{id}")
    fun getDetail(@PathVariable id: UUID): ResponseEntity<ExecutionResult> =
        service.getDetail(id)?.let { ResponseEntity.ok(it) }
            ?: ResponseEntity.notFound().build()
}
