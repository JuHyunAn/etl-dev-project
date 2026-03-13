package com.platform.etl.execution

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import java.util.UUID

/**
 * Watermark 기반 증분 처리 서비스.
 * etl_watermarks 테이블에서 마지막 처리 기준값을 조회/저장합니다.
 *
 * 규칙:
 *  - load: 저장된 값 없으면 null 반환 → 첫 실행 시 FULL SCAN
 *  - save: 반드시 타겟 write 완전 성공 후에만 호출할 것 (호출 책임은 실행 엔진)
 *  - watermark_value는 UTC ISO-8601 포맷으로 저장 (예: 2026-03-13T00:00:00Z)
 */
@Service
class WatermarkService(private val jdbc: JdbcTemplate) {

    fun load(jobId: UUID, nodeId: String, key: String): String? {
        return runCatching {
            jdbc.queryForObject(
                "SELECT watermark_value FROM etl_watermarks WHERE job_id = ? AND node_id = ? AND watermark_key = ?",
                String::class.java,
                jobId, nodeId, key
            )
        }.getOrNull()
    }

    fun save(jobId: UUID, nodeId: String, key: String, value: String) {
        jdbc.update(
            """
            INSERT INTO etl_watermarks (job_id, node_id, watermark_key, watermark_value, updated_at)
            VALUES (?, ?, ?, ?, NOW())
            ON CONFLICT (job_id, node_id, watermark_key)
            DO UPDATE SET watermark_value = EXCLUDED.watermark_value, updated_at = NOW()
            """.trimIndent(),
            jobId, nodeId, key, value
        )
    }

    fun delete(jobId: UUID, nodeId: String? = null) {
        if (nodeId != null) {
            jdbc.update("DELETE FROM etl_watermarks WHERE job_id = ? AND node_id = ?", jobId, nodeId)
        } else {
            jdbc.update("DELETE FROM etl_watermarks WHERE job_id = ?", jobId)
        }
    }
}
