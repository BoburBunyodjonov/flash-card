import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '../api/client'

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
        const { user, accessToken } = res.data.data
        localStorage.setItem('admin_token', accessToken)
        set({ user, token: accessToken })
      },

      logout: () => {
        localStorage.removeItem('admin_token')
        set({ user: null, token: null })
      },
    }),
    { name: 'admin-auth', partialize: (s) => ({ user: s.user, token: s.token }) },
  ),
)
