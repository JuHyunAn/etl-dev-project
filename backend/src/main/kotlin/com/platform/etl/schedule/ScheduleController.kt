package com.platform.etl.schedule

import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.util.UUID

@RestController
@RequestMapping("/api/schedules")
class ScheduleController(private val service: ScheduleService) {

    @GetMapping
    fun list() = service.listAll()

    @GetMapping("/{id}")
    fun get(@PathVariable id: UUID): ResponseEntity<ScheduleDto> =
        ResponseEntity.ok(service.getDto(id))

    @PostMapping
    fun create(@RequestBody req: ScheduleCreateRequest): ResponseEntity<ScheduleDto> =
        ResponseEntity.status(201).body(service.create(req))

    @PutMapping("/{id}")
    fun update(@PathVariable id: UUID, @RequestBody req: ScheduleUpdateRequest): ResponseEntity<ScheduleDto> =
        ResponseEntity.ok(service.update(id, req))

    @PatchMapping("/{id}/enabled")
    fun setEnabled(
        @PathVariable id: UUID,
        @RequestParam enabled: Boolean
    ): ResponseEntity<ScheduleDto> =
        ResponseEntity.ok(service.setEnabled(id, enabled))

    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: UUID): ResponseEntity<Void> {
        service.delete(id)
        return ResponseEntity.noContent().build()
    }

    @PostMapping("/{id}/trigger")
    fun trigger(@PathVariable id: UUID): ResponseEntity<ScheduleExecutionSummaryDto> =
        ResponseEntity.ok(service.triggerManual(id))

    @GetMapping("/{id}/executions")
    fun executions(@PathVariable id: UUID): ResponseEntity<List<ScheduleExecutionDetailDto>> =
        ResponseEntity.ok(service.listExecutions(id))

    /** 특정 Job이 포함된 스케줄 목록 */
    @GetMapping("/by-job/{jobId}")
    fun listByJob(@PathVariable jobId: UUID) = service.listByJobId(jobId)
}
