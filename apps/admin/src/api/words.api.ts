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
  audioStats: () =>
    api.get('/api/admin/words/audio-stats').then(
      (r) =>
        r.data.data as {
          total: number
          with_audio: number
          missing_audio: number
          tts_configured: boolean
        },
    ),
  enrichAudio: (data?: { limit?: number; useTts?: boolean }) =>
    api.post('/api/admin/words/enrich-audio', data ?? {}).then(
      (r) =>
        r.data.data as {
          scanned: number
          dictionaryAudio: number
          ttsAudio: number
          definitionsUpdated: number
          notFound: number
          remaining: number
        },
    ),
}
