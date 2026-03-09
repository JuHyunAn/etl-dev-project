import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import axios from 'axios'

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
      // setAuth()가 이미 호출된 경우(OAuth2 콜백 등) 덮어쓰지 않음
      if (tokenRef.current) return true
      tokenRef.current = accessToken
      setState({ user, accessToken, loading: false })
      scheduleRefresh(15)
      return true
    } catch {
      // setAuth()가 이미 호출된 경우 로그아웃 상태로 되돌리지 않음
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
      await axios.delete('http://localhost:8080/api/auth/logout', { withCredentials: true })
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
