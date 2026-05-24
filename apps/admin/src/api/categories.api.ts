import { api } from './client'

export const categoriesApi = {
  list: () => api.get('/api/admin/categories').then((r) => r.data.data),
  create: (data: unknown) => api.post('/api/admin/categories', data).then((r) => r.data.data),
  update: (id: string, data: unknown) => api.put(`/api/admin/categories/${id}`, data).then((r) => r.data.data),
  delete: (id: string) => api.delete(`/api/admin/categories/${id}`),
}
