package com.platform.etl.schedule

import org.quartz.*
import org.quartz.impl.matchers.GroupMatcher
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.TimeZone
import java.util.UUID

@Service
class ScheduleService(
    private val scheduleRepository: ScheduleRepository,
    private val scheduleStepRepository: ScheduleStepRepository,
    private val scheduleExecutionRepository: ScheduleExecutionRepository,
    private val stepExecutionRepository: ScheduleStepExecutionRepository,
    private val scheduleExecutionService: ScheduleExecutionService,
    private val quartzScheduler: Scheduler
) {
    companion object {
        private const val GROUP = "etl-schedules"
    }

    fun listAll(): List<ScheduleDto> = scheduleRepository.findAllByOrderByCreatedAtDesc().map { it.toDto() }

    fun get(id: UUID): Schedule = scheduleRepository.findById(id)
        .orElseThrow { NoSuchElementException("Schedule $id not found") }

    fun getDto(id: UUID): ScheduleDto = get(id).toDto()

    @Transactional
    fun create(req: ScheduleCreateRequest, createdBy: UUID? = null): ScheduleDto {
        val schedule = Schedule(
            name = req.name,
            description = req.description,
            cronExpression = req.cronExpression,
            timezone = req.timezone,
            enabled = req.enabled,
            alertOnFailure = req.alertOnFailure,
            alertChannel = req.alertChannel,
            createdBy = createdBy
        )
        scheduleRepository.save(schedule)

        req.steps.forEachIndexed { idx, stepReq ->
            val step = ScheduleStep(
                scheduleId = schedule.id,
                jobId = stepReq.jobId,
                stepOrder = stepReq.stepOrder ?: (idx + 1),
                dependsOnStepId = stepReq.dependsOnStepId,
                runCondition = stepReq.runCondition,
                timeoutSeconds = stepReq.timeoutSeconds,
                retryCount = stepReq.retryCount,
                retryDelaySeconds = stepReq.retryDelaySeconds,
                contextOverrides = stepReq.contextOverrides ?: "{}"
            )
            scheduleStepRepository.save(step)
        }

        if (schedule.enabled) {
            syncToQuartz(schedule)
        }

        return schedule.toDto()
    }

    @Transactional
    fun update(id: UUID, req: ScheduleUpdateRequest): ScheduleDto {
        val schedule = get(id)
        req.name?.let { schedule.name = it }
        req.description?.let { schedule.description = it }
        req.cronExpression?.let { schedule.cronExpression = it }
        req.timezone?.let { schedule.timezone = it }
        req.alertOnFailure?.let { schedule.alertOnFailure = it }
        req.alertChannel?.let { schedule.alertChannel = it }
        schedule.updatedAt = LocalDateTime.now()
        scheduleRepository.save(schedule)

        // steps 재동기화 (있을 때만)
        req.steps?.let { steps ->
            scheduleStepRepository.deleteByScheduleId(id)
            steps.forEachIndexed { idx, stepReq ->
                val step = ScheduleStep(
                    scheduleId = id,
                    jobId = stepReq.jobId,
                    stepOrder = stepReq.stepOrder ?: (idx + 1),
                    dependsOnStepId = stepReq.dependsOnStepId,
                    runCondition = stepReq.runCondition,
                    timeoutSeconds = stepReq.timeoutSeconds,
                    retryCount = stepReq.retryCount,
                    retryDelaySeconds = stepReq.retryDelaySeconds,
                    contextOverrides = stepReq.contextOverrides ?: "{}"
                )
                scheduleStepRepository.save(step)
            }
        }

        // enabled 변경 처리
        req.enabled?.let { newEnabled ->
            if (newEnabled != schedule.enabled) {
                schedule.enabled = newEnabled
                scheduleRepository.save(schedule)
            }
        }

        if (schedule.enabled) syncToQuartz(schedule) else removeFromQuartz(schedule.id)

        return schedule.toDto()
    }

    @Transactional
    fun setEnabled(id: UUID, enabled: Boolean): ScheduleDto {
        val schedule = get(id)
        schedule.enabled = enabled
        schedule.updatedAt = LocalDateTime.now()
        scheduleRepository.save(schedule)
        if (enabled) syncToQuartz(schedule) else removeFromQuartz(id)
        return schedule.toDto()
    }

    @Transactional
    fun delete(id: UUID) {
        removeFromQuartz(id)
        scheduleRepository.deleteById(id)
    }

    fun triggerManual(id: UUID): ScheduleExecutionSummaryDto {
        val schedule = get(id)
        scheduleExecutionService.trigger(schedule.id, triggerType = "MANUAL")
        return scheduleExecutionRepository.findTop10ByScheduleIdOrderByStartedAtDesc(id)
            .firstOrNull()?.toSummaryDto() ?: throw IllegalStateException("Trigger failed")
    }

    fun listExecutions(scheduleId: UUID): List<ScheduleExecutionDetailDto> {
        val executions = scheduleExecutionRepository.findByScheduleIdOrderByStartedAtDesc(scheduleId)
        return executions.map { exec ->
            val stepExecs = stepExecutionRepository.findByScheduleExecutionIdOrderByStartedAt(exec.id)
            val steps = scheduleStepRepository.findByScheduleIdOrderByStepOrder(scheduleId)
            exec.toDetailDto(steps, stepExecs)
        }
    }

    fun listByJobId(jobId: UUID): List<ScheduleDto> {
        val steps = scheduleStepRepository.findAll().filter { it.jobId == jobId }
        val scheduleIds = steps.map { it.scheduleId }.toSet()
        return scheduleIds.mapNotNull { id ->
            runCatching { getDto(id) }.getOrNull()
        }
    }

    /** 서버 재시작 시 Quartz 재등록용 (public) */
    fun reloadQuartz(schedule: Schedule) = syncToQuartz(schedule)

    // Quartz 동기화
    private fun syncToQuartz(schedule: Schedule) {
        val jobKey = JobKey.jobKey(schedule.id.toString(), GROUP)
        val triggerKey = TriggerKey.triggerKey(schedule.id.toString(), GROUP)

        // 기존 Quartz job 삭제 후 재등록
        if (quartzScheduler.checkExists(jobKey)) {
            quartzScheduler.deleteJob(jobKey)
        }

        val jobDetail = JobBuilder.newJob(ScheduleTriggerJob::class.java)
            .withIdentity(jobKey)
            .usingJobData("scheduleId", schedule.id.toString())
            .storeDurably()
            .build()

        val trigger = TriggerBuilder.newTrigger()
            .withIdentity(triggerKey)
            .forJob(jobDetail)
            .withSchedule(
                CronScheduleBuilder
                    .cronSchedule(schedule.cronExpression)
                    .inTimeZone(TimeZone.getTimeZone(ZoneId.of(schedule.timezone)))
            )
            .build()

        quartzScheduler.scheduleJob(jobDetail, trigger)

        val nextFire = trigger.nextFireTime
        schedule.quartzJobKey = jobKey.toString()
        schedule.quartzTriggerKey = triggerKey.toString()
        schedule.nextFireAt = nextFire?.toInstant()?.atZone(ZoneId.of(schedule.timezone))?.toLocalDateTime()
        scheduleRepository.save(schedule)
    }

    private fun removeFromQuartz(scheduleId: UUID) {
        val jobKey = JobKey.jobKey(scheduleId.toString(), GROUP)
        if (quartzScheduler.checkExists(jobKey)) {
            quartzScheduler.deleteJob(jobKey)
        }
    }

    private fun Schedule.toDto(): ScheduleDto {
        val steps = scheduleStepRepository.findByScheduleIdOrderByStepOrder(id)
        val recentExecs = scheduleExecutionRepository.findTop10ByScheduleIdOrderByStartedAtDesc(id)
        return ScheduleDto(
            id = id,
            name = name,
            description = description,
            cronExpression = cronExpression,
            timezone = timezone,
            enabled = enabled,
            lastFiredAt = lastFiredAt?.toString(),
            nextFireAt = nextFireAt?.toString(),
            consecutiveFailures = consecutiveFailures,
            alertOnFailure = alertOnFailure,
            alertChannel = alertChannel,
            createdBy = createdBy?.toString(),
            createdAt = createdAt.toString(),
            updatedAt = updatedAt.toString(),
            steps = steps.map { it.toDto() },
            recentExecutions = recentExecs.map { it.toSummaryDto() }
        )
    }
}

