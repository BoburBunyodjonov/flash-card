import { redis } from '../lib/redis'
import { getFreeLimits } from './plan-settings.service'

/** Raised when a free user exceeds an admin-configured daily video/word cap. */
export class MediaLimitError extends Error {
  constructor(public readonly reason: 'video' | 'wordsave') {
    super(reason === 'video' ? 'Daily video limit reached' : 'Daily word-save limit reached')
    this.name = 'MediaLimitError'
  }
}

function todayKey(): string {
  return new Date().toISOString().split('T')[0]
}

const DAY_TTL = 60 * 60 * 26

/**
 * Enforces the free-tier daily distinct-video-open cap. Re-opening a video that
 * was already opened today does NOT consume another slot (tracked as a Redis
 * SET of clip ids). Premium users and a limit of 0 mean unlimited.
 */
export async function assertCanOpenVideo(
  userId: string,
  isPremium: boolean,
  clipId: string,
): Promise<void> {
  if (isPremium) return
  const limits = await getFreeLimits()
  const cap = limits.dailyVideoLimit
  if (!cap || cap <= 0) return

  const key = `media:open:${userId}:${todayKey()}`
  try {
    const isMember = await redis.sismember(key, clipId)
    if (isMember) return
    const count = await redis.scard(key)
    if (count >= cap) throw new MediaLimitError('video')
    await redis.sadd(key, clipId)
    await redis.expire(key, DAY_TTL)
  } catch (err) {
    if (err instanceof MediaLimitError) throw err
    // Redis down → fail open (don't block a paying-adjacent experience on infra).
  }
}

/** Enforces the free-tier daily word-save cap. Premium / limit 0 = unlimited. */
export async function assertCanSaveWord(userId: string, isPremium: boolean): Promise<void> {
  if (isPremium) return
  const limits = await getFreeLimits()
  const cap = limits.dailyWordSaveLimit
  if (!cap || cap <= 0) return

  const key = `media:wordsave:${userId}:${todayKey()}`
  try {
    const count = parseInt((await redis.get(key)) ?? '0', 10) || 0
    if (count >= cap) throw new MediaLimitError('wordsave')
  } catch (err) {
    if (err instanceof MediaLimitError) throw err
  }
}

/** Call after a successful save to increment the daily counter. */
export async function recordWordSave(userId: string, isPremium: boolean): Promise<void> {
  if (isPremium) return
  const key = `media:wordsave:${userId}:${todayKey()}`
  try {
    await redis.incr(key)
    await redis.expire(key, DAY_TTL)
  } catch {
    /* best-effort */
  }
}

/** True when the free user may see context-aware AI glosses (examples). */
export async function canUseAiGloss(isPremium: boolean): Promise<boolean> {
  if (isPremium) return true
  const limits = await getFreeLimits()
  return !!limits.aiGlossEnabled
}

/** True when the user may stream in HD (higher transcode profile). */
export async function canUseHd(isPremium: boolean): Promise<boolean> {
  if (isPremium) return true
  const limits = await getFreeLimits()
  return !!limits.hdEnabled
}
