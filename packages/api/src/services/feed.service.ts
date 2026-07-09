import { prisma } from '../lib/prisma'
import { redis } from '../lib/redis'
import { getFreeLimits, getSetting } from './plan-settings.service'
import { PLAN_SETTING_KEYS } from '@wordswipe/shared'
import { calculateNextReview } from '../utils/spaced-repetition'
import { addLeagueXp } from './league.service'
import { reviewUserWord } from './my-words.service'
import { XP_PER_WORD, XP_STREAK_MULTIPLIER, DIFFICULTIES } from '@wordswipe/shared'
import type { Language, Difficulty } from '@wordswipe/shared'

// Reserved categoryId that switches the feed to "only my added words" mode.
const PERSONAL_CATEGORY_ID = 'personal'

// Label shown on the category chip for the user's own added words.
const PERSONAL_CATEGORY_NAME: Record<Language, string> = {
  uz: "Mening so'zlarim",
  en: 'My Words',
  ru: 'Мои слова',
}

/** CEFR window: words up to one level above the user's own level. */
function allowedDifficulties(level: Difficulty | null): Difficulty[] | null {
  if (!level) return null
  const idx = DIFFICULTIES.indexOf(level)
  if (idx === -1) return null
  return DIFFICULTIES.slice(0, Math.min(idx + 2, DIFFICULTIES.length)) as Difficulty[]
}

const DAILY_COUNT_KEY = (userId: string) => `feed:daily:${userId}:${todayKey()}`
const FEED_QUEUE_KEY = (userId: string) => `feed:queue:${userId}:${todayKey()}`
const BONUS_KEY = (userId: string) => `feed:bonus:${userId}:${todayKey()}`

function todayKey() {
  return new Date().toISOString().split('T')[0]
}

/** Adds extra swipe capacity for today (e.g. referral rewards). Expires at day end. */
export async function grantBonusWords(userId: string, count: number) {
  await redis.incrby(BONUS_KEY(userId), count)
  await redis.expire(BONUS_KEY(userId), 86400)
}

async function getBonusWords(userId: string): Promise<number> {
  return parseInt((await redis.get(BONUS_KEY(userId))) ?? '0')
}

export async function getDailyFeed(userId: string, isPremium: boolean, language: Language, categoryId?: string) {
  const globalFeedEnabled = await getSetting<boolean>(PLAN_SETTING_KEYS.GLOBAL_FEED_ENABLED)
  // When the curated catalog is off, every feed request serves only user-added words.
  const effectiveCategoryId = globalFeedEnabled ? categoryId : PERSONAL_CATEGORY_ID

  const limits = await getFreeLimits()
  const bonus = isPremium ? 0 : await getBonusWords(userId)
  const dailyLimit = isPremium ? 999999 : (limits.dailySwipeLimit || 20) + bonus

  const usedToday = parseInt((await redis.get(DAILY_COUNT_KEY(userId))) ?? '0')
  const remaining = dailyLimit - usedToday

  if (remaining <= 0 && !isPremium) {
    return { words: [], remaining: 0, dailyLimit, usedToday, globalFeedEnabled }
  }

  const queueKey = `feed:queue:${userId}:${todayKey()}:${effectiveCategoryId || 'all'}`

  // The personal "My Words" list is small and changes often (add/remove/review),
  // so it's never cached — always served fresh to avoid stale results.
  const useCache = effectiveCategoryId !== PERSONAL_CATEGORY_ID
  if (useCache) {
    const cachedQueue = await redis.get(queueKey)
    if (cachedQueue) {
      const queue = JSON.parse(cachedQueue)
      return { words: queue.slice(0, remaining), remaining, dailyLimit, usedToday, globalFeedEnabled }
    }
  }

  const batchSize = isPremium ? 50 : dailyLimit

  let queue: any[]
  if (effectiveCategoryId === PERSONAL_CATEGORY_ID) {
    // "My Words" filter — all of the user's words EXCEPT mastered ones (a word
    // the user has fully memorized graduates out and stops appearing). Not gated
    // by SM-2 due date, so still-learning words always show. Due/overdue first.
    const personalWords = await prisma.userWord.findMany({
      where: { userId, status: { not: 'mastered' } },
      orderBy: { nextReview: 'asc' },
      take: batchSize,
    })
    queue = (personalWords as any[]).map((w) => formatPersonalWord(w, language))
  } else {
    const reviewCount = Math.floor(batchSize * 0.4)
    const newCount = batchSize - reviewCount

    const reviewWords = await prisma.userWordProgress.findMany({
      where: {
        userId,
        nextReview: { lte: new Date() },
        status: { not: 'mastered' },
        ...(effectiveCategoryId ? { word: { categoryId: effectiveCategoryId } } : {}),
      },
      take: reviewCount,
      orderBy: { nextReview: 'asc' },
      include: { word: { include: { translations: { where: { language } }, category: true } } },
    })

    const seenWordIds = await prisma.userWordProgress.findMany({
      where: { userId },
      select: { wordId: true },
    })
    const seenIds = seenWordIds.map((r: { wordId: string }) => r.wordId)

    const userRow = await prisma.user.findUnique({ where: { id: userId }, select: { cefrLevel: true } })
    const levels = allowedDifficulties((userRow?.cefrLevel as Difficulty | null) ?? null)

    const newWords = await prisma.word.findMany({
      where: {
        id: { notIn: seenIds },
        ...(effectiveCategoryId ? { categoryId: effectiveCategoryId } : {}),
        ...(levels ? { difficulty: { in: levels } } : {}),
      },
      take: newCount,
      orderBy: [{ category: { order: 'asc' } }, { difficulty: 'asc' }],
      include: { translations: { where: { language } }, category: true },
    })

    const reviewFormatted = (reviewWords as any[]).map((p) => formatWord(p.word, p, language))
    const newFormatted = (newWords as any[]).map((w) => formatWord(w, null, language))
    queue = shuffle([...reviewFormatted, ...newFormatted])
  }

  if (useCache) await redis.setex(queueKey, 86400, JSON.stringify(queue))

  return {
    words: queue.slice(0, remaining),
    remaining,
    dailyLimit,
    usedToday,
    globalFeedEnabled,
  }
}

