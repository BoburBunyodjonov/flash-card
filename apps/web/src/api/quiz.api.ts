import { api } from './client'
import { XP_PER_QUIZ_CORRECT } from '@wordswipe/shared'
import { registerReplayer, enqueueAction, isNetworkError } from '../lib/offlineQueue'

export type QuizMode = 'mixed' | 'mcq' | 'reverse' | 'typing' | 'listening' | 'cloze'

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

export interface QuizResult {
  xpEarned: number
  correct: number
  total: number
  /** true when the result was queued offline and will sync later */
  offline?: boolean
}

type QuizAnswer = { wordId: string; correct: boolean }

// Replayed when the connection returns — applies SM-2 + awards XP server-side.
registerReplayer('quiz-submit', (answers: QuizAnswer[]) =>
  api.post('/api/quiz/submit', { answers }).then(() => undefined),
)

export const quizApi = {
  getQuestions: (mode: QuizMode, count?: number) =>
    api
      .get('/api/quiz', { params: { mode, ...(count ? { count } : {}) } })
      .then((r) => r.data.data.questions as QuizQuestion[]),

  // On network failure the batch is queued and replayed later; results are
  // shown optimistically so an offline session is never lost.
  submit: async (answers: QuizAnswer[]): Promise<QuizResult> => {
    try {
      const r = await api.post('/api/quiz/submit', { answers })
      return r.data.data as QuizResult
    } catch (err) {
      if (!isNetworkError(err)) throw err
      enqueueAction('quiz-submit', answers)
      const correct = answers.filter((a) => a.correct).length
      return { xpEarned: correct * XP_PER_QUIZ_CORRECT, correct, total: answers.length, offline: true }
    }
  },
}
