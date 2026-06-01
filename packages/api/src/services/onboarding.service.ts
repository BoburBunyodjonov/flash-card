import { prisma } from '../lib/prisma'

export interface TestQuestion {
  wordId: string
  word: string
  pronunciation: string | null
  difficulty: string
  choices: string[]
  correctIndex: number
}

export async function getLevelTest(): Promise<TestQuestion[]> {
  const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const
  const questions: TestQuestion[] = []

  // Get distractor pool once (30 random translations)
  const distractorRows = await prisma.wordTranslation.findMany({
    where: { translation: { not: null } },
    select: { translation: true, wordId: true },
    take: 60,
  })
  const allDistractors = distractorRows
    .map((d: { translation: string | null; wordId: string }) => d.translation as string)
    .sort(() => Math.random() - 0.5)

  for (const level of LEVELS) {
    const words = await prisma.word.findMany({
      where: {
        difficulty: level,
        translations: { some: { translation: { not: null } } },
      },
      include: { translations: { take: 1 } },
      take: 20,
    })

    const valid = (words as any[]).filter((w: any) => w.translations[0]?.translation)
    const selected = valid.sort(() => Math.random() - 0.5).slice(0, 2)

    for (const word of selected) {
      const correct = word.translations[0].translation as string
      const distractors = allDistractors
        .filter((t: string) => t !== correct)
        .slice(0, 3)

      if (distractors.length < 3) continue

      const choices = [correct, ...distractors].sort(() => Math.random() - 0.5)
      questions.push({
        wordId: word.id,
        word: word.word,
        pronunciation: word.pronunciation,
        difficulty: level,
        choices,
        correctIndex: choices.indexOf(correct),
      })
    }
  }

  return questions.sort(() => Math.random() - 0.5)
}
