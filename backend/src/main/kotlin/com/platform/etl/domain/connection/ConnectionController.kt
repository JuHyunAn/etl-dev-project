package com.platform.etl.domain.connection

import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.*
import java.util.UUID

@RestController
@RequestMapping("/api/connections")
class ConnectionController(private val service: ConnectionService) {

    @GetMapping
    fun list() = service.list()

    @GetMapping("/{id}")
    fun get(@PathVariable id: UUID) = service.get(id).toResponse()

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@Valid @RequestBody req: ConnectionCreateRequest) = service.create(req)

    @PutMapping("/{id}")
    fun update(@PathVariable id: UUID, @RequestBody req: ConnectionUpdateRequest) =
        service.update(id, req)

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable id: UUID) = service.delete(id)

    @PostMapping("/{id}/test")
    fun test(@PathVariable id: UUID) = service.testConnection(id)
}
