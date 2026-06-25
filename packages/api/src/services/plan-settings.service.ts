import { prisma } from '../lib/prisma'
import { redis } from '../lib/redis'
import { DEFAULT_PLAN_SETTINGS } from '@wordswipe/shared'

const CACHE_KEY = 'plan_settings'
const CACHE_TTL = 60 // 1 minute

export async function getAllSettings(): Promise<Record<string, number | boolean>> {
  const cached = await redis.get(CACHE_KEY)
  if (cached) return JSON.parse(cached)

  const rows = await prisma.planSetting.findMany()
  const settings: Record<string, number | boolean> = { ...DEFAULT_PLAN_SETTINGS }

  for (const row of rows) {
    settings[row.key] = row.value as number | boolean
  }

  await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(settings))
  return settings
}

export async function getSetting<T = number | boolean>(key: string): Promise<T> {
  const settings = await getAllSettings()
  return (settings[key] ?? DEFAULT_PLAN_SETTINGS[key]) as T
}

export async function updateSetting(
  key: string,
  value: number | boolean,
  updatedById: string,
): Promise<void> {
  await prisma.planSetting.upsert({
    where: { key },
    update: { value, updatedById },
    create: { key, value, updatedById },
  })
  await redis.del(CACHE_KEY)
}

export async function getFreeLimits() {
  const settings = await getAllSettings()
  return {
    dailySwipeLimit: settings['free_daily_swipe_limit'] as number,
    maxDecks: settings['free_max_decks'] as number,
    maxWordsPerDeck: settings['free_max_words_per_deck'] as number,
    adFrequency: settings['free_ad_frequency'] as number,
    audioEnabled: settings['free_audio_enabled'] as boolean,
    offlineEnabled: settings['free_offline_enabled'] as boolean,
    friendsLeaderboard: settings['free_friends_leaderboard_enabled'] as boolean,
  }
}

export async function getPremiumPrices() {
  const settings = await getAllSettings()
  return {
    monthly: { uzs: settings['premium_monthly_price_uzs'], usd: settings['premium_monthly_price_usd'] },
    annual: { uzs: settings['premium_annual_price_uzs'], usd: settings['premium_annual_price_usd'] },
    lifetime: { uzs: settings['premium_lifetime_price_uzs'], usd: settings['premium_lifetime_price_usd'] },
    // Telegram Stars (XTR) — used by the in-app Stars purchase flow
    stars: {
      monthly: settings['premium_monthly_price_stars'] as number,
      yearly: settings['premium_annual_price_stars'] as number,
    },
    discountPercent: settings['premium_discount_percent'],
    trialDays: settings['premium_trial_days'],
  }
}
