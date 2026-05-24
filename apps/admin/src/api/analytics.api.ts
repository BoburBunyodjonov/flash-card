import { api } from './client'
export const analyticsApi = {
  get: () => api.get('/api/admin/analytics').then((r) => r.data.data),
}
