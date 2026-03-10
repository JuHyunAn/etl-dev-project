package com.platform.etl.schedule

import org.slf4j.LoggerFactory
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.stereotype.Component

/**
 * 서버 시작 시 DB의 enabled 스케줄을 Quartz에 재등록.
 * Quartz RAMJobStore는 재시작 시 초기화되므로 반드시 필요.
 */
@Component
class ScheduleStartupLoader(
    private val scheduleRepository: ScheduleRepository,
    private val scheduleService: ScheduleService
) : ApplicationRunner {

    private val log = LoggerFactory.getLogger(ScheduleStartupLoader::class.java)

    override fun run(args: ApplicationArguments) {
        val enabledSchedules = scheduleRepository.findByEnabled(true)
        log.info("Starting Quartz reload: ${enabledSchedules.size} enabled schedule(s) found")

        var loaded = 0
        var failed = 0
        enabledSchedules.forEach { schedule ->
            runCatching {
                scheduleService.reloadQuartz(schedule)
                loaded++
            }.onFailure { e ->
                log.error("Failed to reload schedule '${schedule.name}' (${schedule.id}): ${e.message}")
                failed++
            }
        }
        log.info("Quartz reload complete: $loaded loaded, $failed failed")
    }
}
