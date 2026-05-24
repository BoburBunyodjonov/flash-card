import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi } from '../api/auth.api'

interface User {
  id: string
  firstName: string
  lastName?: string
  username?: string
  avatarUrl?: string
  language: 'uz' | 'en' | 'ru'
  isPremium: boolean
  premiumUntil?: string
  streak: number
  xp: number
  notifyAt?: string
}

interface AuthStore {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isLoading: boolean
  loginWebApp: (initData: string) => Promise<void>
  loginWidget: (data: Record<string, string>) => Promise<void>
  setUser: (user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: false,

      loginWebApp: async (initData) => {
        set({ isLoading: true })
        const result = await authApi.loginWebApp(initData)
        localStorage.setItem('accessToken', result.accessToken)
        localStorage.setItem('refreshToken', result.refreshToken)
        set({ user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken, isLoading: false })
      },

      loginWidget: async (data) => {
        set({ isLoading: true })
        const result = await authApi.loginWidget(data)
        localStorage.setItem('accessToken', result.accessToken)
        localStorage.setItem('refreshToken', result.refreshToken)
        set({ user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken, isLoading: false })
      },

      setUser: (user) => set({ user }),

      logout: () => {
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        set({ user: null, accessToken: null, refreshToken: null })
      },
    }),
    { name: 'auth', partialize: (s) => ({ user: s.user, accessToken: s.accessToken, refreshToken: s.refreshToken }) },
  ),
)