// ─── DTOs ────────────────────────────────────────────────────────────────────

data class ScheduleDto(
    val id: UUID,
    val name: String,
    val description: String?,
    val cronExpression: String,
    val timezone: String,
    val enabled: Boolean,
    val lastFiredAt: String?,
    val nextFireAt: String?,
    val consecutiveFailures: Int,
    val alertOnFailure: Boolean,
    val alertChannel: String?,
    val createdBy: String?,
    val createdAt: String,
    val updatedAt: String,
    val steps: List<ScheduleStepDto>,
    val recentExecutions: List<ScheduleExecutionSummaryDto>
)

data class ScheduleStepDto(
    val id: UUID,
    val scheduleId: UUID,
    val jobId: UUID,
    val stepOrder: Int,
    val dependsOnStepId: UUID?,
    val runCondition: String,
    val timeoutSeconds: Int,
    val retryCount: Int,
    val retryDelaySeconds: Int,
    val contextOverrides: String,
    val enabled: Boolean
)

data class ScheduleExecutionSummaryDto(
    val id: UUID,
    val scheduleId: UUID,
    val status: String,
    val startedAt: String,
    val finishedAt: String?,
    val totalSteps: Int?,
    val completedSteps: Int,
    val failedSteps: Int,
    val skippedSteps: Int,
    val triggerType: String,
    val errorSummary: String?
)

