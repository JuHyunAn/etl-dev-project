package com.platform.etl.domain.job

import jakarta.persistence.*
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.annotations.UpdateTimestamp
import org.hibernate.type.SqlTypes
import java.time.LocalDateTime
import java.util.UUID

@Entity
@Table(name = "jobs")
class Job(
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    val id: UUID = UUID.randomUUID(),

    @Column(name = "project_id", nullable = false)
    val projectId: UUID,

    @Column(name = "folder_id")
    var folderId: UUID? = null,

    @Column(nullable = false, length = 100)
    var name: String,

    @Column(length = 500)
    var description: String = "",

    @Column(nullable = false, length = 10)
    var version: String = "0.1",

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    var status: JobStatus = JobStatus.DRAFT,

    /** Job IR JSON (JSONB 컬럼) — UI ↔ 실행 엔진 사이의 Single Source of Truth */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "ir_json", nullable = false, columnDefinition = "jsonb")
    var irJson: String = "{}",

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    val createdAt: LocalDateTime = LocalDateTime.now(),

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    var updatedAt: LocalDateTime = LocalDateTime.now()
)

enum class JobStatus {
    DRAFT,      // 편집 중
    PUBLISHED,  // 배포됨 (스케줄 실행 가능)
    ARCHIVED    // 보관
}
