package com.platform.etl.execution

import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface ExecutionRepository : JpaRepository<Execution, UUID> {
    fun findAllByOrderByStartedAtDesc(pageable: Pageable): Page<Execution>
    fun findByJobIdOrderByStartedAtDesc(jobId: UUID): List<Execution>
}
