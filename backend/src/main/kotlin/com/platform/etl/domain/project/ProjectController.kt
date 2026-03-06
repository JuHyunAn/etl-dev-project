package com.platform.etl.domain.project

import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.*
import java.util.UUID

@RestController
@RequestMapping("/api/projects")
class ProjectController(private val service: ProjectService) {

    @GetMapping
    fun list() = service.listProjects()

    @GetMapping("/{id}")
    fun get(@PathVariable id: UUID) = service.getProject(id).toResponse()

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@Valid @RequestBody req: ProjectCreateRequest) = service.createProject(req)

    @PutMapping("/{id}")
    fun update(@PathVariable id: UUID, @Valid @RequestBody req: ProjectCreateRequest) =
        service.updateProject(id, req)

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable id: UUID) = service.deleteProject(id)

    @GetMapping("/{id}/folders")
    fun listFolders(@PathVariable id: UUID) = service.listFolders(id)

    @PostMapping("/{id}/folders")
    @ResponseStatus(HttpStatus.CREATED)
    fun createFolder(@PathVariable id: UUID, @Valid @RequestBody req: FolderCreateRequest) =
        service.createFolder(id, req)

    @DeleteMapping("/folders/{folderId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteFolder(@PathVariable folderId: UUID) = service.deleteFolder(folderId)
}
