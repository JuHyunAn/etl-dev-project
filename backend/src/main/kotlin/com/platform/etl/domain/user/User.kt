package com.platform.etl.domain.user

import jakarta.persistence.*
import java.time.LocalDateTime
import java.util.UUID

@Entity
@Table(name = "users")
data class User(
    @Id val id: UUID = UUID.randomUUID(),

    @Column(nullable = false, length = 20)
    val provider: String,           // "github" | "google"

    @Column(name = "provider_id", nullable = false)
    val providerId: String,

    @Column(nullable = false)
    var name: String,

    @Column(nullable = false)
    var email: String,

    @Column(name = "avatar_url")
    var avatarUrl: String? = null,

    @Column(name = "password_hash")
    var passwordHash: String? = null,

    @Column(nullable = false, length = 20)
    val role: String = "USER",

    @Column(name = "created_at", nullable = false)
    val createdAt: LocalDateTime = LocalDateTime.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: LocalDateTime = LocalDateTime.now()
)
