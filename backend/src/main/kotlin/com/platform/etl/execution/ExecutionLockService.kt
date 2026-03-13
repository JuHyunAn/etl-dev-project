package com.platform.etl.execution

import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import java.net.InetAddress
import java.util.UUID

/**
 * Job 동시 실행 방지 서비스.
 * etl_execution_locks 테이블을 이용한 낙관적 잠금 (INSERT 성공 = 락 획득).
 */
@Service
class ExecutionLockService(private val jdbc: JdbcTemplate) {

    private val instanceId: String = runCatching { InetAddress.getLocalHost().hostName }
        .getOrDefault("unknown") + "-" + ProcessHandle.current().pid()

    /**
     * 잠금 획득 시도. true = 성공(실행 가능), false = 이미 다른 실행이 진행 중.
     */
    fun tryLock(jobId: UUID): Boolean {
        return try {
            jdbc.update(
                "INSERT INTO etl_execution_locks (job_id, locked_at, instance_id) VALUES (?, NOW(), ?)",
                jobId, instanceId
            )
            true
        } catch (_: DuplicateKeyException) {
            false
        } catch (_: Exception) {
            false
        }
    }

    /**
     * 잠금 해제. 성공/실패 여부 무관하게 실행 완료 후 반드시 호출해야 함.
     */
    fun unlock(jobId: UUID) {
        runCatching {
            jdbc.update("DELETE FROM etl_execution_locks WHERE job_id = ?", jobId)
        }
    }

    /**
     * 현재 잠금 중인 job_id 여부 조회.
     */
    fun isLocked(jobId: UUID): Boolean {
        val count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM etl_execution_locks WHERE job_id = ?",
            Int::class.java, jobId
        ) ?: 0
        return count > 0
    }
}
