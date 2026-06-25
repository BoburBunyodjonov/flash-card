import type { Language, Difficulty, WordStatus, PaymentProvider, PlanType } from '../constants'

export interface JwtPayload {
  userId: string
  telegramId: string
  isAdmin: boolean
}

export interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

export interface TelegramWebAppUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  language_code?: string
}

export interface SwipeResult {
  wordId: string
  direction: 'left' | 'right' | 'up'
}

export interface FeedWord {
  id: string
  word: string
  pronunciation: string | null
  audioUrl: string | null
  imageUrl: string | null
  partOfSpeech: string | null
  difficulty: Difficulty | null
  category: {
    id: string
    name: string
    isPremium: boolean
  }
  translation: {
    translation: string | null
    definitionEn: string | null
    exampleEn: string | null
    exampleTranslated: string | null
  } | null
  progress: {
    status: WordStatus
    strength: number
    reviewCount: number
  } | null
  /** 'personal' = a word the user added themselves (My Words); 'global' = curated catalog. */
  source?: 'global' | 'personal'
}

export interface PaginationQuery {
  page?: number
  limit?: number
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export type { Language, Difficulty, WordStatus, PaymentProvider, PlanType }
