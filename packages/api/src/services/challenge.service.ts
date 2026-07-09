import { prisma } from '../lib/prisma'
import { redis } from '../lib/redis'

export interface ChallengeQuestion {
  wordId: string
  word: string
  pronunciation: string | null
  choices: string[]
  correctIndex: number
}

const QUESTION_COUNT = 5
const CHOICES_COUNT = 4

export async function getTodayChallenge(userId: string): Promise<ChallengeQuestion[]> {
  const today = new Date().toISOString().slice(0, 10)
  const cacheKey = `challenge:${userId}:${today}`

  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached)

  const reviewed = await prisma.userWord.findMany({
    where: { userId, reviewCount: { gt: 0 }, status: { not: 'mastered' } },
    orderBy: { lastReviewed: 'desc' },
    take: 30,
  })

  let pool = reviewed as any[]

  if (pool.length < QUESTION_COUNT) {
    const extra = await prisma.userWord.findMany({
      where: {
        userId,
        status: { not: 'mastered' },
        id: { notIn: pool.map((w) => w.id) },
      },
      take: QUESTION_COUNT - pool.length,
    })
    pool = [...pool, ...(extra as any[])]
  }

  const questionWords = pool
    .slice()
    .sort(() => Math.random() - 0.5)
    .slice(0, QUESTION_COUNT)

  const questionWordIds = questionWords.map((w) => w.id)
  const distractorRows = await prisma.userWord.findMany({
    where: { userId, id: { notIn: questionWordIds } },
    select: { translation: true },
    take: 60,
  })
  const distractorPool = (distractorRows as any[])
    .map((d) => d.translation as string)
    .filter(Boolean)
    .sort(() => Math.random() - 0.5)

  const questions: ChallengeQuestion[] = questionWords.map((word: any) => {
    const correct = word.translation as string
    const distractors = distractorPool
      .filter((t) => t !== correct)
      .slice(0, CHOICES_COUNT - 1)
    const choices = [correct, ...distractors].sort(() => Math.random() - 0.5)
    return {
      wordId: word.id,
      word: word.word,
      pronunciation: word.pronunciation,
      choices,
      correctIndex: choices.indexOf(correct),
    }
  })

  const msUntilMidnight = new Date().setHours(24, 0, 0, 0) - Date.now()
  await redis.setex(cacheKey, Math.floor(msUntilMidnight / 1000), JSON.stringify(questions))

  return questions
}
