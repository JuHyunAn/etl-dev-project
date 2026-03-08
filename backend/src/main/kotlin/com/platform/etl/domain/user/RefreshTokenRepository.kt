package com.platform.etl.domain.user

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import java.time.LocalDateTime
import java.util.UUID

interface RefreshTokenRepository : JpaRepository<RefreshToken, UUID> {
    fun findByTokenHash(tokenHash: String): RefreshToken?

    @Modifying
    @Query("DELETE FROM RefreshToken t WHERE t.user.id = :userId")
    fun deleteAllByUserId(userId: UUID)

    @Modifying
    @Query("DELETE FROM RefreshToken t WHERE t.expiresAt < :now")
    fun deleteAllExpired(now: LocalDateTime)
}
