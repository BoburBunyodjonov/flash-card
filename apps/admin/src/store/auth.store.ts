import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '../api/client'
import { clearAdminSession } from '../lib/session'

interface AdminUser {
  id: string
  firstName: string
  isAdmin: boolean
}

interface AuthStore {
  user: AdminUser | null
  token: string | null
  loginWithPassword: (username: string, password: string) => Promise<void>
  logout: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,

      loginWithPassword: async (username, password) => {
        const res = await api.post('/api/auth/admin-login', { username, password })
        const { user, accessToken, refreshToken } = res.data.data
        localStorage.setItem('admin_token', accessToken)
        localStorage.setItem('admin_refresh_token', refreshToken)
        set({ user, token: accessToken })
      },

      logout: () => {
        clearAdminSession()
        set({ user: null, token: null })
      },
    }),
    { name: 'admin-auth', partialize: (s) => ({ user: s.user, token: s.token }) },
  ),
)
