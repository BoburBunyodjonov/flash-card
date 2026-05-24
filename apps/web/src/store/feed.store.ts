import { create } from 'zustand'
import { feedApi } from '../api/feed.api'
import type { FeedWord } from '@wordswipe/shared'

interface FeedStats {
  usedToday: number
  dailyLimit: number
  remaining: number
  learnedToday: number
}

interface FeedStore {
  words: FeedWord[]
  currentIndex: number
  stats: FeedStats | null
  isLoading: boolean
  isLimitReached: boolean
  lastSwipeDir: 'left' | 'right' | 'up' | null
  loadFeed: () => Promise<void>
  swipe: (wordId: string, direction: 'left' | 'right' | 'up') => Promise<void>
  nextCard: () => void
}

export const useFeedStore = create<FeedStore>((set, get) => ({
  words: [],
  currentIndex: 0,
  stats: null,
  isLoading: false,
  isLimitReached: false,
  lastSwipeDir: null,

  loadFeed: async () => {
    set({ isLoading: true })
    try {
      const data = await feedApi.getFeed()
      const stats = await feedApi.getStats()
      set({
        words: data.words,
        stats,
        isLoading: false,
        isLimitReached: data.remaining === 0,
        currentIndex: 0,
      })
    } catch {
      set({ isLoading: false })
    }
  },

  swipe: async (wordId, direction) => {
    set({ lastSwipeDir: direction })
    try {
      await feedApi.swipe(wordId, direction)
      const stats = get().stats
      if (stats) {
        set({ stats: { ...stats, usedToday: stats.usedToday + 1, remaining: Math.max(0, stats.remaining - 1) } })
      }
    } catch {
      // silent
    }
  },

  nextCard: () => {
    const { currentIndex, words } = get()
    if (currentIndex < words.length - 1) {
      set({ currentIndex: currentIndex + 1, lastSwipeDir: null })
    } else {
      set({ isLimitReached: true })
    }
  },
}))
