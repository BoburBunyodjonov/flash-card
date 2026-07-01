import { api } from './client'

export interface GcUser {
  id: string
  firstName: string
  lastName: string | null
  username: string | null
  avatarUrl: string | null
}

export interface GcQuestion {
  wordId: string
  word: string
  pronunciation: string | null
  choices: string[]
  correctIndex: number
}

export interface GcLeaderRow {
  rank: number
  user: GcUser
  score: number
  timeMs: number
  completed: boolean
  isMe: boolean
}

export interface GroupChallenge {
  id: string
  creator: GcUser
  questions: GcQuestion[]
  questionCount: number
  expiresAt: string
  createdAt: string
  expired: boolean
  joined: boolean
  submitted: boolean
  myScore: number | null
  playerCount: number
  leaderboard: GcLeaderRow[]
  link?: string | null
  startParam?: string
  xpEarned?: number
}

export const gcApi = {
  list: () => api.get('/api/group-challenge').then((r) => r.data.data as GroupChallenge[]),
  create: () => api.post('/api/group-challenge').then((r) => r.data.data as GroupChallenge),
  get: (id: string) => api.get(`/api/group-challenge/${id}`).then((r) => r.data.data as GroupChallenge),
  join: (id: string) => api.post(`/api/group-challenge/${id}/join`).then((r) => r.data.data as GroupChallenge),
  submit: (id: string, score: number, timeMs: number) =>
    api.post(`/api/group-challenge/${id}/submit`, { score, timeMs }).then((r) => r.data.data as GroupChallenge),
}
