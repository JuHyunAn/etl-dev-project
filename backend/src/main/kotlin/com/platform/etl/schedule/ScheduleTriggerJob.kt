package com.platform.etl.schedule

import org.quartz.Job
import org.quartz.JobExecutionContext
import org.springframework.stereotype.Component
import java.util.UUID

@Component
class ScheduleTriggerJob(
    private val scheduleExecutionService: ScheduleExecutionService
) : Job {
    override fun execute(context: JobExecutionContext) {
        val scheduleId = context.mergedJobDataMap.getString("scheduleId") ?: return
        scheduleExecutionService.trigger(UUID.fromString(scheduleId), triggerType = "CRON")
    }
}
