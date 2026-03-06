import { create } from 'zustand'
import type { Connection, Project, Job, ExecutionResult } from '../types'

interface AppState {
  // Connections
  connections: Connection[]
  setConnections: (c: Connection[]) => void
  upsertConnection: (c: Connection) => void
  removeConnection: (id: string) => void

  // Projects
  projects: Project[]
  setProjects: (p: Project[]) => void
  upsertProject: (p: Project) => void
  removeProject: (id: string) => void

  // Jobs (per project)
  jobs: Record<string, Job[]>
  setJobs: (projectId: string, jobs: Job[]) => void
  upsertJob: (projectId: string, job: Job) => void
  removeJob: (projectId: string, jobId: string) => void

  // Execution
  lastExecution: ExecutionResult | null
  setLastExecution: (r: ExecutionResult | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  connections: [],
  setConnections: (connections) => set({ connections }),
  upsertConnection: (c) => set((s) => ({
    connections: s.connections.find(x => x.id === c.id)
      ? s.connections.map(x => x.id === c.id ? c : x)
      : [...s.connections, c]
  })),
  removeConnection: (id) => set((s) => ({
    connections: s.connections.filter(x => x.id !== id)
  })),

  projects: [],
  setProjects: (projects) => set({ projects }),
  upsertProject: (p) => set((s) => ({
    projects: s.projects.find(x => x.id === p.id)
      ? s.projects.map(x => x.id === p.id ? p : x)
      : [...s.projects, p]
  })),
  removeProject: (id) => set((s) => ({
    projects: s.projects.filter(x => x.id !== id)
  })),

  jobs: {},
  setJobs: (projectId, jobs) => set((s) => ({ jobs: { ...s.jobs, [projectId]: jobs } })),
  upsertJob: (projectId, job) => set((s) => {
    const list = s.jobs[projectId] ?? []
    return {
      jobs: {
        ...s.jobs,
        [projectId]: list.find(x => x.id === job.id)
          ? list.map(x => x.id === job.id ? job : x)
          : [...list, job]
      }
    }
  }),
  removeJob: (projectId, jobId) => set((s) => ({
    jobs: {
      ...s.jobs,
      [projectId]: (s.jobs[projectId] ?? []).filter(x => x.id !== jobId)
    }
  })),

  lastExecution: null,
  setLastExecution: (lastExecution) => set({ lastExecution }),
}))
