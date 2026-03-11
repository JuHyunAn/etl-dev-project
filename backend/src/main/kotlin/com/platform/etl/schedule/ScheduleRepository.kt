package com.platform.etl.schedule

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import java.util.UUID

interface ScheduleRepository : JpaRepository<Schedule, UUID> {
    fun findAllByOrderByCreatedAtDesc(): List<Schedule>
    fun findByEnabled(enabled: Boolean): List<Schedule>
}

interface ScheduleStepRepository : JpaRepository<ScheduleStep, UUID> {
    fun findByScheduleIdOrderByStepOrder(scheduleId: UUID): List<ScheduleStep>

    /** 삭제 전 자기참조 FK(depends_on_step_id)를 NULL로 초기화 */
    @Modifying
    @Query("UPDATE ScheduleStep s SET s.dependsOnStepId = null WHERE s.scheduleId = :scheduleId")
    fun clearDependenciesByScheduleId(@Param("scheduleId") scheduleId: UUID)

    fun deleteByScheduleId(scheduleId: UUID)
}

interface ScheduleExecutionRepository : JpaRepository<ScheduleExecution, UUID> {
    fun findByScheduleIdOrderByStartedAtDesc(scheduleId: UUID): List<ScheduleExecution>
    fun findTop10ByScheduleIdOrderByStartedAtDesc(scheduleId: UUID): List<ScheduleExecution>
}

interface ScheduleStepExecutionRepository : JpaRepository<ScheduleStepExecution, UUID> {
    fun findByScheduleExecutionIdOrderByStartedAt(scheduleExecutionId: UUID): List<ScheduleStepExecution>
}
