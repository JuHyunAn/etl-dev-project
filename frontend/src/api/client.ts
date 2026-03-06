import axios from 'axios'

const client = axios.create({
  baseURL: 'http://localhost:8080',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

client.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err.response?.data?.message || err.response?.data || err.message
    return Promise.reject(new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)))
  }
)

export default client
