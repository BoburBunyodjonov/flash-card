import axios from 'axios'

// Bo'sh = same-origin (/api vite proxy orqali localhost:3000 ga boradi)
const API_URL = import.meta.env.VITE_API_URL || ''

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    // ngrok bepul rejim — API HTML warning sahifasini o'tkazib yuborish
    'ngrok-skip-browser-warning': 'true',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refresh = localStorage.getItem('refreshToken')
      if (refresh) {
        try {
          const res = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken: refresh })
          const { accessToken } = res.data.data
          localStorage.setItem('accessToken', accessToken)
          original.headers.Authorization = `Bearer ${accessToken}`
          return api(original)
        } catch {
          localStorage.removeItem('accessToken')
          localStorage.removeItem('refreshToken')
          window.location.reload()
        }
      }
    }
    return Promise.reject(error)
  },
)
