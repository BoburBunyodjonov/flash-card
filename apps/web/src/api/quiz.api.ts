import { api } from './client'

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

export const quizApi = {
  getQuestions: (mode: QuizMode, count?: number) =>
    api
      .get('/api/quiz', { params: { mode, ...(count ? { count } : {}) } })
      .then((r) => r.data.data.questions as QuizQuestion[]),
  submit: (answers: { wordId: string; correct: boolean }[]) =>
    api
      .post('/api/quiz/submit', { answers })
      .then((r) => r.data.data as { xpEarned: number; correct: number; total: number }),
}
