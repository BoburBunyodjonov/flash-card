import { api } from './client'

export interface AchievementStatus {
  code: string
  xp: number
  unlocked: boolean
  unlockedAt: string | null
}

export interface AchievementsResult {
  list: AchievementStatus[]
  newlyUnlocked: string[]
  awardedXp: number
}

export const progressApi = {
  getOverall: () => api.get('/api/progress').then((r) => r.data.data),
  getStreak: () => api.get('/api/progress/streak').then((r) => r.data.data),
  getWeakWords: () => api.get('/api/progress/weak-words').then((r) => r.data.data),
  getHistory: (period: 'week' | 'month' | '3months') =>
    api.get('/api/progress/history', { params: { period } }).then((r) => r.data.data),
  // Syncs + returns server-side achievements (also awards XP for new unlocks).
  getAchievements: () => api.get('/api/progress/achievements').then((r) => r.data.data as AchievementsResult),
}
