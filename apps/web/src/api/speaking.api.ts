import { api } from './client'

export interface SpeakingPartner {
  firstName: string
  avatarUrl: string | null
  cefrLevel: string | null
  gender: 'male' | 'female' | null
  xp: number
}

export interface SpeakingTopics {
  topics: string[]
  words: string[]
}

export const speakingApi = {
  getIce: () => api.get('/api/speaking/ice').then((r) => r.data.data as { iceServers: RTCIceServer[] }),
  getTopics: () => api.get('/api/speaking/topics').then((r) => r.data.data as SpeakingTopics),
  rate: (sessionId: string, liked: boolean) =>
    api.post('/api/speaking/rate', { sessionId, liked }).then((r) => r.data),
  report: (sessionId: string, reason: string) =>
    api.post('/api/speaking/report', { sessionId, reason }).then((r) => r.data),
  setGender: (gender: 'male' | 'female' | null) =>
    api.put('/api/gender', { gender }).then((r) => r.data),
}
