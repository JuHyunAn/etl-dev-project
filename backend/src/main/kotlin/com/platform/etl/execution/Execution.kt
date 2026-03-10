package com.platform.etl.execution

import jakarta.persistence.*
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes
import java.time.LocalDateTime
import java.util.UUID

@Entity
@Table(name = "executions")
class Execution(
    @Id
    val id: UUID,

    @Column(name = "job_id", nullable = false)
    val jobId: UUID,

    @Column(name = "job_version", nullable = false, length = 10)
    val jobVersion: String,

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    var status: ExecutionStatus,

    @Column(name = "preview_mode", nullable = false)
    val previewMode: Boolean,

    @Column(name = "started_at", nullable = false)
    val startedAt: LocalDateTime,

    @Column(name = "finished_at")
    var finishedAt: LocalDateTime? = null,

    @Column(name = "duration_ms")
    var durationMs: Long? = null,

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "node_results", columnDefinition = "jsonb")
    var nodeResultsJson: String = "{}",

    @Column(name = "error_message")
    var errorMessage: String? = null,

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "logs", columnDefinition = "text[]")
    var logs: Array<String> = emptyArray(),

    @Column(name = "triggered_by", length = 100)
    val triggeredBy: String = "manual"
)
