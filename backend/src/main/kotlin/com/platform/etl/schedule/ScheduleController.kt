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
        runCatching { service.getDto(id) }
            .map { ResponseEntity.ok(it) }
            .getOrElse { ResponseEntity.notFound().build() }

    @PostMapping
    fun create(@RequestBody req: ScheduleCreateRequest): ResponseEntity<ScheduleDto> =
        ResponseEntity.status(201).body(service.create(req))

    @PutMapping("/{id}")
    fun update(@PathVariable id: UUID, @RequestBody req: ScheduleUpdateRequest): ResponseEntity<ScheduleDto> =
        runCatching { service.update(id, req) }
            .map { ResponseEntity.ok(it) }
            .getOrElse { ResponseEntity.notFound().build() }

    @PatchMapping("/{id}/enabled")
    fun setEnabled(
        @PathVariable id: UUID,
        @RequestParam enabled: Boolean
    ): ResponseEntity<ScheduleDto> =
        runCatching { service.setEnabled(id, enabled) }
            .map { ResponseEntity.ok(it) }
            .getOrElse { ResponseEntity.notFound().build() }

    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: UUID): ResponseEntity<Void> {
        service.delete(id)
        return ResponseEntity.noContent().build()
    }

    @PostMapping("/{id}/trigger")
    fun trigger(@PathVariable id: UUID): ResponseEntity<ScheduleExecutionSummaryDto> =
        runCatching { service.triggerManual(id) }
            .map { ResponseEntity.ok(it) }
            .getOrElse { ResponseEntity.notFound().build() }

    @GetMapping("/{id}/executions")
    fun executions(@PathVariable id: UUID): ResponseEntity<List<ScheduleExecutionDetailDto>> =
        runCatching { service.listExecutions(id) }
            .map { ResponseEntity.ok(it) }
            .getOrElse { ResponseEntity.notFound().build() }

    /** 특정 Job이 포함된 스케줄 목록 */
    @GetMapping("/by-job/{jobId}")
    fun listByJob(@PathVariable jobId: UUID) = service.listByJobId(jobId)
}
