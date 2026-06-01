import { prisma } from '../lib/prisma'
import { redis } from '../lib/redis'

export interface ChallengeQuestion {
  wordId: string
  word: string
  pronunciation: string | null
  choices: string[]       // 4 Uzbek translations, shuffled
  correctIndex: number    // index of correct choice in choices[]
}

const QUESTION_COUNT = 5
const CHOICES_COUNT = 4

export async function getTodayChallenge(userId: string): Promise<ChallengeQuestion[]> {
  const today = new Date().toISOString().slice(0, 10)
  const cacheKey = `challenge:${userId}:${today}`

  // Return cached if exists
  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached)

  // 1. Get user's recently seen words (with translations)
  const progress = await prisma.userWordProgress.findMany({
    where: { userId, reviewCount: { gt: 0 } },
    include: { word: { include: { translations: { take: 1 } } } },
    orderBy: { lastReviewed: 'desc' },
    take: 30,
  })

  let pool = (progress as any[])
    .map((p: any) => p.word)
    .filter((w: any) => w.translations[0]?.translation)

  // 2. Supplement with random words for new users
  if (pool.length < QUESTION_COUNT) {
    const extra = await prisma.word.findMany({
      where: {
        id: { notIn: pool.map((w: any) => w.id) },
        translations: { some: { translation: { not: null } } },
      },
      include: { translations: { take: 1 } },
      take: QUESTION_COUNT - pool.length,
    })
    pool = [...pool, ...(extra as any[]).filter((w: any) => w.translations[0]?.translation)]
  }

  // 3. Shuffle and pick QUESTION_COUNT words
  const questionWords = pool
    .slice()
    .sort(() => Math.random() - 0.5)
    .slice(0, QUESTION_COUNT)

  // 4. Get distractors pool (translations NOT from question words)
  const questionWordIds = questionWords.map((w: any) => w.id)
  const distractorRows = await prisma.wordTranslation.findMany({
    where: { wordId: { notIn: questionWordIds }, translation: { not: null } },
    select: { translation: true },
    take: 60,
  })
  const distractorPool = distractorRows
    .map((d: any) => d.translation as string)
    .sort(() => Math.random() - 0.5)

  // 5. Build questions
  const questions: ChallengeQuestion[] = questionWords.map((word: any) => {
    const correct = word.translations[0].translation as string
    const distractors = distractorPool
      .filter((t: any) => t !== correct)
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

  // 6. Cache until midnight
  const msUntilMidnight = new Date().setHours(24, 0, 0, 0) - Date.now()
  await redis.setex(cacheKey, Math.floor(msUntilMidnight / 1000), JSON.stringify(questions))

  return questions
}
