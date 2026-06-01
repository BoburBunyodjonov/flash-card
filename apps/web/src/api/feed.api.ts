import { api } from './client'

export const feedApi = {
  getFeed: (categoryId?: string) =>
    api.get('/api/feed', { params: categoryId ? { categoryId } : {} }).then((r) => r.data.data),
  swipe: (wordId: string, direction: 'left' | 'right' | 'up') =>
    api.post('/api/feed/swipe', { wordId, direction }).then((r) => r.data.data),
  getStats: () => api.get('/api/feed/stats').then((r) => r.data.data),
}
