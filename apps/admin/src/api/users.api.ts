import { api } from './client'

export const usersApi = {
  list: (params?: Record<string, unknown>) =>
    api.get('/api/admin/users', { params }).then((r) => r.data.data),
  update: (id: string, data: unknown) =>
    api.put(`/api/admin/users/${id}`, data).then((r) => r.data.data),
}
