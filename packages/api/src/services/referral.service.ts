import { prisma } from '../lib/prisma'
import { grantBonusWords } from './feed.service'
import {
  REFERRAL_PREFIX,
  REFERRAL_REFERRER_XP,
  REFERRAL_NEW_USER_XP,
  REFERRAL_BONUS_WORDS,
} from '@wordswipe/shared'

/** Parses a referral start_param like "ref_<userId>" into the referrer's user id. */
export function parseReferralId(startParam: string | null | undefined): string | null {
  if (!startParam || !startParam.startsWith(REFERRAL_PREFIX)) return null
  const id = startParam.slice(REFERRAL_PREFIX.length).trim()
  return id || null
}

/**
 * Resolves a referral start_param to a valid referrer id.
 * Returns null for missing/invalid params, unknown referrers, or self-referral.
 */
export async function resolveReferrer(
  startParam: string | null | undefined,
  newUserTelegramId: bigint,
): Promise<string | null> {
  const refId = parseReferralId(startParam)
  if (!refId) return null

  const referrer = await prisma.user.findUnique({
    where: { id: refId },
    select: { id: true, telegramId: true },
  })
  if (!referrer) return null
  if (referrer.telegramId === newUserTelegramId) return null // can't refer yourself

  return referrer.id
}

/** Grants XP + bonus swipe words to both the referrer and the new user. */
export async function grantReferralRewards(referrerId: string, newUserId: string) {
  await prisma.$transaction([
    prisma.user.update({ where: { id: referrerId }, data: { xp: { increment: REFERRAL_REFERRER_XP } } }),
    prisma.user.update({ where: { id: newUserId }, data: { xp: { increment: REFERRAL_NEW_USER_XP } } }),
  ])
  await Promise.all([
    grantBonusWords(referrerId, REFERRAL_BONUS_WORDS),
    grantBonusWords(newUserId, REFERRAL_BONUS_WORDS),
  ])
}
