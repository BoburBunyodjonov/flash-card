import { create } from 'zustand'
import { feedApi } from '../api/feed.api'
import type { FeedWord } from '@wordswipe/shared'

interface FeedStats {
  usedToday: number
  dailyLimit: number
  remaining: number
  learnedToday: number
}

interface PendingSwipe {
  wordId: string
  direction: 'left' | 'right' | 'up'
  ts: number
}

// Offline support: last loaded feed is cached, swipes made offline are queued
// and replayed when the connection returns.
const OFFLINE_FEED_KEY = 'ws_offline_feed'
const PENDING_SWIPES_KEY = 'ws_pending_swipes'

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage full / unavailable — offline cache is best-effort
  }
}

function getPendingSwipes(): PendingSwipe[] {
  return readJson<PendingSwipe[]>(PENDING_SWIPES_KEY) ?? []
}

function queueSwipe(swipe: PendingSwipe) {
  writeJson(PENDING_SWIPES_KEY, [...getPendingSwipes(), swipe])
}

/** Replays queued offline swipes. Safe to call repeatedly. */
export async function flushPendingSwipes() {
  let pending = getPendingSwipes()
  while (pending.length > 0) {
    const [next, ...rest] = pending
    try {
      await feedApi.swipe(next.wordId, next.direction)
    } catch (err: any) {
      // 4xx → the swipe is invalid (e.g. duplicate), drop it; network error → keep and retry later
      if (!err?.response) break
    }
    pending = rest
    writeJson(PENDING_SWIPES_KEY, pending)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { flushPendingSwipes() })
}

interface FeedStore {
  words: FeedWord[]
  currentIndex: number
  stats: FeedStats | null
  isLoading: boolean
  isLimitReached: boolean
  isEmpty: boolean
  isOffline: boolean
  lastSwipeDir: 'left' | 'right' | 'up' | null
  selectedCategoryId: string | null
  loadFeed: () => Promise<void>
  swipe: (wordId: string, direction: 'left' | 'right' | 'up') => Promise<void>
  nextCard: () => void
  setCategory: (id: string | null) => void
}

export const useFeedStore = create<FeedStore>((set, get) => ({
  words: [],
  currentIndex: 0,
  stats: null,
  isLoading: false,
  isLimitReached: false,
  isEmpty: false,
  isOffline: false,
  lastSwipeDir: null,
  selectedCategoryId: null,

  loadFeed: async () => {
    const { selectedCategoryId } = get()
    set({ isLoading: true })
    try {
      await flushPendingSwipes()
      const data = await feedApi.getFeed(selectedCategoryId ?? undefined)
      const stats = await feedApi.getStats()
      const limitReached = data.remaining === 0 && stats.dailyLimit > 0
      const empty = data.words.length === 0 && !limitReached
      writeJson(OFFLINE_FEED_KEY, { words: data.words, stats })
      set({
        words: data.words,
        stats,
        isLoading: false,
        isLimitReached: limitReached,
        isEmpty: empty,
        isOffline: false,
        currentIndex: 0,
      })
    } catch {
      // Offline fallback: continue with the cached feed, skipping cards already swiped
      const cached = readJson<{ words: FeedWord[]; stats: FeedStats }>(OFFLINE_FEED_KEY)
      const swipedIds = new Set(getPendingSwipes().map((s) => s.wordId))
      const words = (cached?.words ?? []).filter((w) => !swipedIds.has(w.id))
      set({
        words,
        stats: cached?.stats ?? null,
        isLoading: false,
        isLimitReached: false,
        isEmpty: words.length === 0,
        isOffline: true,
        currentIndex: 0,
      })
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
    } catch (err: any) {
      // Network failure → remember the swipe and replay it when back online
      if (!err?.response) {
        queueSwipe({ wordId, direction, ts: Date.now() })
        set({ isOffline: true })
      }
    }
  },

  nextCard: () => {
    const { currentIndex, words, stats, isOffline } = get()
    if (currentIndex < words.length - 1) {
      set({ currentIndex: currentIndex + 1, lastSwipeDir: null })
    } else if (isOffline) {
      set({ isEmpty: true })
    } else if (stats && stats.remaining <= 1) {
      set({ isLimitReached: true })
    } else {
      get().loadFeed()
    }
  },

  setCategory: (id) => {
    set({ selectedCategoryId: id, words: [], currentIndex: 0, isLimitReached: false, isEmpty: false })
    get().loadFeed()
  },
}))
