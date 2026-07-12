import { prisma } from '../lib/prisma'
import { redis } from '../lib/redis'
import { calculateNextReview } from '../utils/spaced-repetition'
import { XP_PER_WORD, MYWORDS_DAILY_XP_CAP } from '@wordswipe/shared'
import type { WordStatus } from '@wordswipe/shared'

export interface UserWordDTO {
  id: string
  word: string
  translation: string
  pronunciation: string | null
  audioUrl: string | null
  partOfSpeech: string | null
  definitionEn: string | null
  exampleEn: string | null
  synonyms: string[]
  strength: number
  status: WordStatus
  nextReview: Date | null
  reviewCount: number
  lastReviewed: Date | null
  createdAt: Date
  sharedFromUserId: string | null
  sharedFromName: string | null
}

export interface CreateUserWordInput {
  word: string
  translation: string
  pronunciation?: string | null
  audioUrl?: string | null
  partOfSpeech?: string | null
  definitionEn?: string | null
  exampleEn?: string | null
  synonyms?: string[] | null
}

export interface UpdateUserWordInput {
  translation?: string
  pronunciation?: string | null
  audioUrl?: string | null
  partOfSpeech?: string | null
  definitionEn?: string | null
  exampleEn?: string | null
  synonyms?: string[] | null
}

export type PackWordInput = Pick<
  CreateUserWordInput,
  'word' | 'translation' | 'pronunciation' | 'definitionEn' | 'exampleEn'
>

/** Thrown when a user tries to add a word they already have. */
export class DuplicateUserWordError extends Error {
  constructor() {
    super('Word already in your list')
    this.name = 'DuplicateUserWordError'
  }
}

/** Thrown when a word is missing or not owned by the caller. */
export class UserWordNotFoundError extends Error {
  constructor() {
    super('Word not found')
    this.name = 'UserWordNotFoundError'
  }
}

function toDTO(row: any): UserWordDTO {
  return {
    id: row.id,
    word: row.word,
    translation: row.translation,
    pronunciation: row.pronunciation ?? null,
    audioUrl: row.audioUrl ?? null,
    partOfSpeech: row.partOfSpeech ?? null,
    definitionEn: row.definitionEn ?? null,
    exampleEn: row.exampleEn ?? null,
    synonyms: row.synonyms ?? [],
    strength: row.strength,
    status: row.status as WordStatus,
    nextReview: row.nextReview ?? null,
    reviewCount: row.reviewCount,
    lastReviewed: row.lastReviewed ?? null,
    createdAt: row.createdAt,
    sharedFromUserId: row.sharedFromUserId ?? null,
    sharedFromName: row.sharedFromName ?? null,
  }
}

function todayKey() {
  return new Date().toISOString().split('T')[0]
}

const XP_KEY = (userId: string) => `mywords:xp:${userId}:${todayKey()}`

/**
 * Drops today's cached feed queues for the user so a newly added/removed
 * personal word shows up in the main feed immediately (the feed caches per
 * day, keyed `feed:queue:{userId}:{date}:{category}`).
 */
export async function invalidateFeedCache(userId: string): Promise<void> {
  try {
    const keys = await redis.keys(`feed:queue:${userId}:${todayKey()}:*`)
    if (keys.length) await redis.del(...keys)
  } catch {
    // Cache invalidation is best-effort — a miss just delays the word to tomorrow
  }
}

export async function listUserWords(userId: string): Promise<{ words: UserWordDTO[]; dueCount: number }> {
  const now = new Date()
  const rows = await prisma.userWord.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })

  const dueCount = rows.filter(
    (r: any) => r.status === 'new' || (r.nextReview != null && r.nextReview <= now),
  ).length

  return { words: rows.map(toDTO), dueCount }
}

/** Words waiting for spaced-repetition review (new + overdue, excluding mastered). */
export async function countDueUserWords(userId: string): Promise<number> {
  const now = new Date()
  return prisma.userWord.count({
    where: {
      userId,
      status: { not: 'mastered' },
      OR: [{ status: 'new' }, { nextReview: { lte: now } }],
    },
  })
}

