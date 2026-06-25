import { api } from './client'

export const decksApi = {
  list: () => api.get('/api/decks').then((r) => r.data.data),
  create: (name: string, description?: string) =>
    api.post('/api/decks', { name, description }).then((r) => r.data.data),
  rename: (id: string, name: string) =>
    api.put(`/api/decks/${id}`, { name }).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/api/decks/${id}`).then((r) => r.data),
  getWords: (id: string) => api.get(`/api/decks/${id}/words`).then((r) => r.data.data),
  addWord: (id: string, wordId: string) =>
    api.post(`/api/decks/${id}/words`, { wordId }).then((r) => r.data),
  removeWord: (id: string, wordId: string) =>
    api.delete(`/api/decks/${id}/words/${wordId}`).then((r) => r.data),
}

/** Extracts the `error` message from a failed API response, if present. */
export function getApiErrorMessage(e: unknown): string | null {
  if (e && typeof e === 'object' && 'response' in e) {
    const data = (e as { response?: { data?: { error?: unknown } } }).response?.data
    if (data && typeof data.error === 'string' && data.error) return data.error
  }
  return null
}
