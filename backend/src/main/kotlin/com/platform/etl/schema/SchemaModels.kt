package com.platform.etl.schema

data class TableInfo(
    val schemaName: String?,
    val tableName: String,
    val tableType: String = "TABLE",    // TABLE | VIEW
    val rowCount: Long? = null
)

data class ColumnInfo(
    val columnName: String,
    val dataType: String,
    val nullable: Boolean,
    val columnDefault: String?,
    val characterMaxLength: Int?,
    val numericPrecision: Int?,
    val numericScale: Int?,
    val isPrimaryKey: Boolean = false,
    val isForeignKey: Boolean = false
)

data class SchemaResponse(
    val connectionId: String,
    val tables: List<TableInfo>
)

data class TableSchemaResponse(
    val connectionId: String,
    val tableName: String,
    val columns: List<ColumnInfo>
)
