import { api } from './client'

export interface ShareUser {
  id: string
  firstName: string
  lastName: string | null
  username: string | null
  avatarUrl: string | null
}

export interface WordShare {
  id: string
  status: 'pending' | 'accepted' | 'declined'
  wordCount: number
  createdAt: string
  respondedAt: string | null
  fromUser: ShareUser
  toUser: ShareUser
  words: Array<{ word: string; translation: string }>
}

export const wordShareApi = {
  recipients: (): Promise<ShareUser[]> =>
    api.get('/api/word-shares/recipients').then((r) => r.data.data),

  incoming: (): Promise<WordShare[]> =>
    api.get('/api/word-shares/incoming').then((r) => r.data.data),

  incomingCount: (): Promise<number> =>
    api.get('/api/word-shares/incoming/count').then((r) => r.data.data.count),

  get: (id: string): Promise<WordShare> =>
    api.get(`/api/word-shares/${id}`).then((r) => r.data.data),

  create: (body: { toUserIds: string[]; wordIds?: string[]; all?: boolean }): Promise<WordShare[]> =>
    api.post('/api/word-shares', body).then((r) => r.data.data),

  accept: (id: string): Promise<{ added: number; skipped: number }> =>
    api.post(`/api/word-shares/${id}/accept`).then((r) => r.data.data),

  decline: (id: string): Promise<void> =>
    api.post(`/api/word-shares/${id}/decline`).then(() => undefined),
}
