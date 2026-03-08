import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { registerAuthHandlers } from './api/client'
import AppLayout from './components/layout/AppLayout'
import DashboardPage from './pages/DashboardPage'
import ConnectionsPage from './pages/ConnectionsPage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import JobDesignerPage from './pages/JobDesignerPage'
import ExecutionsPage from './pages/ExecutionsPage'
import LoginPage from './pages/LoginPage'
import AuthCallbackPage from './pages/AuthCallbackPage'

// client.ts에 auth 핸들러 등록
function AuthBridge() {
  const { getToken, silentRefresh } = useAuth()
  useEffect(() => {
    registerAuthHandlers(getToken, silentRefresh)
  }, [getToken, silentRefresh])
  return null
}

// 인증 필요 라우트 보호
// guestAllowed=true: Guest(읽기전용)도 접근 허용
function ProtectedRoute({ children, guestAllowed = false }: { children: React.ReactNode; guestAllowed?: boolean }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: '#f8fafc' }}>
        <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'GUEST' && !guestAllowed) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AuthBridge />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />

          {/* Guest는 Dashboard만 접근 가능, 나머지는 로그인 필요 */}
          <Route element={<ProtectedRoute guestAllowed><AppLayout /></ProtectedRoute>}>
            <Route path="/" element={<DashboardPage />} />
          </Route>
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="/connections" element={<ConnectionsPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
            <Route path="/executions" element={<ExecutionsPage />} />
          </Route>

          {/* Job Designer — full screen */}
          <Route
            path="/projects/:projectId/jobs/:jobId"
            element={<ProtectedRoute><JobDesignerLayout /></ProtectedRoute>}
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

function JobDesignerLayout() {
  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">
        <JobDesignerPage />
      </div>
    </div>
  )
}
