import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, AuthUser } from '../contexts/AuthContext'

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuth()

  useEffect(() => {
    // URL fragment: #access_token=...&provider=...&name=...&email=...&avatar=...
    const hash = window.location.hash.slice(1)
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    const provider = params.get('provider')
    const name = params.get('name')
    const email = params.get('email')
    const avatar = params.get('avatar')

    if (!accessToken || !name || !email) {
      navigate('/login', { replace: true })
      return
    }

    const user: AuthUser = {
      id: '',
      name: decodeURIComponent(name),
      email: decodeURIComponent(email),
      provider: (provider as AuthUser['provider']) || 'local',
      avatarUrl: avatar ? decodeURIComponent(avatar) : undefined,
      role: 'USER',
    }

    setAuth(accessToken, user)

    // fragment 제거 후 메인으로 이동
    navigate('/', { replace: true })
  }, [])

  return (
    <div className="flex items-center justify-center h-screen" style={{ background: '#f8fafc' }}>
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm" style={{ color: '#64748b' }}>로그인 처리 중...</p>
      </div>
    </div>
  )
}
