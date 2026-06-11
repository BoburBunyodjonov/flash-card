import { prisma } from '../lib/prisma'
import { calculateNextReview } from '../utils/spaced-repetition'
import { addLeagueXp } from './league.service'
import { XP_PER_QUIZ_CORRECT, QUIZ_QUESTION_COUNT } from '@wordswipe/shared'
import type { Language, QuizMode } from '@wordswipe/shared'

export interface QuizQuestion {
  wordId: string
  mode: Exclude<QuizMode, 'mixed'>
  /** Word, translation or cloze sentence depending on mode */
  prompt: string
  pronunciation: string | null
  audioUrl: string | null
  /** For listening: the word the client should speak via TTS when no audioUrl */
  ttsWord?: string
  choices?: string[]
  correctIndex?: number
  /** For typing: expected answer (checked client-side, case-insensitive) */
  answer?: string
  word: string
  translation: string
}

interface PoolWord {
  id: string
  word: string
  pronunciation: string | null
  audioUrl: string | null
  translation: string
  exampleEn: string | null
}

const CHOICES_COUNT = 4
const SINGLE_MODES: Exclude<QuizMode, 'mixed'>[] = ['mcq', 'reverse', 'typing', 'listening', 'cloze']

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Words the user should practice: due first, then weakest, topped up with random unseen. */
async function getPracticePool(userId: string, language: Language, count: number): Promise<PoolWord[]> {
  const progress = await prisma.userWordProgress.findMany({
    where: { userId, word: { translations: { some: { language, translation: { not: null } } } } },
    orderBy: [{ nextReview: 'asc' }, { strength: 'asc' }],
    take: count * 2,
    include: { word: { include: { translations: { where: { language } } } } },
  })

  let pool: PoolWord[] = (progress as any[])
    .map((p) => p.word)
    .filter((w) => w.translations[0]?.translation)
    .map((w) => ({
      id: w.id,
      word: w.word,
      pronunciation: w.pronunciation,
      audioUrl: w.audioUrl,
      translation: w.translations[0].translation,
      exampleEn: w.translations[0].exampleEn ?? null,
    }))

  if (pool.length < count) {
    const extra = await prisma.word.findMany({
      where: {
        id: { notIn: pool.map((w) => w.id) },
        translations: { some: { language, translation: { not: null } } },
      },
      take: (count - pool.length) * 2,
      include: { translations: { where: { language } } },
    })
    pool = [
      ...pool,
      ...(extra as any[])
        .filter((w) => w.translations[0]?.translation)
        .map((w) => ({
          id: w.id,
          word: w.word,
          pronunciation: w.pronunciation,
          audioUrl: w.audioUrl,
          translation: w.translations[0].translation,
          exampleEn: w.translations[0].exampleEn ?? null,
        })),
    ]
  }

  return shuffle(pool).slice(0, count)
}

function buildChoices(correct: string, distractors: string[]): { choices: string[]; correctIndex: number } {
  const unique = Array.from(new Set(distractors.filter((d) => d !== correct)))
  const choices = shuffle([correct, ...shuffle(unique).slice(0, CHOICES_COUNT - 1)])
  return { choices, correctIndex: choices.indexOf(correct) }
}

/** Blanks the target word (and simple inflections) out of the example sentence. */
function makeCloze(sentence: string, word: string): string | null {
  const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w{0,3}\\b`, 'i')
  if (!re.test(sentence)) return null
  return sentence.replace(re, '_____')
}

export async function getQuizQuestions(
  userId: string,
  mode: QuizMode,
  language: Language,
  count = QUIZ_QUESTION_COUNT,
): Promise<QuizQuestion[]> {
  const pool = await getPracticePool(userId, language, count)
  if (pool.length === 0) return []

  // Distractor pools drawn from the rest of the vocabulary
  const otherWords = await prisma.word.findMany({
    where: { id: { notIn: pool.map((w) => w.id) } },
    select: { word: true, translations: { where: { language }, select: { translation: true } } },
    take: 80,
  })
  const wordDistractors = (otherWords as any[]).map((w) => w.word)
  const translationDistractors = (otherWords as any[])
    .map((w) => w.translations[0]?.translation)
    .filter(Boolean) as string[]

  const questions: QuizQuestion[] = []

  for (const w of pool) {
    const qMode: Exclude<QuizMode, 'mixed'> =
      mode === 'mixed' ? SINGLE_MODES[Math.floor(Math.random() * SINGLE_MODES.length)] : (mode as any)

    const base = {
      wordId: w.id,
      pronunciation: w.pronunciation,
      audioUrl: w.audioUrl,
      word: w.word,
      translation: w.translation,
    }

    switch (qMode) {
      case 'mcq': {
        const { choices, correctIndex } = buildChoices(w.translation, translationDistractors)
        questions.push({ ...base, mode: 'mcq', prompt: w.word, choices, correctIndex })
        break
      }
      case 'reverse': {
        const { choices, correctIndex } = buildChoices(w.word, wordDistractors)
        questions.push({ ...base, mode: 'reverse', prompt: w.translation, choices, correctIndex })
        break
      }
      case 'typing': {
        questions.push({ ...base, mode: 'typing', prompt: w.translation, answer: w.word })
        break
      }
      case 'listening': {
        const { choices, correctIndex } = buildChoices(w.word, wordDistractors)
        questions.push({ ...base, mode: 'listening', prompt: '', ttsWord: w.word, choices, correctIndex })
        break
      }
      case 'cloze': {
        const sentence = w.exampleEn ? makeCloze(w.exampleEn, w.word) : null
        if (sentence) {
          const { choices, correctIndex } = buildChoices(w.word, wordDistractors)
          questions.push({ ...base, mode: 'cloze', prompt: sentence, choices, correctIndex })
        } else {
          // No usable example sentence — fall back to MCQ so the word still gets practiced
          const { choices, correctIndex } = buildChoices(w.translation, translationDistractors)
          questions.push({ ...base, mode: 'mcq', prompt: w.word, choices, correctIndex })
        }
        break
      }
    }
  }

  return questions
}

export interface QuizAnswer {
  wordId: string
  correct: boolean
}

/** Applies SM-2 to every answered word and awards XP for correct answers. */
export async function submitQuiz(userId: string, answers: QuizAnswer[]) {
  let correctCount = 0

  for (const a of answers) {
    const existing = await prisma.userWordProgress.findUnique({
      where: { userId_wordId: { userId, wordId: a.wordId } },
    })
    const { strength, nextReview, reviewCount, status } = calculateNextReview(
      a.correct ? 'right' : 'left',
      existing?.strength ?? 0,
      existing?.reviewCount ?? 0,
    )
    await prisma.userWordProgress.upsert({
      where: { userId_wordId: { userId, wordId: a.wordId } },
      update: { strength, nextReview, reviewCount, status, lastReviewed: new Date() },
      create: { userId, wordId: a.wordId, strength, nextReview, reviewCount, status, lastReviewed: new Date() },
    })
    if (a.correct) correctCount++
  }

  const xpEarned = correctCount * XP_PER_QUIZ_CORRECT
  if (xpEarned > 0) {
    await prisma.user.update({ where: { id: userId }, data: { xp: { increment: xpEarned } } })
    await addLeagueXp(userId, xpEarned)
  }

  return { xpEarned, correct: correctCount, total: answers.length }
}
