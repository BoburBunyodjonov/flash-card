export const LANGUAGES = ['uz', 'en', 'ru'] as const
export type Language = (typeof LANGUAGES)[number]

export const DIFFICULTIES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export const WORD_STATUSES = ['new', 'learning', 'learned', 'mastered'] as const
export type WordStatus = (typeof WORD_STATUSES)[number]

export const PAYMENT_PROVIDERS = ['telegram_stars', 'payme', 'click', 'stripe'] as const
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number]

export const PLAN_TYPES = ['monthly', 'annual', 'lifetime'] as const
export type PlanType = (typeof PLAN_TYPES)[number]

export const PLAN_SETTING_KEYS = {
  FREE_DAILY_SWIPE_LIMIT: 'free_daily_swipe_limit',
  FREE_MAX_DECKS: 'free_max_decks',
  FREE_MAX_WORDS_PER_DECK: 'free_max_words_per_deck',
  FREE_AD_FREQUENCY: 'free_ad_frequency',
  FREE_AUDIO_ENABLED: 'free_audio_enabled',
  FREE_OFFLINE_ENABLED: 'free_offline_enabled',
  FREE_FRIENDS_LEADERBOARD: 'free_friends_leaderboard_enabled',
  PREMIUM_MONTHLY_UZS: 'premium_monthly_price_uzs',
  PREMIUM_MONTHLY_USD: 'premium_monthly_price_usd',
  PREMIUM_ANNUAL_UZS: 'premium_annual_price_uzs',
  PREMIUM_ANNUAL_USD: 'premium_annual_price_usd',
  PREMIUM_LIFETIME_UZS: 'premium_lifetime_price_uzs',
  PREMIUM_LIFETIME_USD: 'premium_lifetime_price_usd',
  PREMIUM_DISCOUNT_PERCENT: 'premium_discount_percent',
  PREMIUM_TRIAL_DAYS: 'premium_trial_days',
  PREMIUM_MONTHLY_STARS: 'premium_monthly_price_stars',
  PREMIUM_ANNUAL_STARS: 'premium_annual_price_stars',
  GLOBAL_FEED_ENABLED: 'global_feed_enabled',
} as const

export const DEFAULT_PLAN_SETTINGS: Record<string, number | boolean> = {
  free_daily_swipe_limit: 20,
  free_max_decks: 1,
  free_max_words_per_deck: 30,
  free_ad_frequency: 10,
  free_audio_enabled: false,
  free_offline_enabled: false,
  free_friends_leaderboard_enabled: false,
  premium_monthly_price_uzs: 35000,
  premium_monthly_price_usd: 2.99,
  premium_annual_price_uzs: 230000,
  premium_annual_price_usd: 19.99,
  premium_lifetime_price_uzs: 499000,
  premium_lifetime_price_usd: 49.99,
  premium_discount_percent: 0,
  premium_trial_days: 0,
  // Telegram Stars (XTR) prices — 1 star ≈ $0.02
  premium_monthly_price_stars: 125, // ≈ $2.50/month
  premium_annual_price_stars: 1000, // ≈ $20/year
  // Curated admin catalog in the swipe feed (off = only user-added words)
  global_feed_enabled: false,
}

// Telegram Stars purchase plans (web → API contract)
export const STARS_PLANS = ['monthly', 'yearly'] as const
export type StarsPlan = (typeof STARS_PLANS)[number]
export const STARS_PLAN_DAYS: Record<StarsPlan, number> = {
  monthly: 30,
  yearly: 365,
}

export const SPACED_REPETITION_INTERVALS = [1, 3, 7, 14, 30, 60]

export const XP_PER_WORD = 10
export const XP_STREAK_MULTIPLIER = 2

// My Words (personal vocabulary)
export const MYWORDS_DAILY_XP_CAP = 100

// Referral rewards
export const REFERRAL_REFERRER_XP = 50
export const REFERRAL_NEW_USER_XP = 25
export const REFERRAL_BONUS_WORDS = 10
export const REFERRAL_PREFIX = 'ref_'

// Quiz
export const QUIZ_MODES = ['mixed', 'mcq', 'reverse', 'typing', 'listening', 'cloze'] as const
export type QuizMode = (typeof QUIZ_MODES)[number]
export const QUIZ_QUESTION_COUNT = 10
export const XP_PER_QUIZ_CORRECT = 5

// Duels
export const DUEL_PREFIX = 'duel_'
export const DUEL_QUESTION_COUNT = 5
export const DUEL_WINNER_XP = 50
export const DUEL_LOSER_XP = 15
export const DUEL_DRAW_XP = 25
export const DUEL_EXPIRE_HOURS = 48

// Group challenges (multiplayer quiz race among friends)
export const GC_PREFIX = 'gc_'
export const GC_QUESTION_COUNT = 7
export const GC_EXPIRE_HOURS = 72
export const GC_BASE_XP = 10 // flat participation reward
export const GC_PERFECT_BONUS_XP = 20 // extra for a perfect run

// Weekly leagues
export const LEAGUE_TIERS = ['Bronze', 'Silver', 'Gold', 'Sapphire', 'Diamond'] as const
export const LEAGUE_GROUP_SIZE = 30
export const LEAGUE_PROMOTE_COUNT = 10
export const LEAGUE_DEMOTE_COUNT = 5

// Smart reminders
export const REVIEW_REMINDER_THRESHOLD = 10

// Speaking practice (1:1 voice calls)
export const XP_PER_SPEAKING_MINUTE = 2
export const SPEAKING_DAILY_XP_CAP = 30

// Shadowing (repeat-after-native-speaker video practice)
export const XP_PER_SHADOWING = 8 // per clip completed (first time), capped daily
export const SHADOWING_DAILY_XP_CAP = 60
export const SHADOWING_PLAYBACK_RATES = [0.5, 0.75, 1] as const