export async function createUserWord(userId: string, data: CreateUserWordInput): Promise<UserWordDTO> {
  try {
    const row = await prisma.userWord.create({
      data: {
        userId,
        word: data.word.trim(),
        translation: data.translation.trim(),
        pronunciation: data.pronunciation ?? null,
        audioUrl: data.audioUrl ?? null,
        partOfSpeech: data.partOfSpeech ?? null,
        definitionEn: data.definitionEn ?? null,
        exampleEn: data.exampleEn ?? null,
        synonyms: data.synonyms ?? [],
        // Initial SM-2 state — immediately studyable.
        strength: 0,
        status: 'new',
        nextReview: new Date(),
        reviewCount: 0,
      },
    })
    await invalidateFeedCache(userId)
    return toDTO(row)
  } catch (err: any) {
    // Prisma unique constraint violation.
    if (err?.code === 'P2002') throw new DuplicateUserWordError()
    throw err
  }
}

/** Teacher pack publish — mavjud so'zlarni o'zgartirmaydi, yangilarini qo'shadi. */
export async function assignWordsFromPack(
  userId: string,
  packId: string,
  words: PackWordInput[],
): Promise<{ added: number; skipped: number }> {
  let added = 0
  let skipped = 0

  for (const data of words) {
    const word = data.word.trim()
    if (!word) continue
    try {
      await prisma.userWord.create({
        data: {
          userId,
          word,
          translation: data.translation.trim(),
          pronunciation: data.pronunciation ?? null,
          definitionEn: data.definitionEn ?? null,
          exampleEn: data.exampleEn ?? null,
          sourcePackId: packId,
          strength: 0,
          status: 'new',
          nextReview: new Date(),
          reviewCount: 0,
        },
      })
      added++
    } catch (err: any) {
      if (err?.code === 'P2002') skipped++
      else throw err
    }
  }

  if (added > 0) await invalidateFeedCache(userId)
  return { added, skipped }
}

export async function updateUserWord(
  userId: string,
  id: string,
  data: UpdateUserWordInput,
): Promise<UserWordDTO> {
  const existing = await prisma.userWord.findFirst({ where: { id, userId } })
  if (!existing) throw new UserWordNotFoundError()

  const updateData: Record<string, unknown> = {}
  if (data.translation !== undefined) updateData.translation = data.translation.trim()
  if (data.pronunciation !== undefined) updateData.pronunciation = data.pronunciation
  if (data.audioUrl !== undefined) updateData.audioUrl = data.audioUrl
  if (data.partOfSpeech !== undefined) updateData.partOfSpeech = data.partOfSpeech
  if (data.definitionEn !== undefined) updateData.definitionEn = data.definitionEn
  if (data.exampleEn !== undefined) updateData.exampleEn = data.exampleEn
  if (data.synonyms !== undefined) updateData.synonyms = data.synonyms

  const row = await prisma.userWord.update({ where: { id }, data: updateData })
  return toDTO(row)
}

export async function deleteUserWord(userId: string, id: string): Promise<void> {
  const existing = await prisma.userWord.findFirst({ where: { id, userId } })
  if (!existing) throw new UserWordNotFoundError()
  await prisma.userWord.delete({ where: { id } })
  await invalidateFeedCache(userId)
}

export async function getStudyBatch(userId: string, limit = 20): Promise<{ words: UserWordDTO[] }> {
  const cap = Math.min(Math.max(limit, 1), 100)

  // Practice every word the user is still learning — not just SM-2-"due" ones,
  // so nothing disappears mid-learning — but EXCLUDE mastered words (once fully
  // memorized, a word graduates out). Due/overdue sort first via nextReview asc.
  const rows = await prisma.userWord.findMany({
    where: { userId, status: { not: 'mastered' } },
    orderBy: { nextReview: 'asc' },
    take: cap,
  })

  return { words: rows.map(toDTO) }
}

/** Marks a word as fully memorized — it graduates out of the feed/practice. */
export async function masterUserWord(userId: string, id: string): Promise<UserWordDTO> {
  const existing = await prisma.userWord.findFirst({ where: { id, userId } })
  if (!existing) throw new UserWordNotFoundError()

  const row = await prisma.userWord.update({
    where: { id },
    data: { status: 'mastered', strength: 100, lastReviewed: new Date() },
  })
  await invalidateFeedCache(userId)
  return toDTO(row)
}

