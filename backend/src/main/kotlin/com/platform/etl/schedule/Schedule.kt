package com.platform.etl.schedule

import jakarta.persistence.*
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes
import java.time.LocalDateTime
import java.util.UUID

@Entity
@Table(name = "schedules")
class Schedule(
    @Id val id: UUID = UUID.randomUUID(),

    @Column(nullable = false, length = 200)
    var name: String,

    @Column(columnDefinition = "text")
    var description: String? = null,

    @Column(name = "cron_expression", nullable = false, length = 100)
    var cronExpression: String,

    @Column(nullable = false, length = 50)
    var timezone: String = "Asia/Seoul",

    @Column(nullable = false)
    var enabled: Boolean = false,

    @Column(name = "quartz_job_key", length = 200)
    var quartzJobKey: String? = null,

    @Column(name = "quartz_trigger_key", length = 200)
    var quartzTriggerKey: String? = null,

    @Column(name = "last_fired_at")
    var lastFiredAt: LocalDateTime? = null,

    @Column(name = "next_fire_at")
    var nextFireAt: LocalDateTime? = null,

    @Column(name = "consecutive_failures", nullable = false)
    var consecutiveFailures: Int = 0,

    @Column(name = "alert_on_failure", nullable = false)
    var alertOnFailure: Boolean = true,

    @Column(name = "alert_channel", length = 50)
    var alertChannel: String? = null,

    @Column(name = "created_by")
    val createdBy: UUID? = null,

    @Column(name = "created_at", nullable = false)
    val createdAt: LocalDateTime = LocalDateTime.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: LocalDateTime = LocalDateTime.now()
)

@Entity
@Table(name = "schedule_steps")
class ScheduleStep(
    @Id val id: UUID = UUID.randomUUID(),

    @Column(name = "schedule_id", nullable = false)
    val scheduleId: UUID,

    @Column(name = "job_id", nullable = false)
    val jobId: UUID,

    @Column(name = "step_order", nullable = false)
    var stepOrder: Int,

    @Column(name = "depends_on_step_id")
    var dependsOnStepId: UUID? = null,

    @Column(name = "run_condition", nullable = false, length = 20)
    var runCondition: String = "ON_SUCCESS",

    @Column(name = "timeout_seconds", nullable = false)
    var timeoutSeconds: Int = 3600,

    @Column(name = "retry_count", nullable = false)
    var retryCount: Int = 0,

    @Column(name = "retry_delay_seconds", nullable = false)
    var retryDelaySeconds: Int = 60,

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "context_overrides", columnDefinition = "jsonb", nullable = false)
    var contextOverrides: String = "{}",

    @Column(nullable = false)
    var enabled: Boolean = true
)

@Entity
@Table(name = "schedule_executions")
class ScheduleExecution(
    @Id val id: UUID = UUID.randomUUID(),

    @Column(name = "schedule_id", nullable = false)
    val scheduleId: UUID,

    @Column(nullable = false, length = 20)
    var status: String = "RUNNING",

    @Column(name = "started_at", nullable = false)
    val startedAt: LocalDateTime = LocalDateTime.now(),

    @Column(name = "finished_at")
    var finishedAt: LocalDateTime? = null,

    @Column(name = "total_steps")
    var totalSteps: Int? = null,

    @Column(name = "completed_steps", nullable = false)
    var completedSteps: Int = 0,

    @Column(name = "failed_steps", nullable = false)
    var failedSteps: Int = 0,

    @Column(name = "skipped_steps", nullable = false)
    var skippedSteps: Int = 0,

    @Column(name = "trigger_type", nullable = false, length = 20)
    val triggerType: String = "CRON",

    @Column(name = "error_summary", columnDefinition = "text")
    var errorSummary: String? = null
)

@Entity
@Table(name = "schedule_step_executions")
class ScheduleStepExecution(
    @Id val id: UUID = UUID.randomUUID(),

    @Column(name = "schedule_execution_id", nullable = false)
    val scheduleExecutionId: UUID,

    @Column(name = "schedule_step_id", nullable = false)
    val scheduleStepId: UUID,

    @Column(name = "execution_id")
    var executionId: UUID? = null,

    @Column(nullable = false, length = 20)
    var status: String = "PENDING",

    @Column(name = "started_at")
    var startedAt: LocalDateTime? = null,

    @Column(name = "finished_at")
    var finishedAt: LocalDateTime? = null,

    @Column(name = "retry_attempt", nullable = false)
    var retryAttempt: Int = 0,

    @Column(name = "error_message", columnDefinition = "text")
    var errorMessage: String? = null
)
