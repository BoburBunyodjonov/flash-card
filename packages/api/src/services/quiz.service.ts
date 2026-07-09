import { calculateNextReview } from '../utils/spaced-repetition'
import { XP_PER_QUIZ_CORRECT, QUIZ_QUESTION_COUNT } from '@wordswipe/shared'
import type { QuizMode } from '@wordswipe/shared'
import {
  getUserWordPool,
  getUserWordDistractors,
  applyUserWordSm2,
  awardPersonalXp,
  invalidateFeedCache,
} from './my-words.service'

export interface QuizQuestion {
  wordId: string
  mode: Exclude<QuizMode, 'mixed'>
  prompt: string
  pronunciation: string | null
  audioUrl: string | null
  ttsWord?: string
  choices?: string[]
  correctIndex?: number
  answer?: string
  word: string
  translation: string
}

const CHOICES_COUNT = 4
const SINGLE_MODES: Exclude<QuizMode, 'mixed'>[] = ['mcq', 'reverse', 'typing', 'listening', 'cloze']

function buildChoices(correct: string, distractors: string[]): { choices: string[]; correctIndex: number } {
  const unique = Array.from(new Set(distractors.filter((d) => d && d !== correct)))
  const choices = shuffle([correct, ...shuffle(unique).slice(0, CHOICES_COUNT - 1)])
  return { choices, correctIndex: choices.indexOf(correct) }
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function makeCloze(sentence: string, word: string): string | null {
  const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w{0,3}\\b`, 'i')
  if (!re.test(sentence)) return null
  return sentence.replace(re, '_____')
}

export async function getQuizQuestions(
  userId: string,
  mode: QuizMode,
  _language: string,
  count = QUIZ_QUESTION_COUNT,
): Promise<QuizQuestion[]> {
  const pool = await getUserWordPool(userId, count)
  if (pool.length === 0) return []

  const dist = await getUserWordDistractors(
    userId,
    pool.map((w) => w.id),
  )

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
        const { choices, correctIndex } = buildChoices(w.translation, dist.translations)
        questions.push({ ...base, mode: 'mcq', prompt: w.word, choices, correctIndex })
        break
      }
      case 'reverse': {
        const { choices, correctIndex } = buildChoices(w.word, dist.words)
        questions.push({ ...base, mode: 'reverse', prompt: w.translation, choices, correctIndex })
        break
      }
      case 'typing':
        questions.push({ ...base, mode: 'typing', prompt: w.translation, answer: w.word })
        break
      case 'listening': {
        const { choices, correctIndex } = buildChoices(w.word, dist.words)
        questions.push({ ...base, mode: 'listening', prompt: '', ttsWord: w.word, choices, correctIndex })
        break
      }
      case 'cloze': {
        const sentence = w.exampleEn ? makeCloze(w.exampleEn, w.word) : null
        if (sentence) {
          const { choices, correctIndex } = buildChoices(w.word, dist.words)
          questions.push({ ...base, mode: 'cloze', prompt: sentence, choices, correctIndex })
        } else {
          const { choices, correctIndex } = buildChoices(w.translation, dist.translations)
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

/** Applies SM-2 to personal words and awards capped XP (no leagues). */
export async function submitQuiz(userId: string, answers: QuizAnswer[]) {
  let correctCount = 0

  for (const a of answers) {
    const updated = await applyUserWordSm2(userId, a.wordId, a.correct)
    if (updated && a.correct) correctCount++
  }

  const xpEarned = correctCount > 0 ? await awardPersonalXp(userId, correctCount * XP_PER_QUIZ_CORRECT) : 0
  await invalidateFeedCache(userId)

  return { xpEarned, correct: correctCount, total: answers.length }
}
