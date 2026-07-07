import { api } from './client'

// "Yodlash muhiti" — the multi-method memorize environment for personal words.
// `mixed` is resolved server-side into a concrete method per word; every
// StudyQuestion that reaches the client already carries a single, real mode.
export type StudyMode =
  | 'flashcard'
  | 'mcq'
  | 'reverse'
  | 'typing'
  | 'listening'
  | 'scramble'
  | 'cloze'
  | 'matching'
  | 'mixed'

export type SingleStudyMode = Exclude<StudyMode, 'mixed'>

export interface StudyQuestion {
  id: string // userWord id — echoed back in submit answers
  mode: SingleStudyMode
  word: string
  translation: string
  pronunciation: string | null
  audioUrl: string | null
  /** What to display: word / translation / cloze sentence / '' for pure-audio */
  prompt: string
  /** flashcard/listening: the word to speak via TTS when audioUrl is absent */
  ttsWord?: string
  /** mcq/reverse/listening/cloze: 4 options */
  choices?: string[]
  correctIndex?: number
  /** typing/scramble: expected answer, compared case-insensitively */
  answer?: string
  /** scramble: the word's letters, shuffled */
  scrambled?: string
}

export interface StudyAnswer {
  id: string
  correct: boolean
}

export interface StudyResult {
  xpEarned: number
  correct: number
  total: number
}

export const myWordsStudyApi = {
  // Returns [] when the user has no non-mastered personal words → empty state.
  getQuestions: (mode: StudyMode, count?: number): Promise<StudyQuestion[]> =>
    api
      .get('/api/my-words/study/questions', { params: { mode, ...(count ? { count } : {}) } })
      .then((r) => r.data.data as StudyQuestion[]),

  // Applies graded SM-2 to each personal word and awards capped XP.
  submit: (answers: StudyAnswer[]): Promise<StudyResult> =>
    api.post('/api/my-words/study/submit', { answers }).then((r) => r.data.data as StudyResult),
}
