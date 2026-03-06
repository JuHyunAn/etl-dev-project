package com.platform.etl.domain.job

import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.*
import java.util.UUID

@RestController
@RequestMapping("/api/projects/{projectId}/jobs")
class JobController(private val service: JobService) {

    @GetMapping
    fun list(@PathVariable projectId: UUID) = service.listByProject(projectId)

    @GetMapping("/{id}")
    fun get(@PathVariable projectId: UUID, @PathVariable id: UUID) =
        service.get(id).toResponse()

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@PathVariable projectId: UUID, @Valid @RequestBody req: JobCreateRequest) =
        service.create(projectId, req)

    @PutMapping("/{id}")
    fun update(@PathVariable projectId: UUID, @PathVariable id: UUID,
               @RequestBody req: JobUpdateRequest) = service.update(id, req)

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable projectId: UUID, @PathVariable id: UUID) = service.delete(id)

    @PostMapping("/{id}/publish")
    fun publish(@PathVariable projectId: UUID, @PathVariable id: UUID) = service.publish(id)
}
