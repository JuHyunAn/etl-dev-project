package com.platform.etl.execution

import org.springframework.web.bind.annotation.*
import java.util.UUID

data class RunRequest(
    val context: Map<String, String> = emptyMap(),
    val previewMode: Boolean = false
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
        service.execute(jobId, req.context, req.previewMode)

    @PostMapping("/execution/preview")
    fun previewIr(@RequestBody req: PreviewIrRequest) =
        service.previewIr(req.irJson, req.context)
}
