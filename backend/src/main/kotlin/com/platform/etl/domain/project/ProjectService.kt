package com.platform.etl.domain.project

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
@Transactional
class ProjectService(
    private val projectRepo: ProjectRepository,
    private val folderRepo: FolderRepository
) {
    fun listProjects(): List<ProjectResponse> = projectRepo.findAll().map { it.toResponse() }

    fun getProject(id: UUID): Project = projectRepo.findById(id).orElseThrow {
        NoSuchElementException("Project not found: $id")
    }

    fun createProject(req: ProjectCreateRequest): ProjectResponse =
        projectRepo.save(Project(name = req.name, description = req.description)).toResponse()

    fun updateProject(id: UUID, req: ProjectCreateRequest): ProjectResponse {
        val p = getProject(id)
        p.name = req.name
        p.description = req.description
        return projectRepo.save(p).toResponse()
    }

    fun deleteProject(id: UUID) = projectRepo.deleteById(id)

    fun listFolders(projectId: UUID): List<FolderResponse> =
        folderRepo.findByProjectId(projectId).map { it.toResponse() }

    fun createFolder(projectId: UUID, req: FolderCreateRequest): FolderResponse =
        folderRepo.save(Folder(projectId = projectId, parentId = req.parentId, name = req.name)).toResponse()

    fun deleteFolder(folderId: UUID) = folderRepo.deleteById(folderId)
}
