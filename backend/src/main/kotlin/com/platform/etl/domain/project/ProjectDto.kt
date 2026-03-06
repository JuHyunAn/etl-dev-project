package com.platform.etl.domain.project

import jakarta.validation.constraints.NotBlank
import java.time.LocalDateTime
import java.util.UUID

data class ProjectCreateRequest(
    @field:NotBlank val name: String,
    val description: String = ""
)

data class ProjectResponse(
    val id: UUID,
    val name: String,
    val description: String,
    val createdAt: LocalDateTime,
    val updatedAt: LocalDateTime
)

data class FolderCreateRequest(
    @field:NotBlank val name: String,
    val parentId: UUID? = null
)

data class FolderResponse(
    val id: UUID,
    val projectId: UUID,
    val parentId: UUID?,
    val name: String,
    val createdAt: LocalDateTime
)

fun Project.toResponse() = ProjectResponse(id, name, description, createdAt, updatedAt)
fun Folder.toResponse() = FolderResponse(id, projectId, parentId, name, createdAt)
