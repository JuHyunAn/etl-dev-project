package com.platform.etl.execution

import com.platform.etl.domain.connection.DbType
import org.slf4j.LoggerFactory
import java.sql.Connection

/**
 * 이기종 Fetch-and-Process 경로에서 타겟 DB에 행을 배치 기록합니다.
 * writeMode: INSERT | UPSERT | TRUNCATE_INSERT
 */
class TargetWriter(
    private val jdbc: Connection,
    private val dbType: DbType,
    private val table: String,
    private val columns: List<String>,
    private val pkColumns: List<String>,
    private val writeMode: String,
    private val batchSize: Int = 1000
) {
    private val log = LoggerFactory.getLogger(javaClass)

    private var truncateDone = false

    fun writeBatch(rows: List<List<Any?>>) {
        if (rows.isEmpty()) return

        if (writeMode.uppercase() == "TRUNCATE_INSERT" && !truncateDone) {
            jdbc.createStatement().use { it.execute("TRUNCATE TABLE $table") }
            truncateDone = true
            log.debug("[TARGET] TRUNCATE TABLE {}", table)
        }

        val sql = when (writeMode.uppercase()) {
            "UPSERT" -> buildUpsertSql()
            else     -> buildInsertSql()
        }

        val nonPkIndices = columns.indices.filter { columns[it] !in pkColumns }

        jdbc.prepareStatement(sql).use { ps ->
            for ((idx, row) in rows.withIndex()) {
                // INSERT 파트: 전체 컬럼 바인딩
                for ((colIdx, value) in row.withIndex()) {
                    ps.setObject(colIdx + 1, value)
                }
                // MariaDB UPSERT: ON DUPLICATE KEY UPDATE col = ? 파트에 non-PK 값 재바인딩
                // PostgreSQL ON CONFLICT EXCLUDED 방식은 추가 바인딩 불필요
                // Oracle MERGE USING (? AS col) 방식은 INSERT 파트와 동일 바인딩
                if (writeMode.uppercase() == "UPSERT" && dbType == DbType.MARIADB) {
                    for ((updateIdx, colIdx) in nonPkIndices.withIndex()) {
                        ps.setObject(columns.size + updateIdx + 1, row[colIdx])
                    }
                }
                ps.addBatch()

                if ((idx + 1) % batchSize == 0) {
                    ps.executeBatch()
                }
            }
            ps.executeBatch()
        }
    }

    private fun buildInsertSql(): String {
        val colList = columns.joinToString(", ")
        val placeholders = columns.map { "?" }.joinToString(", ")
        return "INSERT INTO $table ($colList) VALUES ($placeholders)"
    }

    private fun buildUpsertSql(): String {
        val colList = columns.joinToString(", ")
        val placeholders = columns.map { "?" }.joinToString(", ")
        val nonPkCols = columns.filter { it !in pkColumns }

        return when (dbType) {
            DbType.POSTGRESQL -> {
                val pkConflict = pkColumns.joinToString(", ")
                val updateSet = nonPkCols.joinToString(", ") { "$it = EXCLUDED.$it" }
                if (nonPkCols.isEmpty()) {
                    "INSERT INTO $table ($colList) VALUES ($placeholders) ON CONFLICT ($pkConflict) DO NOTHING"
                } else {
                    "INSERT INTO $table ($colList) VALUES ($placeholders) ON CONFLICT ($pkConflict) DO UPDATE SET $updateSet"
                }
            }
            DbType.MARIADB -> {
                val updateSet = nonPkCols.joinToString(", ") { "$it = ?" }
                if (nonPkCols.isEmpty()) {
                    "INSERT IGNORE INTO $table ($colList) VALUES ($placeholders)"
                } else {
                    "INSERT INTO $table ($colList) VALUES ($placeholders) ON DUPLICATE KEY UPDATE $updateSet"
                }
            }
            DbType.ORACLE -> {
                // Oracle: MERGE INTO 문 (단일 행 바인딩으로 구성)
                val onCond = pkColumns.joinToString(" AND ") { "t.$it = s.$it" }
                val srcCols = columns.mapIndexed { i, c -> "? AS $c" }.joinToString(", ")
                val updateSet = nonPkCols.joinToString(", ") { "t.$it = s.$it" }
                val insertCols = columns.joinToString(", ")
                val insertVals = columns.map { "s.$it" }.joinToString(", ")
                if (nonPkCols.isEmpty()) {
                    "MERGE INTO $table t USING (SELECT $srcCols FROM DUAL) s ON ($onCond) WHEN NOT MATCHED THEN INSERT ($insertCols) VALUES ($insertVals)"
                } else {
                    "MERGE INTO $table t USING (SELECT $srcCols FROM DUAL) s ON ($onCond) WHEN MATCHED THEN UPDATE SET $updateSet WHEN NOT MATCHED THEN INSERT ($insertCols) VALUES ($insertVals)"
                }
            }
        }
    }
}
