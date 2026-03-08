package com.platform.etl.execution

import com.platform.etl.ir.JobIR
import java.time.LocalDateTime
import java.util.UUID

data class ExecutionRequest(
    val jobId: UUID,
    val irJson: String,
    val context: Map<String, String> = emptyMap(),
    val previewMode: Boolean = false,   // true면 Output 컴포넌트 실행 안 함 (드라이런)
    val maxPreviewRows: Int = 100
)

data class ExecutionPlan(
    val executionId: UUID = UUID.randomUUID(),
    val jobId: UUID,
    val ir: JobIR,
    val sortedNodeIds: List<String>,    // 위상 정렬된 실행 순서
    val context: Map<String, String>,
    val previewMode: Boolean
)

data class ExecutionResult(
    val executionId: UUID,
    val jobId: UUID,
    val status: ExecutionStatus,
    val startedAt: LocalDateTime,
    val finishedAt: LocalDateTime?,
    val durationMs: Long?,
    val nodeResults: Map<String, NodeResult>,
    val errorMessage: String? = null,
    val logs: List<String> = emptyList()
)

data class LogRowData(
    val columns: List<String>,
    val rows: List<List<Any?>>
)

data class NodeResult(
    val nodeId: String,
    val nodeType: String,
    val status: ExecutionStatus,
    val rowsProcessed: Long = 0,
    val rowsRejected: Long = 0,
    val durationMs: Long = 0,
    val generatedSql: String? = null,
    val errorMessage: String? = null,
    val rowSamples: LogRowData? = null
)

enum class ExecutionStatus {
    PENDING, RUNNING, SUCCESS, FAILED, SKIPPED
}
