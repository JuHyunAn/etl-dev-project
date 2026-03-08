package com.platform.etl.domain.user

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface UserRepository : JpaRepository<User, UUID> {
    fun findByProviderAndProviderId(provider: String, providerId: String): User?
    fun findByEmail(email: String): User?
}
