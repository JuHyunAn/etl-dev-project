import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import client from '../api/client'

export interface AuthUser {
  id: string
  name: string
  email: string
  provider: 'github' | 'google' | 'local'
  avatarUrl?: string
  role: string
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  loading: boolean
}

interface AuthContextValue extends AuthState {
  setAuth: (token: string, user: AuthUser) => void
  loginAsGuest: () => void
  logout: () => Promise<void>
  getToken: () => string | null
  silentRefresh: () => Promise<boolean>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, accessToken: null, loading: true })
  const tokenRef = useRef<string | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleRefresh = useCallback((minutesUntilExpiry: number) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    // 만료 1분 전에 갱신
    const delay = Math.max((minutesUntilExpiry - 1) * 60 * 1000, 30_000)
    refreshTimerRef.current = setTimeout(async () => {
      await silentRefreshInternal()
    }, delay)
  }, [])

  const silentRefreshInternal = useCallback(async (): Promise<boolean> => {
    try {
      const res = await axios.post<{ accessToken: string; user: AuthUser }>(
        'http://localhost:8080/api/auth/refresh',
        {},
        { withCredentials: true }
      )
      const { accessToken, user } = res.data
      // 항상 새 토큰으로 갱신 (만료 토큰이 남아있어도 덮어씀)
      tokenRef.current = accessToken
      setState({ user, accessToken, loading: false })
      scheduleRefresh(15)
      return true
    } catch {
      // refresh 실패 시: setAuth()로 이미 유효한 토큰이 있으면 로그아웃하지 않음
      if (tokenRef.current) return true
      setState({ user: null, accessToken: null, loading: false })
      return false
    }
  }, [scheduleRefresh])

  // 앱 시작 시 refresh cookie로 자동 복원
  useEffect(() => {
    silentRefreshInternal()
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    }
  }, [])

  const setAuth = useCallback((token: string, user: AuthUser) => {
    tokenRef.current = token
    setState({ user, accessToken: token, loading: false })
    scheduleRefresh(15)
  }, [scheduleRefresh])

  const logout = useCallback(async () => {
    try {
      await client.delete('/api/auth/logout')
    } catch { /* 무시 */ }
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    tokenRef.current = null
    setState({ user: null, accessToken: null, loading: false })
  }, [])

  const getToken = useCallback(() => tokenRef.current, [])

  const loginAsGuest = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    tokenRef.current = null
    setState({
      user: { id: 'guest', name: 'Guest', email: '', provider: 'local', role: 'GUEST' },
      accessToken: null,
      loading: false,
    })
  }, [])

  return (
    <AuthContext.Provider value={{
      ...state,
      setAuth,
      loginAsGuest,
      logout,
      getToken,
      silentRefresh: silentRefreshInternal,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
