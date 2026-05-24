import { api } from './client'

export const progressApi = {
  getOverall: () => api.get('/api/progress').then((r) => r.data.data),
  getStreak: () => api.get('/api/progress/streak').then((r) => r.data.data),
  getWeakWords: () => api.get('/api/progress/weak-words').then((r) => r.data.data),
  getHistory: (period: 'week' | 'month') =>
    api.get('/api/progress/history', { params: { period } }).then((r) => r.data.data),
}
