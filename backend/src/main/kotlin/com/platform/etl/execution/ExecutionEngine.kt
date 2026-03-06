package com.platform.etl.execution

/**
 * ExecutionEngine 인터페이스
 * IR을 받아 실행하는 엔진을 추상화합니다.
 * 현재: SqlPushdownAdapter (타겟 DB에서 SQL 직접 실행)
 * 향후: PythonWorkerAdapter, JvmWorkerAdapter
 */
interface ExecutionEngine {
    val engineType: String
    fun execute(plan: ExecutionPlan): ExecutionResult
    fun validate(plan: ExecutionPlan): List<String>  // 실행 전 유효성 검사 (에러 메시지 리스트)
}
