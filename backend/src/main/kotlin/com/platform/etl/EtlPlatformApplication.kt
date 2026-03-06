package com.platform.etl

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class EtlPlatformApplication

fun main(args: Array<String>) {
    runApplication<EtlPlatformApplication>(*args)
}
