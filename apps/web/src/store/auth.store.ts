import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi } from '../api/auth.api'
import { clearAuthSession } from '../lib/session'

interface User {
  id: string
  firstName: string
  lastName?: string
  username?: string
  avatarUrl?: string
  phone?: string | null
  language: 'uz' | 'en' | 'ru'
  isPremium: boolean
  premiumUntil?: string
  streak: number
  xp: number
  cefrLevel?: string | null
  onboardingDone?: boolean
  gender?: 'male' | 'female' | null
  notifyAt?: string
  notifyEnabled?: boolean
  isTeacher?: boolean
  teacherSlugs?: string[]
}

export interface ReferralBonus {
  xp: number
  bonusWords: number
}

type AuthResult = {
  user: User
  accessToken: string
  refreshToken: string
  referralBonus?: ReferralBonus | null
}

function applyAuthResult(
  set: (partial: Partial<AuthStore>) => void,
  result: AuthResult,
) {
  localStorage.setItem('accessToken', result.accessToken)
  localStorage.setItem('refreshToken', result.refreshToken)
  set({
    user: result.user,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    referralBonus: result.referralBonus ?? null,
    isLoading: false,
    loginError: null,
  })
}

function authErrorMessage(e: unknown): string {
  return (
    (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
    (e instanceof Error ? e.message : 'Login failed')
  )
}

interface AuthStore {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isLoading: boolean
  loginError: string | null
  referralBonus: ReferralBonus | null
  loginWebApp: (initData: string) => Promise<void>
  loginWidget: (data: Record<string, string>) => Promise<void>
  loginPhone: (data: { phone: string; password: string }) => Promise<void>
  registerPhone: (data: { phone: string; password: string; firstName: string }) => Promise<void>
  setUser: (user: User) => void
  clearReferralBonus: () => void
  logout: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: false,
      loginError: null,
      referralBonus: null,

      loginWebApp: async (initData) => {
        set({ isLoading: true, loginError: null })
        try {
          const result = await authApi.loginWebApp(initData)
          applyAuthResult(set, result)
        } catch (e) {
          set({ isLoading: false, loginError: authErrorMessage(e) })
          throw e
        }
      },

      loginWidget: async (data) => {
        set({ isLoading: true, loginError: null })
        try {
          const result = await authApi.loginWidget(data)
          applyAuthResult(set, result)
        } catch (e) {
          set({ isLoading: false, loginError: authErrorMessage(e) })
          throw e
        }
      },

      loginPhone: async (data) => {
        set({ isLoading: true, loginError: null })
        try {
          const result = await authApi.loginPhone(data)
          applyAuthResult(set, result)
        } catch (e) {
          set({ isLoading: false, loginError: authErrorMessage(e) })
          throw e
        }
      },

      registerPhone: async (data) => {
        set({ isLoading: true, loginError: null })
        try {
          const result = await authApi.registerPhone(data)
          applyAuthResult(set, result)
        } catch (e) {
          set({ isLoading: false, loginError: authErrorMessage(e) })
          throw e
        }
      },

      setUser: (user) => set({ user }),

      clearReferralBonus: () => set({ referralBonus: null }),

      logout: () => {
        clearAuthSession()
        set({ user: null, accessToken: null, refreshToken: null, loginError: null, referralBonus: null })
      },
    }),
    { name: 'auth', partialize: (s) => ({ user: s.user, accessToken: s.accessToken, refreshToken: s.refreshToken }) },
  ),
)