export async function recordSwipe(
  userId: string,
  wordId: string,
  direction: 'left' | 'right' | 'up',
  isPremium: boolean,
) {
  // Personal "My Words" entries share the feed but live in their own table —
  // route their swipes to the personal SM-2 path (own daily XP cap, no league).
  const personal = await prisma.userWord.findFirst({
    where: { id: wordId, userId },
    select: { id: true },
  })
  if (personal) {
    if (direction === 'up') return { xpEarned: 0 } // bookmark n/a — already the user's word
    const result = await reviewUserWord(userId, wordId, direction)
    await redis.incr(DAILY_COUNT_KEY(userId))
    await redis.expire(DAILY_COUNT_KEY(userId), 86400)
    await updateStreak(userId)
    return { xpEarned: result.xpEarned, status: result.status }
  }

  if (direction === 'up') {
    await bookmarkWord(userId, wordId)
    return { xpEarned: 0 }
  }

  const existing = await prisma.userWordProgress.findUnique({
    where: { userId_wordId: { userId, wordId } },
  })

  const { strength, nextReview, reviewCount, status } = calculateNextReview(
    direction === 'right' ? 'right' : 'left',
    existing?.strength ?? 0,
    existing?.reviewCount ?? 0,
  )

  await prisma.userWordProgress.upsert({
    where: { userId_wordId: { userId, wordId } },
    update: { strength, nextReview, reviewCount, status, lastReviewed: new Date() },
    create: { userId, wordId, strength, nextReview, reviewCount, status, lastReviewed: new Date() },
  })

  let xpEarned = 0
  if (direction === 'right') {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { streak: true, xp: true } })
    const multiplier = (user?.streak ?? 0) >= 7 ? XP_STREAK_MULTIPLIER : 1
    xpEarned = XP_PER_WORD * multiplier

    await prisma.user.update({
      where: { id: userId },
      data: { xp: { increment: xpEarned } },
    })
    await addLeagueXp(userId, xpEarned)
  }

  await redis.incr(DAILY_COUNT_KEY(userId))
  await redis.expire(DAILY_COUNT_KEY(userId), 86400)

  await updateStreak(userId)

  return { xpEarned, status }
}

async function bookmarkWord(userId: string, wordId: string) {
  const savedDeck = await prisma.userDeck.findFirst({
    where: { userId, isDefault: true },
  })

  if (!savedDeck) {
    const deck = await prisma.userDeck.create({
      data: { userId, name: 'Saved Words', isDefault: true },
    })
    await prisma.deckWord.create({ data: { deckId: deck.id, wordId } })
  } else {
    await prisma.deckWord.upsert({
      where: { deckId_wordId: { deckId: savedDeck.id, wordId } },
      update: {},
      create: { deckId: savedDeck.id, wordId },
    })
  }
}