/** Brings a (usually mastered) word back into learning — a fresh SM-2 restart. */
export async function relearnUserWord(userId: string, id: string): Promise<UserWordDTO> {
  const existing = await prisma.userWord.findFirst({ where: { id, userId } })
  if (!existing) throw new UserWordNotFoundError()

  const row = await prisma.userWord.update({
    where: { id },
    data: { status: 'new', strength: 0, reviewCount: 0, nextReview: new Date(), lastReviewed: null },
  })
  await invalidateFeedCache(userId)
  return toDTO(row)
}

export interface UserWordPoolItem {
  id: string
  word: string
  translation: string
  pronunciation: string | null
  audioUrl: string | null
  exampleEn: string | null
  strength: number
}

function shufflePool<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Shared pool for quiz, challenge, duel — due/weak personal words first. */
export async function getUserWordPool(userId: string, count: number): Promise<UserWordPoolItem[]> {
  const cap = Math.min(Math.max(count, 1), 100)
  const rows = await prisma.userWord.findMany({
    where: { userId, status: { not: 'mastered' } },
    orderBy: [{ nextReview: 'asc' }, { strength: 'asc' }],
    take: cap * 2,
  })
  const mapped: UserWordPoolItem[] = (rows as any[]).map((r) => ({
    id: r.id,
    word: r.word,
    translation: r.translation,
    pronunciation: r.pronunciation ?? null,
    audioUrl: r.audioUrl ?? null,
    exampleEn: r.exampleEn ?? null,
    strength: r.strength ?? 0,
  }))
  return shufflePool(mapped).slice(0, cap)
}

export async function getUserWordDistractors(
  userId: string,
  excludeIds: string[],
): Promise<{ words: string[]; translations: string[] }> {
  const others = await prisma.userWord.findMany({
    where: { userId, id: { notIn: excludeIds } },
    select: { word: true, translation: true },
    take: 60,
  })
  return {
    words: (others as any[]).map((o) => o.word),
    translations: (others as any[]).map((o) => o.translation),
  }
}

/** Applies graded SM-2 to a personal word (same rules as Memorize submit). */
export async function applyUserWordSm2(
  userId: string,
  id: string,
  correct: boolean,
): Promise<{ status: WordStatus; nextReview: Date | null; strength: number } | null> {
  const existing = await prisma.userWord.findFirst({ where: { id, userId } })
  if (!existing) return null

  const { strength, nextReview, reviewCount, status } = calculateNextReview(
    correct ? 'right' : 'left',
    existing.strength,
    existing.reviewCount,
  )

  await prisma.userWord.update({
    where: { id },
    data: { strength, nextReview, reviewCount, status, lastReviewed: new Date() },
  })

  return { status: status as WordStatus, nextReview, strength }
}

export async function reviewUserWord(
  userId: string,
  id: string,
  direction: 'left' | 'right',
): Promise<{ xpEarned: number; status: WordStatus; nextReview: Date | null; strength: number }> {
  const existing = await prisma.userWord.findFirst({ where: { id, userId } })
  if (!existing) throw new UserWordNotFoundError()

  const result = await applyUserWordSm2(userId, id, direction === 'right')
  if (!result) throw new UserWordNotFoundError()

  let xpEarned = 0
  if (direction === 'right') {
    xpEarned = await awardPersonalXp(userId, XP_PER_WORD)
  }

  await invalidateFeedCache(userId)
  return { xpEarned, ...result }
}

/**
 * Awards XP for personal-word study with a per-user daily cap. Does NOT feed
 * leagues (anti-gaming). Returns the XP actually granted after the cap.
 */
export async function awardPersonalXp(userId: string, amount: number): Promise<number> {
  let usedToday = 0
  try {
    usedToday = parseInt((await redis.get(XP_KEY(userId))) ?? '0') || 0
  } catch {
    // If Redis is down, fall back to granting without a hard cap guarantee.
  }

  const remaining = MYWORDS_DAILY_XP_CAP - usedToday
  if (remaining <= 0) return 0

  const grant = Math.min(amount, remaining)
  if (grant <= 0) return 0

  await prisma.user.update({ where: { id: userId }, data: { xp: { increment: grant } } })

  try {
    await redis.incrby(XP_KEY(userId), grant)
    await redis.expire(XP_KEY(userId), 60 * 60 * 48) // 48h TTL
  } catch {
    // Non-fatal.
  }

  return grant
}
