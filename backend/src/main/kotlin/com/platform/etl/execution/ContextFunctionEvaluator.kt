package com.platform.etl.execution

import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.UUID

/**
 * Context 변수 값에서 내장 함수 표현식을 평가.
 *
 * 지원 함수 (화이트리스트):
 *   ${today(format)}         — 오늘 날짜  (기본 포맷: yyyyMMdd)
 *   ${now(format)}           — 현재 일시  (기본 포맷: yyyyMMddHHmmss)
 *   ${uuid()}                — UUID v4
 *   ${dateAdd(date, days)}   — date + days일  (date='today' 또는 yyyyMMdd 문자열)
 *   ${env(KEY)}              — 서버 환경변수 (허가된 키만)
 *
 * 보안: 허용 목록 외 함수 또는 env 키 접근 시 원본 표현식 그대로 유지.
 */
@Component
class ContextFunctionEvaluator {
    private val log = LoggerFactory.getLogger(javaClass)
    private val fnPattern = Regex("""\$\{(\w+)\(([^)]*)\)\}""")

    // env()에서 접근 허용된 환경변수 키
    private val allowedEnvKeys = setOf("ETL_ENV", "ETL_PROJECT", "ETL_VERSION")

    fun evaluate(value: String): String {
        if (!value.contains("\${")) return value
        return fnPattern.replace(value) { mr ->
            val fnName = mr.groupValues[1]
            val rawArgs = mr.groupValues[2]
            val args = rawArgs.split(",").map { it.trim().trim('"', '\'') }
            runCatching {
                when (fnName) {
                    "today"   -> today(args.getOrNull(0))
                    "now"     -> now(args.getOrNull(0))
                    "uuid"    -> UUID.randomUUID().toString()
                    "dateAdd" -> dateAdd(args.getOrNull(0), args.getOrNull(1))
                    "env"     -> env(args.getOrNull(0))
                    else      -> { log.warn("Unknown context function: $fnName"); mr.value }
                }
            }.getOrElse { e ->
                log.warn("Context function evaluation failed: ${mr.value} — ${e.message}")
                mr.value
            }
        }
    }

    private fun today(fmt: String?): String {
        val f = fmt?.takeIf { it.isNotBlank() } ?: "yyyyMMdd"
        return LocalDate.now().format(DateTimeFormatter.ofPattern(f))
    }

    private fun now(fmt: String?): String {
        val f = fmt?.takeIf { it.isNotBlank() } ?: "yyyyMMddHHmmss"
        return LocalDateTime.now().format(DateTimeFormatter.ofPattern(f))
    }

    private fun dateAdd(dateStr: String?, daysStr: String?): String {
        val base = when {
            dateStr.isNullOrBlank() || dateStr == "today" -> LocalDate.now()
            else -> LocalDate.parse(dateStr, DateTimeFormatter.ofPattern("yyyyMMdd"))
        }
        val days = daysStr?.toLongOrNull() ?: 0L
        return base.plusDays(days).format(DateTimeFormatter.ofPattern("yyyyMMdd"))
    }

    private fun env(key: String?): String {
        if (key.isNullOrBlank()) return ""
        if (key !in allowedEnvKeys) {
            log.warn("env() access denied for key: $key (not in allowlist)")
            return ""
        }
        return System.getenv(key) ?: ""
    }
}
