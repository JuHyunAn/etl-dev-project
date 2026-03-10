package com.platform.etl.schedule

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface ScheduleRepository : JpaRepository<Schedule, UUID> {
    fun findAllByOrderByCreatedAtDesc(): List<Schedule>
    fun findByEnabled(enabled: Boolean): List<Schedule>
}

interface ScheduleStepRepository : JpaRepository<ScheduleStep, UUID> {
    fun findByScheduleIdOrderByStepOrder(scheduleId: UUID): List<ScheduleStep>
    fun deleteByScheduleId(scheduleId: UUID)
}

interface ScheduleExecutionRepository : JpaRepository<ScheduleExecution, UUID> {
    fun findByScheduleIdOrderByStartedAtDesc(scheduleId: UUID): List<ScheduleExecution>
    fun findTop10ByScheduleIdOrderByStartedAtDesc(scheduleId: UUID): List<ScheduleExecution>
}

interface ScheduleStepExecutionRepository : JpaRepository<ScheduleStepExecution, UUID> {
    fun findByScheduleExecutionIdOrderByStartedAt(scheduleExecutionId: UUID): List<ScheduleStepExecution>
}
