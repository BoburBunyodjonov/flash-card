import { api } from './client'

export interface ReferralInfo {
  startParam: string
  link: string | null
  count: number
  referrals: { firstName: string; avatarUrl: string | null; createdAt: string }[]
}

export const profileApi = {
  get: () => api.get('/api/').then((r) => r.data.data),
  setNotifyTime: (notifyAt: string) => api.put('/api/notifications', { notifyAt }).then((r) => r.data),
  setNotifyEnabled: (enabled: boolean) => api.put('/api/notifications', { enabled }).then((r) => r.data),
  setLanguage: (language: string) => api.put('/api/language', { language }).then((r) => r.data),
  setLevel: (level: string) => api.put('/api/level', { level }).then((r) => r.data),
  getReferral: () => api.get('/api/referral').then((r) => r.data.data as ReferralInfo),
}
