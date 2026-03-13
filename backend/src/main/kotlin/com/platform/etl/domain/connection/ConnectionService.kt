package com.platform.etl.domain.connection

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.security.crypto.encrypt.Encryptors
import org.springframework.security.crypto.keygen.KeyGenerators
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.sql.DriverManager
import java.util.UUID

@Service
@Transactional
class ConnectionService(
    private val repo: ConnectionRepository,
    private val objectMapper: ObjectMapper
) {
    // 프로토타입용 단순 암호화 (prod에서는 Vault/KMS 사용)
    private val salt = KeyGenerators.string().generateKey()
    private val encryptor = Encryptors.text("etl-platform-secret", salt)

    fun list(): List<ConnectionResponse> = repo.findAll().map { it.toResponse() }

    fun get(id: UUID): Connection = repo.findById(id).orElseThrow {
        NoSuchElementException("Connection not found: $id")
    }

    fun create(req: ConnectionCreateRequest): ConnectionResponse {
        val conn = Connection(
            name = req.name,
            description = req.description,
            dbType = req.dbType,
            host = req.host,
            port = req.port,
            database = req.database,
            schema = req.schema,
            username = req.username,
            passwordEncrypted = encryptPassword(req.password),
            sslEnabled = req.sslEnabled,
            jdbcUrlOverride = req.jdbcUrlOverride,
            extraProps = req.extraProps?.let { objectMapper.writeValueAsString(it) }
        )
        return repo.save(conn).toResponse()
    }

    fun update(id: UUID, req: ConnectionUpdateRequest): ConnectionResponse {
        val conn = get(id)
        req.name?.let { conn.name = it }
        req.description?.let { conn.description = it }
        req.host?.let { conn.host = it }
        req.port?.let { conn.port = it }
        req.database?.let { conn.database = it }
        req.schema?.let { conn.schema = it }
        req.username?.let { conn.username = it }
        req.password?.let { conn.passwordEncrypted = encryptPassword(it) }
        req.sslEnabled?.let { conn.sslEnabled = it }
        req.jdbcUrlOverride?.let { conn.jdbcUrlOverride = it }
        req.extraProps?.let { conn.extraProps = objectMapper.writeValueAsString(it) }
        return repo.save(conn).toResponse()
    }

    fun delete(id: UUID) = repo.deleteById(id)

    fun testConnection(id: UUID): ConnectionTestResult {
        val conn = get(id)
        val start = System.currentTimeMillis()
        return try {
            val jdbcUrl = buildJdbcUrl(conn)
            val password = decryptPassword(conn.passwordEncrypted)
            DriverManager.getConnection(jdbcUrl, conn.username, password).use { _ -> }
            ConnectionTestResult(true, "연결 성공", System.currentTimeMillis() - start)
        } catch (e: Exception) {
            ConnectionTestResult(false, e.message ?: "알 수 없는 오류", System.currentTimeMillis() - start)
        }
    }

    fun getDecryptedPassword(id: UUID): String = decryptPassword(get(id).passwordEncrypted)

    fun buildJdbcUrl(conn: Connection): String {
        conn.jdbcUrlOverride?.let { return it }
        return when (conn.dbType) {
            DbType.ORACLE -> "jdbc:oracle:thin:@${conn.host}:${conn.port}:${conn.database}"
            DbType.MARIADB -> {
                // database가 공란이면 서버 전체 접근 (테이블은 db.table 형식으로 참조)
                val dbPart = if (conn.database.isBlank()) "" else "/${conn.database}"
                "jdbc:mysql://${conn.host}:${conn.port}${dbPart}?useSSL=${conn.sslEnabled}&allowPublicKeyRetrieval=true"
            }
            DbType.POSTGRESQL -> {
                val schema = conn.schema?.let { "?currentSchema=$it" } ?: ""
                "jdbc:postgresql://${conn.host}:${conn.port}/${conn.database}$schema"
            }
        }
    }

    private fun encryptPassword(plain: String): String =
        "$salt:${encryptor.encrypt(plain)}"

    private fun decryptPassword(encrypted: String): String {
        val parts = encrypted.split(":", limit = 2)
        return if (parts.size == 2) {
            Encryptors.text("etl-platform-secret", parts[0]).decrypt(parts[1])
        } else encrypted
    }
}
