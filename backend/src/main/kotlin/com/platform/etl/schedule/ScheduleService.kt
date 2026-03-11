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

    /**
     * Step 목록에서 순환 의존(Circular Dependency) 검사.
     * dependsOnStepId는 임시 인덱스 기반 값 대신 UUID를 사용하므로,
     * 여기서는 stepOrder 기준으로 "선행이 자신보다 앞에 있어야 함"을 검증한다.
     */
    private fun validateStepDependencies(steps: List<ScheduleStepRequest>) {
        val orderToIdx = steps.mapIndexed { idx, s -> (s.stepOrder ?: (idx + 1)) to idx }.toMap()
        steps.forEachIndexed { idx, step ->
            val depOrder = step.dependsOnStepOrder ?: return@forEachIndexed
            val depIdx = orderToIdx[depOrder]
            if (depIdx == null || depIdx >= idx) {
                throw IllegalArgumentException(
                    "Step ${idx + 1}의 선행 Step(stepOrder=$depOrder)이 자신과 같거나 뒤에 위치해 있습니다."
                )
            }
        }
        // 순환 의존 체크
        val depMap = steps.mapIndexed { idx, step ->
            val depOrder = step.dependsOnStepOrder
            idx to if (depOrder != null) orderToIdx[depOrder] else null
        }.toMap()
        steps.indices.forEach { startIdx ->
            val visited = mutableSetOf<Int>()
            var cur: Int? = depMap[startIdx]
            while (cur != null) {
                if (!visited.add(cur)) throw IllegalArgumentException("Step 의존 관계에 순환이 감지되었습니다.")
                cur = depMap[cur]
            }
        }
    }

    @Transactional
    fun create(req: ScheduleCreateRequest, createdBy: UUID? = null): ScheduleDto {
        if (req.steps.isNotEmpty()) validateStepDependencies(req.steps)
        val schedule = Schedule(
            name = req.name,
            description = req.description,
            cronExpression = req.cronExpression,
            timezone = req.timezone,
            enabled = req.enabled,
            alertCondition = req.alertCondition,
            alertChannel = req.alertChannel,
            createdBy = createdBy
        )
        scheduleRepository.save(schedule)

        // Phase 1: dependsOnStepId=null로 먼저 전부 insert
        val savedSteps = req.steps.mapIndexed { idx, stepReq ->
            val step = ScheduleStep(
                scheduleId = schedule.id,
                jobId = stepReq.jobId,
                stepOrder = stepReq.stepOrder ?: (idx + 1),
                dependsOnStepId = null,
                runCondition = stepReq.runCondition,
                timeoutSeconds = stepReq.timeoutSeconds,
                retryCount = stepReq.retryCount,
                retryDelaySeconds = stepReq.retryDelaySeconds,
                contextOverrides = stepReq.contextOverrides ?: "{}"
            )
            scheduleStepRepository.save(step)
            step
        }
        // Phase 2: stepOrder → 새 step UUID 맵으로 dependsOnStepId 후처리
        val orderToNewId = savedSteps.associate { it.stepOrder to it.id }
        savedSteps.forEachIndexed { idx, step ->
            val depOrder = req.steps[idx].dependsOnStepOrder
            if (depOrder != null) {
                step.dependsOnStepId = orderToNewId[depOrder]
                scheduleStepRepository.save(step)
            }
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
        req.alertCondition?.let { schedule.alertCondition = it }
        req.alertChannel?.let { schedule.alertChannel = it }
        schedule.updatedAt = LocalDateTime.now()
        scheduleRepository.save(schedule)

        // steps 재동기화 (있을 때만)
        req.steps?.let { if (it.isNotEmpty()) validateStepDependencies(it) }
        req.steps?.let { steps ->
            // 1. 자기참조 FK(depends_on_step_id) 먼저 NULL로 초기화 → 삭제 순서 무관하게 안전
            scheduleStepRepository.clearDependenciesByScheduleId(id)
            scheduleStepRepository.flush()
            // 2. 기존 step 전체 삭제
            scheduleStepRepository.deleteByScheduleId(id)
            scheduleStepRepository.flush()
            // Phase 1: dependsOnStepId=null로 먼저 전부 insert
            val savedSteps = steps.mapIndexed { idx, stepReq ->
                val step = ScheduleStep(
                    scheduleId = id,
                    jobId = stepReq.jobId,
                    stepOrder = stepReq.stepOrder ?: (idx + 1),
                    dependsOnStepId = null,
                    runCondition = stepReq.runCondition,
                    timeoutSeconds = stepReq.timeoutSeconds,
                    retryCount = stepReq.retryCount,
                    retryDelaySeconds = stepReq.retryDelaySeconds,
                    contextOverrides = stepReq.contextOverrides ?: "{}"
                )
                scheduleStepRepository.save(step)
                step
            }
            scheduleStepRepository.flush()
            // Phase 2: stepOrder → 새 step UUID 맵으로 dependsOnStepId 후처리
            val orderToNewId = savedSteps.associate { it.stepOrder to it.id }
            savedSteps.forEachIndexed { idx, step ->
                val depOrder = steps[idx].dependsOnStepOrder
                if (depOrder != null) {
                    step.dependsOnStepId = orderToNewId[depOrder]
                    scheduleStepRepository.save(step)
                }
            }
            scheduleStepRepository.flush()
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

    /**
     * Unix 5필드 cron (분 시 일 월 요일) → Quartz 6필드 cron (초 분 시 일 월 요일) 변환
     * 이미 6필드 이상이면 그대로 반환
     */
    private fun toQuartzCron(expression: String): String {
        val parts = expression.trim().split("\\s+".toRegex())
        if (parts.size >= 6) return expression  // 이미 Quartz 형식
        if (parts.size != 5) return expression  // 알 수 없는 형식, 그대로 전달
        val (min, hour, dom, month, dow) = parts
        // Quartz는 day-of-month, day-of-week 중 하나만 지정 가능 (나머지는 ?)
        val qDom = if (dow != "*" && dow != "?") "?" else dom
        val qDow = if (qDom != "?" && dow == "*") "?" else dow
        return "0 $min $hour $qDom $month $qDow"
    }

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

        val quartzCron = toQuartzCron(schedule.cronExpression)

        val trigger = TriggerBuilder.newTrigger()
            .withIdentity(triggerKey)
            .forJob(jobDetail)
            .withSchedule(
                CronScheduleBuilder
                    .cronSchedule(quartzCron)
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
            alertCondition = alertCondition,
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
    val alertCondition: String,
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
    val scheduleStepId: UUID?,
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
    val dependsOnStepOrder: Int? = null,   // stepOrder 기반 참조 (UUID 대신)
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
    val alertCondition: String = "NONE",
    val alertChannel: String? = null,
    val steps: List<ScheduleStepRequest> = emptyList()
)

data class ScheduleUpdateRequest(
    val name: String? = null,
    val description: String? = null,
    val cronExpression: String? = null,
    val timezone: String? = null,
    val enabled: Boolean? = null,
    val alertCondition: String? = null,
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
