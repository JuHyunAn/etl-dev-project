package com.platform.etl.domain.connection

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface ConnectionRepository : JpaRepository<Connection, UUID> {
    fun findByNameContainingIgnoreCase(name: String): List<Connection>
    fun findByDbType(dbType: DbType): List<Connection>
    fun existsByName(name: String): Boolean
}
