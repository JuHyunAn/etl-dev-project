import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import DashboardPage from './pages/DashboardPage'
import ConnectionsPage from './pages/ConnectionsPage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import JobDesignerPage from './pages/JobDesignerPage'
import ExecutionsPage from './pages/ExecutionsPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/connections" element={<ConnectionsPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="/executions" element={<ExecutionsPage />} />
        </Route>
        {/* Job Designer — full screen, no outer layout padding */}
        <Route path="/projects/:projectId/jobs/:jobId" element={<JobDesignerLayout />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

function JobDesignerLayout() {
  return (
    <div className="flex h-screen bg-[#0d1117] overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">
        <JobDesignerPage />
      </div>
    </div>
  )
}
