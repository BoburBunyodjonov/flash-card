import { api } from './client'

export const wordsApi = {
  search: (q: string, page = 1) =>
    api.get('/api/words', { params: { q, page } }).then((r) => r.data.data),
  getById: (id: string) => api.get(`/api/words/${id}`).then((r) => r.data.data),
  getDictionary: (id: string) => api.get(`/api/words/${id}/dictionary`).then((r) => r.data.data),
  toggleBookmark: (id: string) => api.post(`/api/words/${id}/bookmark`).then((r) => r.data.data),
}
