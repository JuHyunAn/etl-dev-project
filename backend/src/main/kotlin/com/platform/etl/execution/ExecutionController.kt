package com.platform.etl.execution

import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.util.UUID

data class RunRequest(
    val context: Map<String, String> = emptyMap(),
    val previewMode: Boolean = false,
    val triggeredBy: String = "manual"
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
        service.execute(jobId, req.context, req.previewMode, req.triggeredBy)

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
