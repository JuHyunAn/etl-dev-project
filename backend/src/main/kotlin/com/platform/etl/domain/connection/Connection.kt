package com.platform.etl.domain.connection

import jakarta.persistence.*
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UpdateTimestamp
import java.time.LocalDateTime
import java.util.UUID

@Entity
@Table(name = "connections")
class Connection(

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    val id: UUID = UUID.randomUUID(),

    @Column(nullable = false, length = 100)
    var name: String,

    @Column(nullable = false)
    var description: String = "",

    @Enumerated(EnumType.STRING)
    @Column(name = "db_type", nullable = false, length = 20)
    var dbType: DbType,

    @Column(nullable = false, length = 255)
    var host: String,

    @Column(nullable = false)
    var port: Int,

    /** Oracle: SID 또는 Service Name / MariaDB·PostgreSQL: 데이터베이스명 */
    @Column(nullable = false, length = 255)
    var database: String,

    /** PostgreSQL 스키마 (null = public 또는 전체) */
    @Column(length = 255)
    var schema: String? = null,

    @Column(nullable = false, length = 100)
    var username: String,

    /** AES 암호화 저장 */
    @Column(nullable = false, length = 512)
    var passwordEncrypted: String,

    @Column(name = "ssl_enabled", nullable = false)
    var sslEnabled: Boolean = false,

    /** 직접 JDBC URL 지정 (null이면 host/port/database 조합으로 자동 생성) */
    @Column(name = "jdbc_url_override", length = 1024)
    var jdbcUrlOverride: String? = null,

    @Column(name = "extra_props", columnDefinition = "TEXT")
    var extraProps: String? = null,  // JSON 형태 추가 프로퍼티

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    val createdAt: LocalDateTime = LocalDateTime.now(),

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    var updatedAt: LocalDateTime = LocalDateTime.now()
)

enum class DbType {
    ORACLE,
    MARIADB,
    POSTGRESQL
}
