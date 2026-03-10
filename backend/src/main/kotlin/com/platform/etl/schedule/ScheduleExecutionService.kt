package com.platform.etl.schedule

import com.fasterxml.jackson.databind.ObjectMapper
import com.platform.etl.execution.ExecutionService
import com.platform.etl.execution.ExecutionStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDateTime
import java.util.UUID

@Service
class ScheduleExecutionService(
    private val scheduleRepository: ScheduleRepository,
    private val scheduleStepRepository: ScheduleStepRepository,
    private val scheduleExecutionRepository: ScheduleExecutionRepository,
    private val stepExecutionRepository: ScheduleStepExecutionRepository,
    private val executionService: ExecutionService,
    private val objectMapper: ObjectMapper,
    private val alertService: AlertService
) {
    @Transactional
    fun trigger(scheduleId: UUID, triggerType: String = "CRON") {
        val schedule = scheduleRepository.findById(scheduleId).orElse(null) ?: return
        val steps = scheduleStepRepository.findByScheduleIdOrderByStepOrder(scheduleId)
            .filter { it.enabled }

        val schedExec = ScheduleExecution(
            scheduleId = scheduleId,
            status = "RUNNING",
            totalSteps = steps.size,
            triggerType = triggerType
        )
        scheduleExecutionRepository.save(schedExec)

        // step별 초기 레코드 생성
        val stepExecMap = steps.associate { step ->
            step.id to ScheduleStepExecution(
                scheduleExecutionId = schedExec.id,
                scheduleStepId = step.id,
                status = "PENDING"
            ).also { stepExecutionRepository.save(it) }
        }

        runSteps(schedule, steps, schedExec, stepExecMap)
    }

    private fun runSteps(
        schedule: Schedule,
        steps: List<ScheduleStep>,
        schedExec: ScheduleExecution,
        stepExecMap: Map<UUID, ScheduleStepExecution>
    ) {
        // step 완료 상태 추적 (id → final status)
        val stepResults = mutableMapOf<UUID, String>()

        for (step in steps) {
            val stepExec = stepExecMap[step.id] ?: continue

            // 선행 step 조건 확인
            if (!canRunStep(step, stepResults)) {
                stepExec.status = "SKIPPED"
                stepExec.startedAt = LocalDateTime.now()
                stepExec.finishedAt = LocalDateTime.now()
                stepExecutionRepository.save(stepExec)
                stepResults[step.id] = "SKIPPED"
                schedExec.skippedSteps++
                scheduleExecutionRepository.save(schedExec)
                continue
            }

            stepExec.status = "RUNNING"
            stepExec.startedAt = LocalDateTime.now()
            stepExecutionRepository.save(stepExec)

            var attempt = 0
            var lastStatus = "FAILED"
            var lastError: String? = null

            while (attempt <= step.retryCount) {
                if (attempt > 0) {
                    Thread.sleep(step.retryDelaySeconds * 1000L)
                }
                stepExec.retryAttempt = attempt

                try {
                    @Suppress("UNCHECKED_CAST")
                    val contextOverrides = runCatching {
                        objectMapper.readValue(step.contextOverrides, Map::class.java) as Map<String, String>
                    }.getOrDefault(emptyMap())

                    val result = executionService.execute(
                        jobId = step.jobId,
                        context = contextOverrides,
                        previewMode = false,
                        triggeredBy = "schedule:${schedExec.scheduleId}"
                    )

                    stepExec.executionId = result.executionId
                    lastStatus = if (result.status == ExecutionStatus.SUCCESS) "SUCCESS" else "FAILED"
                    lastError = result.errorMessage

                    if (lastStatus == "SUCCESS") break
                } catch (e: Exception) {
                    lastStatus = "FAILED"
                    lastError = e.message
                }
                attempt++
            }

            stepExec.status = lastStatus
            stepExec.finishedAt = LocalDateTime.now()
            stepExec.errorMessage = lastError
            stepExecutionRepository.save(stepExec)

            stepResults[step.id] = lastStatus

            if (lastStatus == "SUCCESS") {
                schedExec.completedSteps++
            } else {
                schedExec.failedSteps++
            }
            scheduleExecutionRepository.save(schedExec)
        }

        // 최종 상태 집계
        val finalStatus = when {
            schedExec.failedSteps == 0 && schedExec.skippedSteps == 0 -> "SUCCESS"
            schedExec.failedSteps > 0 && schedExec.completedSteps > 0 -> "PARTIAL"
            schedExec.failedSteps > 0 && schedExec.completedSteps == 0 -> "FAILED"
            else -> "SUCCESS"
        }

        schedExec.status = finalStatus
        schedExec.finishedAt = LocalDateTime.now()
        scheduleExecutionRepository.save(schedExec)

        // 스케줄 통계 업데이트
        schedule.lastFiredAt = schedExec.startedAt
        if (finalStatus == "SUCCESS") {
            schedule.consecutiveFailures = 0
        } else {
            schedule.consecutiveFailures++
        }
        scheduleRepository.save(schedule)

        // 알림 조건 평가
        sendAlertIfNeeded(schedule, schedExec)
    }

    private fun sendAlertIfNeeded(schedule: Schedule, schedExec: ScheduleExecution) {
        val finalStatus = schedExec.status
        val shouldAlert = when (schedule.alertCondition) {
            "ON_COMPLETION" -> true
            "ON_SUCCESS"    -> finalStatus == "SUCCESS"
            "ON_FAILURE"    -> finalStatus in listOf("FAILED", "PARTIAL")
            else            -> false  // NONE
        }
        if (!shouldAlert) return

        val to = schedule.alertChannel?.takeIf { it.isNotBlank() } ?: return

        alertService.sendScheduleAlert(
            to = to,
            scheduleName = schedule.name,
            finalStatus = finalStatus,
            startedAt = schedExec.startedAt.toString(),
            finishedAt = schedExec.finishedAt?.toString(),
            totalSteps = schedExec.totalSteps,
            completedSteps = schedExec.completedSteps,
            failedSteps = schedExec.failedSteps,
            errorSummary = schedExec.errorSummary
        )
    }

    private fun canRunStep(step: ScheduleStep, stepResults: Map<UUID, String>): Boolean {
        val depId = step.dependsOnStepId ?: return true
        val depStatus = stepResults[depId] ?: return false
        return when (step.runCondition) {
            "ON_SUCCESS"  -> depStatus == "SUCCESS"
            "ON_FAILURE"  -> depStatus == "FAILED"
            "ON_COMPLETE" -> depStatus in listOf("SUCCESS", "FAILED")
            else          -> depStatus == "SUCCESS"
        }
    }
}
