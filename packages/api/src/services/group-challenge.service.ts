import { prisma } from '../lib/prisma'
import { config } from '../config'
import { generateQuestions } from './duel.service'
import { addLeagueXp } from './league.service'
import { mutualFollow } from './follow.service'
import {
  GC_PREFIX,
  GC_QUESTION_COUNT,
  GC_EXPIRE_HOURS,
  GC_BASE_XP,
  GC_PERFECT_BONUS_XP,
} from '@wordswipe/shared'
import type { Language } from '@wordswipe/shared'

const userSelect = { id: true, firstName: true, lastName: true, username: true, avatarUrl: true } as const

function deepLink(id: string): string | null {
  const param = `${GC_PREFIX}${id}`
  if (config.telegram.botUsername) return `https://t.me/${config.telegram.botUsername}?start=${param}`
  if (config.telegram.webAppUrl) return `${config.telegram.webAppUrl}?startapp=${param}`
  return null
}

function serialize(gc: any, userId: string) {
  const entries = (gc.entries ?? [])
    .slice()
    // Rank: highest score first, fastest time breaks ties; unfinished entries last.
    .sort((a: any, b: any) => {
      const aDone = a.completedAt ? 1 : 0
      const bDone = b.completedAt ? 1 : 0
      if (aDone !== bDone) return bDone - aDone
      if (b.score !== a.score) return b.score - a.score
      return a.timeMs - b.timeMs
    })

  const leaderboard = entries.map((e: any, i: number) => ({
    rank: i + 1,
    user: e.user,
    score: e.score,
    timeMs: e.timeMs,
    completed: Boolean(e.completedAt),
    isMe: e.userId === userId,
  }))

  const mine = entries.find((e: any) => e.userId === userId) ?? null
  const expired = new Date(gc.expiresAt).getTime() < Date.now()

  return {
    id: gc.id,
    creator: gc.creator,
    questions: gc.questions,
    questionCount: Array.isArray(gc.questions) ? gc.questions.length : GC_QUESTION_COUNT,
    expiresAt: gc.expiresAt,
    createdAt: gc.createdAt,
    expired,
    joined: Boolean(mine),
    submitted: Boolean(mine?.completedAt),
    myScore: mine?.completedAt ? mine.score : null,
    playerCount: entries.length,
    leaderboard,
  }
}

const includeAll = {
  creator: { select: userSelect },
  entries: { include: { user: { select: userSelect } } },
}

export async function createGroupChallenge(creatorId: string, language: Language) {
  const questions = await generateQuestions(language, GC_QUESTION_COUNT, creatorId)
  if (questions.length < GC_QUESTION_COUNT) {
    throw new Error('Add at least 7 words to My Words before creating a group challenge')
  }

  const gc = await prisma.groupChallenge.create({
    data: {
      creatorId,
      questions: questions.slice(0, GC_QUESTION_COUNT) as any,
      expiresAt: new Date(Date.now() + GC_EXPIRE_HOURS * 3600_000),
      // The creator is automatically a participant (not yet scored).
      entries: { create: { userId: creatorId } },
    },
    include: includeAll,
  })

  return { ...serialize(gc, creatorId), link: deepLink(gc.id), startParam: `${GC_PREFIX}${gc.id}` }
}

export async function getGroupChallenge(id: string, userId: string) {
  const gc = await prisma.groupChallenge.findUnique({ where: { id }, include: includeAll })
  if (!gc) return null
  return { ...serialize(gc, userId), link: deepLink(gc.id), startParam: `${GC_PREFIX}${gc.id}` }
}

export async function joinGroupChallenge(id: string, userId: string) {
  const gc = await prisma.groupChallenge.findUnique({ where: { id }, select: { id: true, creatorId: true, expiresAt: true } })
  if (!gc) throw new Error('Challenge not found')
  if (new Date(gc.expiresAt).getTime() < Date.now()) throw new Error('Challenge has expired')

  await prisma.groupChallengeEntry.upsert({
    where: { challengeId_userId: { challengeId: id, userId } },
    update: {},
    create: { challengeId: id, userId },
  })

  // Playing together makes you friends — surface each other on the friends board.
  if (gc.creatorId !== userId) await mutualFollow(gc.creatorId, userId)

  return getGroupChallenge(id, userId)
}

export async function submitGroupChallenge(id: string, userId: string, score: number, timeMs: number) {
  const gc = await prisma.groupChallenge.findUnique({ where: { id }, include: includeAll })
  if (!gc) throw new Error('Challenge not found')
  if (new Date(gc.expiresAt).getTime() < Date.now()) throw new Error('Challenge has expired')

  const entry = gc.entries.find((e: any) => e.userId === userId)
  if (entry?.completedAt) throw new Error('Already submitted')

  const total = Array.isArray(gc.questions) ? gc.questions.length : GC_QUESTION_COUNT
  const cappedScore = Math.max(0, Math.min(score, total))

  await prisma.groupChallengeEntry.upsert({
    where: { challengeId_userId: { challengeId: id, userId } },
    update: { score: cappedScore, timeMs, completedAt: new Date() },
    create: { challengeId: id, userId, score: cappedScore, timeMs, completedAt: new Date() },
  })

  // Self-contained reward: flat participation XP + a bonus for a perfect run.
  const xp = GC_BASE_XP + (cappedScore === total ? GC_PERFECT_BONUS_XP : 0)
  await prisma.user.update({ where: { id: userId }, data: { xp: { increment: xp } } })
  await addLeagueXp(userId, xp)

  const result = await getGroupChallenge(id, userId)
  return { ...result, xpEarned: xp }
}

export async function getMyGroupChallenges(userId: string) {
  const rows = await prisma.groupChallenge.findMany({
    where: { entries: { some: { userId } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: includeAll,
  })
  return rows.map((gc) => serialize(gc, userId))
}
