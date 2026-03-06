package com.platform.etl.domain.job

import jakarta.validation.constraints.NotBlank
import java.time.LocalDateTime
import java.util.UUID

data class JobCreateRequest(
    @field:NotBlank val name: String,
    val description: String = "",
    val folderId: UUID? = null,
    val irJson: String = "{}"
)

data class JobUpdateRequest(
    val name: String? = null,
    val description: String? = null,
    val folderId: UUID? = null,
    val status: JobStatus? = null,
    val irJson: String? = null
)

data class JobResponse(
    val id: UUID,
    val projectId: UUID,
    val folderId: UUID?,
    val name: String,
    val description: String,
    val version: String,
    val status: JobStatus,
    val irJson: String,
    val createdAt: LocalDateTime,
    val updatedAt: LocalDateTime
)

fun Job.toResponse() = JobResponse(
    id, projectId, folderId, name, description, version, status, irJson, createdAt, updatedAt
)