data class ScheduleExecutionDetailDto(
    val id: UUID,
    val scheduleId: UUID,
    val status: String,
    val startedAt: String,
    val finishedAt: String?,
    val totalSteps: Int?,
    val completedSteps: Int,
    val failedSteps: Int,
    val skippedSteps: Int,
    val triggerType: String,
    val errorSummary: String?,
    val stepExecutions: List<StepExecutionDto>
)

data class StepExecutionDto(
    val id: UUID,
    val scheduleStepId: UUID,
    val executionId: UUID?,
    val jobId: UUID,
    val stepOrder: Int,
    val status: String,
    val startedAt: String?,
    val finishedAt: String?,
    val retryAttempt: Int,
    val errorMessage: String?
)

// ─── 요청 바디 ─────────────────────────────────────────────────────────────────

data class ScheduleStepRequest(
    val jobId: UUID,
    val stepOrder: Int? = null,
    val dependsOnStepId: UUID? = null,
    val runCondition: String = "ON_SUCCESS",
    val timeoutSeconds: Int = 3600,
    val retryCount: Int = 0,
    val retryDelaySeconds: Int = 60,
    val contextOverrides: String? = null
)

data class ScheduleCreateRequest(
    val name: String,
    val description: String? = null,
    val cronExpression: String,
    val timezone: String = "Asia/Seoul",
    val enabled: Boolean = false,
    val alertOnFailure: Boolean = true,
    val alertChannel: String? = null,
    val steps: List<ScheduleStepRequest> = emptyList()
)

data class ScheduleUpdateRequest(
    val name: String? = null,
    val description: String? = null,
    val cronExpression: String? = null,
    val timezone: String? = null,
    val enabled: Boolean? = null,
    val alertOnFailure: Boolean? = null,
    val alertChannel: String? = null,
    val steps: List<ScheduleStepRequest>? = null
)

// ─── 확장 함수 ──────────────────────────────────────────────────────────────────

fun ScheduleStep.toDto() = ScheduleStepDto(
    id = id,
    scheduleId = scheduleId,
    jobId = jobId,
    stepOrder = stepOrder,
    dependsOnStepId = dependsOnStepId,
    runCondition = runCondition,
    timeoutSeconds = timeoutSeconds,
    retryCount = retryCount,
    retryDelaySeconds = retryDelaySeconds,
    contextOverrides = contextOverrides,
    enabled = enabled
)

fun ScheduleExecution.toSummaryDto() = ScheduleExecutionSummaryDto(
    id = id,
    scheduleId = scheduleId,
    status = status,
    startedAt = startedAt.toString(),
    finishedAt = finishedAt?.toString(),
    totalSteps = totalSteps,
    completedSteps = completedSteps,
    failedSteps = failedSteps,
    skippedSteps = skippedSteps,
    triggerType = triggerType,
    errorSummary = errorSummary
)

fun ScheduleExecution.toDetailDto(
    steps: List<ScheduleStep>,
    stepExecs: List<ScheduleStepExecution>
): ScheduleExecutionDetailDto {
    val stepMap = steps.associateBy { it.id }
    return ScheduleExecutionDetailDto(
        id = id,
        scheduleId = scheduleId,
        status = status,
        startedAt = startedAt.toString(),
        finishedAt = finishedAt?.toString(),
        totalSteps = totalSteps,
        completedSteps = completedSteps,
        failedSteps = failedSteps,
        skippedSteps = skippedSteps,
        triggerType = triggerType,
        errorSummary = errorSummary,
        stepExecutions = stepExecs.map { se ->
            val step = stepMap[se.scheduleStepId]
            StepExecutionDto(
                id = se.id,
                scheduleStepId = se.scheduleStepId,
                executionId = se.executionId,
                jobId = step?.jobId ?: UUID.fromString("00000000-0000-0000-0000-000000000000"),
                stepOrder = step?.stepOrder ?: 0,
                status = se.status,
                startedAt = se.startedAt?.toString(),
                finishedAt = se.finishedAt?.toString(),
                retryAttempt = se.retryAttempt,
                errorMessage = se.errorMessage
            )
        }
    )
}
