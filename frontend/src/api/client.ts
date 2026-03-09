import axios, { InternalAxiosRequestConfig } from 'axios'

// AuthContext에서 토큰을 가져오는 함수 레퍼런스 (순환 참조 방지)
let getTokenFn: (() => string | null) | null = null
let silentRefreshFn: (() => Promise<boolean>) | null = null

export function registerAuthHandlers(
  getToken: () => string | null,
  silentRefresh: () => Promise<boolean>
) {
  getTokenFn = getToken
  silentRefreshFn = silentRefresh
}

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8080',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
  withCredentials: true,
})

// 요청 인터셉터: Authorization 헤더 자동 추가
client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getTokenFn?.()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 응답 인터셉터: 401 → silent refresh → 재시도
let isRefreshing = false
let waitQueue: Array<(success: boolean) => void> = []

client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config

    if (err.response?.status === 401 && !originalRequest._retry) {
      // 토큰 없음(게스트/비로그인) → refresh 시도 안 함
      if (!getTokenFn?.()) {
        const msg = err.response?.data?.message || err.response?.data || err.message
        return Promise.reject(new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)))
      }
      if (isRefreshing) {
        // 이미 refresh 중이면 대기
        return new Promise((resolve, reject) => {
          waitQueue.push((success) => {
            if (success) resolve(client(originalRequest))
            else reject(err)
          })
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      const ok = silentRefreshFn ? await silentRefreshFn() : false
      isRefreshing = false
      waitQueue.forEach(cb => cb(ok))
      waitQueue = []

      if (ok) return client(originalRequest)
    }

    const msg = err.response?.data?.message || err.response?.data || err.message
    return Promise.reject(new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)))
  }
)

export default client
