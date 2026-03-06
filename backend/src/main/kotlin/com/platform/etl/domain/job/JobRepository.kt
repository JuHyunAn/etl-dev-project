package com.platform.etl.domain.job

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface JobRepository : JpaRepository<Job, UUID> {
    fun findByProjectId(projectId: UUID): List<Job>
    fun findByProjectIdAndFolderId(projectId: UUID, folderId: UUID?): List<Job>
    fun findByProjectIdAndStatus(projectId: UUID, status: JobStatus): List<Job>
}
