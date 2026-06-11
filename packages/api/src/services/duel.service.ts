import { prisma } from '../lib/prisma'
import { config } from '../config'
import { addLeagueXp } from './league.service'
import { mutualFollow } from './follow.service'
import {
  DUEL_PREFIX,
  DUEL_QUESTION_COUNT,
  DUEL_WINNER_XP,
  DUEL_LOSER_XP,
  DUEL_DRAW_XP,
  DUEL_EXPIRE_HOURS,
} from '@wordswipe/shared'
import type { Language } from '@wordswipe/shared'

const CHOICES_COUNT = 4

export interface DuelQuestion {
  wordId: string
  word: string
  pronunciation: string | null
  choices: string[]
  correctIndex: number
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Both players answer the same questions, so generation is user-independent. */
async function generateQuestions(language: Language): Promise<DuelQuestion[]> {
  const words = await prisma.word.findMany({
    where: { translations: { some: { language, translation: { not: null } } } },
    include: { translations: { where: { language } } },
    take: 60,
  })
  const valid = (words as any[]).filter((w) => w.translations[0]?.translation)
  const selected = shuffle(valid).slice(0, DUEL_QUESTION_COUNT)
  const distractorPool = valid.map((w) => w.translations[0].translation as string)

  return selected.map((w) => {
    const correct = w.translations[0].translation as string
    const distractors = shuffle(distractorPool.filter((t) => t !== correct)).slice(0, CHOICES_COUNT - 1)
    const choices = shuffle([correct, ...distractors])
    return {
      wordId: w.id,
      word: w.word,
      pronunciation: w.pronunciation,
      choices,
      correctIndex: choices.indexOf(correct),
    }
  })
}

const userSelect = { id: true, firstName: true, lastName: true, username: true, avatarUrl: true } as const

function serialize(duel: any, userId: string) {
  const isChallenger = duel.challengerId === userId
  return {
    id: duel.id,
    status: duel.status,
    isChallenger,
    challenger: duel.challenger,
    opponent: duel.opponent,
    questions: duel.questions,
    myScore: isChallenger ? duel.challengerScore : duel.opponentScore,
    theirScore: isChallenger ? duel.opponentScore : duel.challengerScore,
    challengerScore: duel.challengerScore,
    opponentScore: duel.opponentScore,
    winnerId: duel.winnerId,
    createdAt: duel.createdAt,
    completedAt: duel.completedAt,
  }
}

export async function createDuel(challengerId: string, language: Language) {
  const questions = await generateQuestions(language)
  if (questions.length < DUEL_QUESTION_COUNT) {
    throw new Error('Not enough words to create a duel')
  }

  const duel = await prisma.duel.create({
    data: { challengerId, questions: questions as any },
    include: { challenger: { select: userSelect }, opponent: { select: userSelect } },
  })

  const link = config.telegram.webAppUrl
    ? `${config.telegram.webAppUrl}?startapp=${DUEL_PREFIX}${duel.id}`
    : null

  return { ...serialize(duel, challengerId), link, startParam: `${DUEL_PREFIX}${duel.id}` }
}

export async function getDuel(id: string, userId: string) {
  const duel = await prisma.duel.findUnique({
    where: { id },
    include: { challenger: { select: userSelect }, opponent: { select: userSelect } },
  })
  if (!duel) return null
  await expireIfStale(duel)
  return serialize(duel, userId)
}

export async function joinDuel(id: string, userId: string) {
  const duel = await prisma.duel.findUnique({ where: { id } })
  if (!duel) throw new Error('Duel not found')
  if (duel.challengerId === userId) throw new Error('Cannot join your own duel')
  if (duel.opponentId && duel.opponentId !== userId) throw new Error('Duel already has an opponent')
  if (duel.status === 'expired' || duel.status === 'completed') throw new Error('Duel is no longer active')

  const updated = await prisma.duel.update({
    where: { id },
    data: { opponentId: userId, status: 'active' },
    include: { challenger: { select: userSelect }, opponent: { select: userSelect } },
  })
  // Dueling makes you friends — both appear on each other's friends leaderboard
  await mutualFollow(duel.challengerId, userId)
  return serialize(updated, userId)
}

export async function submitDuel(id: string, userId: string, score: number, timeMs: number) {
  const duel = await prisma.duel.findUnique({ where: { id } })
  if (!duel) throw new Error('Duel not found')

  const isChallenger = duel.challengerId === userId
  const isOpponent = duel.opponentId === userId
  if (!isChallenger && !isOpponent) throw new Error('Not a participant of this duel')
  if (isChallenger && duel.challengerScore !== null) throw new Error('Already submitted')
  if (isOpponent && duel.opponentScore !== null) throw new Error('Already submitted')

  const data: any = isChallenger
    ? { challengerScore: score, challengerTime: timeMs }
    : { opponentScore: score, opponentTime: timeMs }

  const merged = { ...duel, ...data }
  const bothDone = merged.challengerScore !== null && merged.opponentScore !== null && merged.opponentId

  if (bothDone) {
    let winnerId: string | null = null
    if (merged.challengerScore > merged.opponentScore) winnerId = merged.challengerId
    else if (merged.opponentScore > merged.challengerScore) winnerId = merged.opponentId
    else if ((merged.challengerTime ?? 0) < (merged.opponentTime ?? 0)) winnerId = merged.challengerId
    else if ((merged.opponentTime ?? 0) < (merged.challengerTime ?? 0)) winnerId = merged.opponentId

    data.status = 'completed'
    data.winnerId = winnerId
    data.completedAt = new Date()
  }

  const updated = await prisma.duel.update({
    where: { id },
    data,
    include: { challenger: { select: userSelect }, opponent: { select: userSelect } },
  })

  if (bothDone) {
    await awardDuelXp(updated)
  }

  return serialize(updated, userId)
}

async function awardDuelXp(duel: any) {
  const participants: Array<{ userId: string; xp: number }> = []
  if (duel.winnerId) {
    const loserId = duel.winnerId === duel.challengerId ? duel.opponentId : duel.challengerId
    participants.push({ userId: duel.winnerId, xp: DUEL_WINNER_XP })
    if (loserId) participants.push({ userId: loserId, xp: DUEL_LOSER_XP })
  } else {
    participants.push({ userId: duel.challengerId, xp: DUEL_DRAW_XP })
    if (duel.opponentId) participants.push({ userId: duel.opponentId, xp: DUEL_DRAW_XP })
  }

  for (const p of participants) {
    await prisma.user.update({ where: { id: p.userId }, data: { xp: { increment: p.xp } } })
    await addLeagueXp(p.userId, p.xp)
  }
}

export async function getMyDuels(userId: string) {
  const duels = await prisma.duel.findMany({
    where: { OR: [{ challengerId: userId }, { opponentId: userId }] },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { challenger: { select: userSelect }, opponent: { select: userSelect } },
  })
  for (const d of duels) await expireIfStale(d)
  return duels.map((d: any) => serialize(d, userId))
}

/** Lazily expires pending duels nobody accepted within DUEL_EXPIRE_HOURS. */
async function expireIfStale(duel: any) {
  if (
    duel.status === 'pending' &&
    Date.now() - new Date(duel.createdAt).getTime() > DUEL_EXPIRE_HOURS * 3600_000
  ) {
    duel.status = 'expired'
    await prisma.duel.update({ where: { id: duel.id }, data: { status: 'expired' } })
  }
}
