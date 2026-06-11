import { api } from './client'

export interface LeagueMember {
  rank: number
  userId: string
  firstName: string
  lastName: string | null
  username: string | null
  avatarUrl: string | null
  streak: number
  weeklyXp: number
  isMe: boolean
}

export interface LeagueData {
  tier: number
  tierName: string
  maxTier: number
  weekStart: string
  weekEnd: string
  promoteCount: number
  demoteCount: number
  myRank: number
  members: LeagueMember[]
}

export const leagueApi = {
  me: () => api.get('/api/league/me').then((r) => r.data.data as LeagueData),
}
