import { api } from './client'

export interface DuelUser {
  id: string
  firstName: string
  lastName: string | null
  username: string | null
  avatarUrl: string | null
}

export interface DuelQuestion {
  wordId: string
  word: string
  pronunciation: string | null
  choices: string[]
  correctIndex: number
}

export interface Duel {
  id: string
  status: 'pending' | 'active' | 'completed' | 'expired'
  isChallenger: boolean
  challenger: DuelUser
  opponent: DuelUser | null
  questions: DuelQuestion[]
  myScore: number | null
  theirScore: number | null
  challengerScore: number | null
  opponentScore: number | null
  winnerId: string | null
  createdAt: string
  completedAt: string | null
  link?: string | null
  startParam?: string
}

export const duelApi = {
  list: () => api.get('/api/duel').then((r) => r.data.data as Duel[]),
  create: () => api.post('/api/duel').then((r) => r.data.data as Duel),
  get: (id: string) => api.get(`/api/duel/${id}`).then((r) => r.data.data as Duel),
  join: (id: string) => api.post(`/api/duel/${id}/join`).then((r) => r.data.data as Duel),
  submit: (id: string, score: number, timeMs: number) =>
    api.post(`/api/duel/${id}/submit`, { score, timeMs }).then((r) => r.data.data as Duel),
}
