package com.platform.etl.execution

import com.platform.etl.ir.JobIR
import java.time.LocalDateTime
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

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
    val previewMode: Boolean,
    val cancelFlag: AtomicBoolean = AtomicBoolean(false)
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
    val rowSamples: LogRowData? = null,
    // T_LOG_ROW가 여러 OUTPUT에 연결된 경우: 테이블명 → 해당 경로의 샘플 데이터
    val tableRowSamples: Map<String, LogRowData>? = null
)

enum class ExecutionStatus {
    PENDING, RUNNING, SUCCESS, FAILED, SKIPPED
}
