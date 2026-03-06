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
            val schema = conn.schema
            val tables = mutableListOf<TableInfo>()

            // TABLE + VIEW 모두 조회
            meta.getTables(
                if (conn.dbType == DbType.ORACLE) conn.database else null,
                schema?.uppercase() ?: if (conn.dbType == DbType.ORACLE) conn.username.uppercase() else null,
                "%",
                arrayOf("TABLE", "VIEW")
            ).use { rs ->
                while (rs.next()) {
                    tables += TableInfo(
                        schemaName = rs.getString("TABLE_SCHEM"),
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
            val isOracle = conn.dbType == DbType.ORACLE
            val resolvedSchema = schemaName?.let { if (isOracle) it.uppercase() else it }
                ?: conn.schema?.let { if (isOracle) it.uppercase() else it }
                ?: if (isOracle) conn.username.uppercase() else null
            // Oracle은 대문자, 그 외(PostgreSQL, MariaDB)는 원본 케이스 유지
            val resolvedTable = if (isOracle) tableName.uppercase() else tableName

            // PK 정보
            val pkColumns = mutableSetOf<String>()
            meta.getPrimaryKeys(null, resolvedSchema, resolvedTable).use { rs ->
                while (rs.next()) pkColumns += rs.getString("COLUMN_NAME")
            }

            val columns = mutableListOf<ColumnInfo>()
            meta.getColumns(null, resolvedSchema, resolvedTable, "%").use { rs ->
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
