package com.platform.etl.domain.connection

import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import java.time.LocalDateTime
import java.util.UUID

data class ConnectionCreateRequest(
    @field:NotBlank val name: String,
    val description: String = "",
    @field:NotNull val dbType: DbType,
    @field:NotBlank val host: String,
    @field:Min(1) @field:Max(65535) val port: Int,
    // MariaDB/MySQL: 공란 허용 → 서버 전체 접근 (테이블명을 db.table 형식으로 참조)
    val database: String = "",
    val schema: String? = null,
    @field:NotBlank val username: String,
    @field:NotBlank val password: String,
    val sslEnabled: Boolean = false,
    val jdbcUrlOverride: String? = null,
    val extraProps: Map<String, String>? = null
)

data class ConnectionUpdateRequest(
    val name: String? = null,
    val description: String? = null,
    val host: String? = null,
    val port: Int? = null,
    val database: String? = null,
    val schema: String? = null,
    val username: String? = null,
    val password: String? = null,
    val sslEnabled: Boolean? = null,
    val jdbcUrlOverride: String? = null,
    val extraProps: Map<String, String>? = null
)

data class ConnectionResponse(
    val id: UUID,
    val name: String,
    val description: String,
    val dbType: DbType,
    val host: String,
    val port: Int,
    val database: String,
    val schema: String?,
    val username: String,
    val sslEnabled: Boolean,
    val jdbcUrlOverride: String?,
    val createdAt: LocalDateTime,
    val updatedAt: LocalDateTime
)

data class ConnectionTestResult(
    val success: Boolean,
    val message: String,
    val durationMs: Long
)

fun Connection.toResponse() = ConnectionResponse(
    id = id,
    name = name,
    description = description,
    dbType = dbType,
    host = host,
    port = port,
    database = database,
    schema = schema,
    username = username,
    sslEnabled = sslEnabled,
    jdbcUrlOverride = jdbcUrlOverride,
    createdAt = createdAt,
    updatedAt = updatedAt
)
