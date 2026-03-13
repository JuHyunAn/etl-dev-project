package com.platform.etl.schema

import com.platform.etl.domain.connection.ConnectionService
import com.platform.etl.domain.connection.DbType
import org.springframework.stereotype.Service
import java.sql.DriverManager
import java.util.UUID

@Service
class SchemaService(private val connectionService: ConnectionService) {

    fun listTables(connectionId: UUID): List<TableInfo> {
        val conn = connectionService.get(connectionId)
        val jdbcUrl = connectionService.buildJdbcUrl(conn)
        val password = connectionService.getDecryptedPassword(conn.id)

        return DriverManager.getConnection(jdbcUrl, conn.username, password).use { jdbc ->
            val meta = jdbc.metaData
            val tables = mutableListOf<TableInfo>()

            // DB 타입별 catalog / schemaPattern 분기
            // - Oracle    : catalog = database(SID), schema = username 대문자
            // - MariaDB   : catalog = database명 (database 공란이면 전체 database 조회)
            //               MySQL/MariaDB JDBC는 catalog = database, schema 개념 없음
            // - PostgreSQL: catalog = null, schema = conn.schema (없으면 전체)
            val (catalog, schemaPattern) = when (conn.dbType) {
                DbType.ORACLE    -> conn.database to (conn.schema?.uppercase() ?: conn.username.uppercase())
                DbType.MARIADB   -> (conn.database.ifBlank { null }) to null
                DbType.POSTGRESQL -> null to conn.schema
            }

            // 시스템 DB 필터 (MariaDB 전체 조회 시 제외 대상)
            val mariadbSystemDbs = setOf("information_schema", "mysql", "performance_schema", "sys")

            meta.getTables(catalog, schemaPattern, "%", arrayOf("TABLE", "VIEW")).use { rs ->
                while (rs.next()) {
                    // MariaDB는 TABLE_CAT = database명, TABLE_SCHEM = null
                    val cat   = rs.getString("TABLE_CAT")
                    val schem = rs.getString("TABLE_SCHEM")

                    // MariaDB 전체 조회 시 시스템 DB 제외
                    if (conn.dbType == DbType.MARIADB && catalog == null &&
                        cat != null && cat.lowercase() in mariadbSystemDbs) continue

                    // MariaDB: schemaName을 TABLE_CAT(database명)으로 채움 (TABLE_SCHEM이 null이므로)
                    val displaySchema = if (conn.dbType == DbType.MARIADB) cat else schem

                    tables += TableInfo(
                        schemaName = displaySchema,
                        tableName = rs.getString("TABLE_NAME"),
                        tableType = rs.getString("TABLE_TYPE") ?: "TABLE"
                    )
                }
            }
            tables
        }
    }

    fun getTableSchema(connectionId: UUID, tableName: String, schemaName: String? = null): List<ColumnInfo> {
        val conn = connectionService.get(connectionId)
        val jdbcUrl = connectionService.buildJdbcUrl(conn)
        val password = connectionService.getDecryptedPassword(conn.id)

        return DriverManager.getConnection(jdbcUrl, conn.username, password).use { jdbc ->
            val meta = jdbc.metaData

            // DB 타입별 catalog / schema / table 이름 결정
            // - Oracle    : catalog = null, schema = 대문자, table = 대문자
            // - MariaDB   : catalog = database명, schema = null, table = 원본 케이스
            // - PostgreSQL: catalog = null, schema = schemaName or conn.schema, table = 원본 케이스
            // MariaDB: schemaName 파라미터 = database명 (TABLE_CAT 에서 넘어온 값)
            // database 공란 커넥션에서는 schemaName에 실제 database명이 전달되어야 함
            val (catalog, resolvedSchema, resolvedTable) = when (conn.dbType) {
                DbType.ORACLE -> Triple(
                    null,
                    (schemaName ?: conn.schema ?: conn.username).uppercase(),
                    tableName.uppercase()
                )
                DbType.MARIADB -> Triple(
                    // catalog = 실제 database명 (schemaName 우선 → conn.database 순)
                    schemaName?.ifBlank { null } ?: conn.database.ifBlank { null },
                    null,
                    tableName
                )
                DbType.POSTGRESQL -> Triple(
                    null,
                    schemaName ?: conn.schema,
                    tableName
                )
            }

            // PK 정보
            val pkColumns = mutableSetOf<String>()
            meta.getPrimaryKeys(catalog, resolvedSchema, resolvedTable).use { rs ->
                while (rs.next()) pkColumns += rs.getString("COLUMN_NAME")
            }

            val columns = mutableListOf<ColumnInfo>()
            meta.getColumns(catalog, resolvedSchema, resolvedTable, "%").use { rs ->
                while (rs.next()) {
                    columns += ColumnInfo(
                        columnName = rs.getString("COLUMN_NAME"),
                        dataType = rs.getString("TYPE_NAME"),
                        nullable = rs.getInt("NULLABLE") == 1,
                        columnDefault = rs.getString("COLUMN_DEF"),
                        characterMaxLength = rs.getInt("COLUMN_SIZE").takeIf { it > 0 },
                        numericPrecision = rs.getInt("COLUMN_SIZE").takeIf { it > 0 },
                        numericScale = rs.getInt("DECIMAL_DIGITS").takeIf { it >= 0 },
                        isPrimaryKey = rs.getString("COLUMN_NAME") in pkColumns
                    )
                }
            }
            columns
        }
    }
}
