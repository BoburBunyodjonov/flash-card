import { api } from './client'
import { registerReplayer, enqueueAction, isNetworkError } from '../lib/offlineQueue'

// Word add/remove only reference existing deck + word IDs, so they are safe to
// replay later. (Deck create/rename are not queued — a temp local ID can't be
// matched to the server's real ID on replay.)
registerReplayer('deck-add-word', ({ id, wordId }: { id: string; wordId: string }) =>
  api.post(`/api/decks/${id}/words`, { wordId }).then(() => undefined),
)
registerReplayer('deck-remove-word', ({ id, wordId }: { id: string; wordId: string }) =>
  api.delete(`/api/decks/${id}/words/${wordId}`).then(() => undefined),
)

export const decksApi = {
  list: () => api.get('/api/decks').then((r) => r.data.data),
  create: (name: string, description?: string) =>
    api.post('/api/decks', { name, description }).then((r) => r.data.data),
  rename: (id: string, name: string) =>
    api.put(`/api/decks/${id}`, { name }).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/api/decks/${id}`).then((r) => r.data),
  getWords: (id: string) => api.get(`/api/decks/${id}/words`).then((r) => r.data.data),
  addWord: async (id: string, wordId: string) => {
    try {
      return (await api.post(`/api/decks/${id}/words`, { wordId })).data
    } catch (err) {
      if (!isNetworkError(err)) throw err
      enqueueAction('deck-add-word', { id, wordId })
      return { success: true, offline: true }
    }
  },
  removeWord: async (id: string, wordId: string) => {
    try {
      return (await api.delete(`/api/decks/${id}/words/${wordId}`)).data
    } catch (err) {
      if (!isNetworkError(err)) throw err
      enqueueAction('deck-remove-word', { id, wordId })
      return { success: true, offline: true }
    }
  },
}

/** Extracts the `error` message from a failed API response, if present. */
export function getApiErrorMessage(e: unknown): string | null {
  if (e && typeof e === 'object' && 'response' in e) {
    const data = (e as { response?: { data?: { error?: unknown } } }).response?.data
    if (data && typeof data.error === 'string' && data.error) return data.error
  }
  return null
}
