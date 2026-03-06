package com.platform.etl.domain.project

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface ProjectRepository : JpaRepository<Project, UUID>

interface FolderRepository : JpaRepository<Folder, UUID> {
    fun findByProjectId(projectId: UUID): List<Folder>
    fun findByProjectIdAndParentId(projectId: UUID, parentId: UUID?): List<Folder>
}
