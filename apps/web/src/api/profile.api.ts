import { api } from './client'

export interface ReferralInfo {
  startParam: string
  link: string | null
  count: number
  referrals: { firstName: string; avatarUrl: string | null; createdAt: string }[]
}

export const profileApi = {
  get: () => api.get('/api/').then((r) => r.data.data),
  setNotifyTime: (notifyAt: string) => api.put('/api/notifications', { notifyAt }),
  setNotifyEnabled: (enabled: boolean) => api.put('/api/notifications', { enabled }),
  setLanguage: (language: string) => api.put('/api/language', { language }),
  setLevel: (level: string) => api.put('/api/level', { level }),
  getReferral: () => api.get('/api/referral').then((r) => r.data.data as ReferralInfo),
}
