import { prisma } from '../lib/prisma'
import { redis } from '../lib/redis'
import { getFreeLimits } from './plan-settings.service'
import { calculateNextReview } from '../utils/spaced-repetition'
import { XP_PER_WORD, XP_STREAK_MULTIPLIER } from '@wordswipe/shared'
import type { Language } from '@wordswipe/shared'

const DAILY_COUNT_KEY = (userId: string) => `feed:daily:${userId}:${todayKey()}`
const FEED_QUEUE_KEY = (userId: string) => `feed:queue:${userId}:${todayKey()}`

function todayKey() {
  return new Date().toISOString().split('T')[0]
}

export async function getDailyFeed(userId: string, isPremium: boolean, language: Language) {
  const limits = await getFreeLimits()
  const dailyLimit = isPremium ? 999999 : (limits.dailySwipeLimit || 20)

  const usedToday = parseInt((await redis.get(DAILY_COUNT_KEY(userId))) ?? '0')
  const remaining = dailyLimit - usedToday

  if (remaining <= 0 && !isPremium) {
    return { words: [], remaining: 0, dailyLimit, usedToday }
  }

  const cachedQueue = await redis.get(FEED_QUEUE_KEY(userId))
  if (cachedQueue) {
    const queue = JSON.parse(cachedQueue)
    return { words: queue.slice(0, remaining), remaining, dailyLimit, usedToday }
  }

  const batchSize = isPremium ? 50 : dailyLimit
  const reviewCount = Math.floor(batchSize * 0.4)
  const newCount = batchSize - reviewCount

  const reviewWords = await prisma.userWordProgress.findMany({
    where: {
      userId,
      nextReview: { lte: new Date() },
      status: { not: 'mastered' },
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

  const newWords = await prisma.word.findMany({
    where: { id: { notIn: seenIds } },
    take: newCount,
    orderBy: [{ category: { order: 'asc' } }, { difficulty: 'asc' }],
    include: { translations: { where: { language } }, category: true },
  })

  const reviewFormatted = (reviewWords as any[]).map((p) => formatWord(p.word, p, language))
  const newFormatted = (newWords as any[]).map((w) => formatWord(w, null, language))

  const queue = shuffle([...reviewFormatted, ...newFormatted])

  await redis.setex(FEED_QUEUE_KEY(userId), 86400, JSON.stringify(queue))

  return {
    words: queue.slice(0, remaining),
    remaining,
    dailyLimit,
    usedToday,
  }
}

export async function recordSwipe(
  userId: string,
  wordId: string,
  direction: 'left' | 'right' | 'up',
  isPremium: boolean,
) {
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

async function updateStreak(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastActive: true, streak: true },
  })
  if (!user) return

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const lastActive = user.lastActive ? new Date(user.lastActive) : null

  if (lastActive) {
    lastActive.setHours(0, 0, 0, 0)
    const diff = Math.floor((today.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24))
    if (diff === 0) return
    if (diff === 1) {
      await prisma.user.update({ where: { id: userId }, data: { streak: { increment: 1 }, lastActive: new Date() } })
    } else {
      await prisma.user.update({ where: { id: userId }, data: { streak: 0, lastActive: new Date() } })
    }
  } else {
    await prisma.user.update({ where: { id: userId }, data: { streak: 1, lastActive: new Date() } })
  }
}

export async function getTodayStats(userId: string, isPremium: boolean) {
  const limits = await getFreeLimits()
  const dailyLimit = isPremium ? 999999 : (limits.dailySwipeLimit || 20)
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
  }
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
