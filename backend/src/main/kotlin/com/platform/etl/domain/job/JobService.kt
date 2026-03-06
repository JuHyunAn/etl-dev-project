package com.platform.etl.domain.job

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
@Transactional
class JobService(private val repo: JobRepository) {

    fun listByProject(projectId: UUID): List<JobResponse> =
        repo.findByProjectId(projectId).map { it.toResponse() }

    fun get(id: UUID): Job = repo.findById(id).orElseThrow {
        NoSuchElementException("Job not found: $id")
    }

    fun create(projectId: UUID, req: JobCreateRequest): JobResponse =
        repo.save(
            Job(
                projectId = projectId,
                folderId = req.folderId,
                name = req.name,
                description = req.description,
                irJson = req.irJson
            )
        ).toResponse()

    fun update(id: UUID, req: JobUpdateRequest): JobResponse {
        val job = get(id)
        req.name?.let { job.name = it }
        req.description?.let { job.description = it }
        req.folderId?.let { job.folderId = it }
        req.status?.let { job.status = it }
        req.irJson?.let { job.irJson = it }
        return repo.save(job).toResponse()
    }

    fun delete(id: UUID) = repo.deleteById(id)

    fun publish(id: UUID): JobResponse {
        val job = get(id)
        job.status = JobStatus.PUBLISHED
        // 버전 bump (0.1 → 0.2 등)
        val (major, minor) = job.version.split(".").map { it.toIntOrNull() ?: 0 }
        job.version = "$major.${minor + 1}"
        return repo.save(job).toResponse()
    }
}
