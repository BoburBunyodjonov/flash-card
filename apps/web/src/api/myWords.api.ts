import { api } from './client'

export type WordStatus = 'new' | 'learning' | 'learned' | 'mastered'

/** A word saved to the user's personal "My Words" list. */
export interface UserWord {
  id: string
  word: string
  translation: string
  pronunciation: string | null
  audioUrl: string | null
  partOfSpeech: string | null
  definitionEn: string | null
  exampleEn: string | null
  synonyms: string[]
  strength: number
  status: WordStatus
  nextReview: string | null
  reviewCount: number
  lastReviewed: string | null
  createdAt: string
  sharedFromUserId: string | null
  sharedFromName: string | null
}

/** Result of an English-word dictionary lookup (auto-fill source). */
export interface WordLookup {
  found: boolean
  word: string
  pronunciation: string | null
  audioUrl: string | null
  partOfSpeech: string | null
  definitionEn: string | null
  exampleEn: string | null
  synonyms: string[]
}

export interface CreateWordInput {
  word: string
  translation: string
  pronunciation?: string | null
  audioUrl?: string | null
  partOfSpeech?: string | null
  definitionEn?: string | null
  exampleEn?: string | null
  synonyms?: string[]
}

export type UpdateWordInput = Partial<CreateWordInput>

export interface ReviewResult {
  xpEarned: number
  status: WordStatus
  nextReview: string | null
  strength: number
}

export const myWordsApi = {
  lookup: (word: string): Promise<WordLookup> =>
    api.get('/api/my-words/lookup', { params: { word } }).then((r) => r.data.data),
  list: (): Promise<{ words: UserWord[]; dueCount: number }> =>
    api.get('/api/my-words').then((r) => r.data.data),
  create: (input: CreateWordInput): Promise<UserWord> =>
    api.post('/api/my-words', input).then((r) => r.data.data),
  update: (id: string, input: UpdateWordInput): Promise<UserWord> =>
    api.put(`/api/my-words/${id}`, input).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/api/my-words/${id}`).then((r) => r.data),
  master: (id: string): Promise<UserWord> =>
    api.post(`/api/my-words/${id}/master`).then((r) => r.data.data),
  relearn: (id: string): Promise<UserWord> =>
    api.post(`/api/my-words/${id}/relearn`).then((r) => r.data.data),
  study: (limit = 20): Promise<{ words: UserWord[] }> =>
    api.get('/api/my-words/study', { params: { limit } }).then((r) => r.data.data),
  review: (id: string, direction: 'left' | 'right'): Promise<ReviewResult> =>
    api.post(`/api/my-words/${id}/review`, { direction }).then((r) => r.data.data),
}

/** Returns true if the failed request was a 409 duplicate conflict. */
export function isConflictError(e: unknown): boolean {
  return (
    !!e &&
    typeof e === 'object' &&
    'response' in e &&
    (e as { response?: { status?: number } }).response?.status === 409
  )
}

/** Extracts the `error` message from a failed API response, if present. */
export function getApiErrorMessage(e: unknown): string | null {
  if (e && typeof e === 'object' && 'response' in e) {
    const data = (e as { response?: { data?: { error?: unknown } } }).response?.data
    if (data && typeof data.error === 'string' && data.error) return data.error
  }
  return null
}