// Day index in Asia/Tashkent (UTC+5, no DST) — server timezone must not affect streaks
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000
const dayIndex = (date: Date) => Math.floor((date.getTime() + TASHKENT_OFFSET_MS) / 86_400_000)

// Streak-freeze economy: a freeze auto-protects the streak across a single
// missed day. Users start with 2 and earn one on every milestone, capped.
const STREAK_FREEZE_MAX = 3
const STREAK_FREEZE_MILESTONE = 7

async function updateStreak(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastActive: true, streak: true, streakFreezes: true },
  })
  if (!user) return

  if (!user.lastActive) {
    await prisma.user.update({ where: { id: userId }, data: { streak: 1, lastActive: new Date() } })
    return
  }

  const diff = dayIndex(new Date()) - dayIndex(new Date(user.lastActive))
  if (diff === 0) return // already active today

  // diff === 2 means exactly one day was missed — a freeze can bridge it.
  const canContinue = diff === 1 || (diff === 2 && user.streakFreezes > 0)
  if (canContinue) {
    const newStreak = user.streak + 1
    let freezes = user.streakFreezes - (diff === 2 ? 1 : 0)
    // Reward a fresh freeze each time a milestone is reached (capped).
    if (newStreak % STREAK_FREEZE_MILESTONE === 0) {
      freezes = Math.min(STREAK_FREEZE_MAX, freezes + 1)
    }
    await prisma.user.update({
      where: { id: userId },
      data: { streak: newStreak, lastActive: new Date(), streakFreezes: freezes },
    })
  } else {
    // Gap too large (or no freeze left): today's activity restarts at day 1.
    await prisma.user.update({ where: { id: userId }, data: { streak: 1, lastActive: new Date() } })
  }
}

export async function getTodayStats(userId: string, isPremium: boolean) {
  const limits = await getFreeLimits()
  const bonus = isPremium ? 0 : await getBonusWords(userId)
  const dailyLimit = isPremium ? 999999 : (limits.dailySwipeLimit || 20) + bonus
  const usedToday = parseInt((await redis.get(DAILY_COUNT_KEY(userId))) ?? '0')

  const learnedToday = await prisma.userWordProgress.count({
    where: {
      userId,
      lastReviewed: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      status: { in: ['learned', 'mastered'] },
    },
  })

  return { usedToday, dailyLimit, remaining: Math.max(0, dailyLimit - usedToday), learnedToday }
}

function formatWord(word: any, progress: any, language: Language) {
  const translation = word.translations?.find((t: any) => t.language === language) ?? null
  return {
    id: word.id,
    word: word.word,
    pronunciation: word.pronunciation,
    audioUrl: word.audioUrl,
    imageUrl: word.imageUrl,
    partOfSpeech: word.partOfSpeech,
    difficulty: word.difficulty,
    category: {
      id: word.category.id,
      name: word.category[`name${language.charAt(0).toUpperCase() + language.slice(1)}` as 'nameEn'] ?? word.category.nameEn,
      isPremium: word.category.isPremium,
    },
    translation: translation
      ? {
          translation: translation.translation,
          definitionEn: translation.definitionEn,
          exampleEn: translation.exampleEn,
          exampleTranslated: translation.exampleTranslated,
        }
      : null,
    progress: progress
      ? { status: progress.status, strength: progress.strength, reviewCount: progress.reviewCount }
      : null,
    source: 'global' as const,
  }
}

/** Maps a personal UserWord row into the same shape the feed/SwipeCard expects. */
function formatPersonalWord(uw: any, language: Language) {
  return {
    id: uw.id,
    word: uw.word,
    pronunciation: uw.pronunciation,
    audioUrl: uw.audioUrl,
    imageUrl: null,
    partOfSpeech: uw.partOfSpeech,
    difficulty: null,
    category: { id: 'personal', name: PERSONAL_CATEGORY_NAME[language] ?? 'My Words', isPremium: false },
    translation: {
      translation: uw.translation,
      definitionEn: uw.definitionEn,
      exampleEn: uw.exampleEn,
      exampleTranslated: null,
    },
    progress: { status: uw.status, strength: uw.strength, reviewCount: uw.reviewCount },
    source: 'personal' as const,
  }
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
