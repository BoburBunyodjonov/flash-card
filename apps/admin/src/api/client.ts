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
    const original = err.config
    const url = original?.url ?? ''
    const isAuthRoute = url.includes('/api/auth/')

    if (err.response?.status === 401 && original && !original._retry && !isAuthRoute) {
      original._retry = true
      const refresh = localStorage.getItem('admin_refresh_token')
      if (refresh) {
        try {
          const res = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken: refresh })
          const { accessToken } = res.data.data
          localStorage.setItem('admin_token', accessToken)
          original.headers.Authorization = `Bearer ${accessToken}`
          return api(original)
        } catch {
          const { useAuthStore } = await import('../store/auth.store')
          useAuthStore.getState().logout()
        }
      } else {
        const { useAuthStore } = await import('../store/auth.store')
        useAuthStore.getState().logout()
      }
    }
    return Promise.reject(err)
  },
)
