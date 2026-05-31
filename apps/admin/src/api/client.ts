import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export const api = axios.create({ baseURL: API_URL })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const url = err.config?.url ?? ''
    if (err.response?.status === 401 && !url.includes('/api/auth/admin-login')) {
      const { useAuthStore } = await import('../store/auth.store')
      useAuthStore.getState().logout()
    }
    return Promise.reject(err)
  },
)
