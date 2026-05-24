import { api } from './client'

export const settingsApi = {
  getAll: () => api.get('/api/admin/settings').then((r) => r.data.data),
  update: (key: string, value: number | boolean) =>
    api.put(`/api/admin/settings/${key}`, { value }),
  sendNotification: (message: string, target: 'all' | 'premium' | 'free') =>
    api.post('/api/admin/notifications/send', { message, target }).then((r) => r.data.data),
}
