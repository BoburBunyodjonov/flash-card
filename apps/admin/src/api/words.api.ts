import { api } from './client'

export const wordsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get('/api/admin/words', { params }).then((r) => r.data.data),
  create: (data: unknown) => api.post('/api/admin/words', data).then((r) => r.data.data),
  update: (id: string, data: unknown) => api.put(`/api/admin/words/${id}`, data).then((r) => r.data.data),
  delete: (id: string) => api.delete(`/api/admin/words/${id}`),
  fetchDictionary: (word: string) =>
    api.post('/api/admin/words/fetch-dictionary', { word }).then((r) => r.data.data),
  bulkImport: (words: unknown[]) =>
    api.post('/api/admin/words/import', { words }).then((r) => r.data.data),
}
