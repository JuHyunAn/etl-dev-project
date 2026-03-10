package com.platform.etl.config

import org.quartz.Scheduler
import org.springframework.context.ApplicationContext
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.quartz.SchedulerFactoryBean
import org.springframework.scheduling.quartz.SpringBeanJobFactory

@Configuration
class QuartzConfig(private val applicationContext: ApplicationContext) {

    @Bean
    fun springBeanJobFactory(): SpringBeanJobFactory {
        val factory = SpringBeanJobFactory()
        factory.setApplicationContext(applicationContext)
        return factory
    }

    @Bean
    fun schedulerFactoryBean(jobFactory: SpringBeanJobFactory): SchedulerFactoryBean {
        val factory = SchedulerFactoryBean()
        factory.setJobFactory(jobFactory)
        factory.setAutoStartup(true)
        factory.setWaitForJobsToCompleteOnShutdown(true)
        factory.setOverwriteExistingJobs(true)
        return factory
    }

    @Bean
    fun quartzScheduler(schedulerFactoryBean: SchedulerFactoryBean): Scheduler =
        schedulerFactoryBean.scheduler
}
