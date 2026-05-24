import { api } from './client'

export const profileApi = {
  get: () => api.get('/api/').then((r) => r.data.data),
  setNotifyTime: (notifyAt: string) => api.put('/api/notifications', { notifyAt }),
  setLanguage: (language: string) => api.put('/api/language', { language }),
}
