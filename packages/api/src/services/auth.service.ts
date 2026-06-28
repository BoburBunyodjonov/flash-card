import { prisma } from '../lib/prisma'
import {
  validateTelegramAuth,
  validateWebAppInitData,
  parseWebAppUser,
  parseStartParam,
  getInitDataDebug,
} from '../utils/telegram'
import { resolveReferrer, grantReferralRewards } from './referral.service'
import { REFERRAL_NEW_USER_XP, REFERRAL_BONUS_WORDS } from '@wordswipe/shared'
import { config } from '../config'
import type { FastifyInstance } from 'fastify'

interface TelegramAuthData {
  id: string
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: string
  hash: string
}

export async function loginWithTelegramWidget(
  data: TelegramAuthData,
  fastify: FastifyInstance,
) {
  if (!validateTelegramAuth(data as unknown as Record<string, string>, config.telegram.botToken)) {
    throw new Error('Invalid Telegram auth data')
  }

  const authDate = parseInt(data.auth_date)
  const fiveMinutes = 5 * 60
  if (Date.now() / 1000 - authDate > fiveMinutes) {
    throw new Error('Auth data expired')
  }

  return upsertUser(
    {
      telegramId: BigInt(data.id),
      firstName: data.first_name,
      lastName: data.last_name,
      username: data.username,
      avatarUrl: data.photo_url,
    },
    fastify,
  )
}

export async function loginWithWebApp(initData: string, fastify: FastifyInstance) {
  const botToken = config.telegram.botToken.trim()
  if (!(await validateWebAppInitData(initData, botToken))) {
    if (config.isDev) {
      console.warn('[auth/webapp] validation failed', getInitDataDebug(initData))
    }
    const err = new Error('Invalid Telegram Web App init data') as Error & { statusCode?: number }
    err.statusCode = 401
    throw err
  }

  const telegramUser = parseWebAppUser(initData)
  if (!telegramUser) throw new Error('User data missing from initData')

  return upsertUser(
    {
      telegramId: BigInt(telegramUser.id),
      firstName: telegramUser.first_name,
      lastName: telegramUser.last_name,
      username: telegramUser.username,
      avatarUrl: telegramUser.photo_url,
    },
    fastify,
    parseStartParam(initData),
  )
}

async function upsertUser(
  data: {
    telegramId: bigint
    firstName: string
    lastName?: string
    username?: string
    avatarUrl?: string
  },
  fastify: FastifyInstance,
  startParam?: string | null,
) {
  const existing = await prisma.user.findUnique({
    where: { telegramId: data.telegramId },
    select: { id: true },
  })

  let user
  let referralBonus: { xp: number; bonusWords: number } | null = null
  if (existing) {
    user = await prisma.user.update({
      where: { telegramId: data.telegramId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName ?? null,
        username: data.username ?? null,
        avatarUrl: data.avatarUrl ?? null,
        lastActive: new Date(),
      },
    })
  } else {
    // New user — attribute the referral (if any) atomically at creation.
    const referredById = await resolveReferrer(startParam, data.telegramId)
    user = await prisma.user.create({
      data: {
        telegramId: data.telegramId,
        firstName: data.firstName,
        lastName: data.lastName ?? null,
        username: data.username ?? null,
        avatarUrl: data.avatarUrl ?? null,
        referredById,
      },
    })

    if (referredById) {
      // Rewards are best-effort — a failure here must not block login.
      try {
        await grantReferralRewards(referredById, user.id)
        referralBonus = { xp: REFERRAL_NEW_USER_XP, bonusWords: REFERRAL_BONUS_WORDS }
      } catch (err) {
        fastify.log.error({ msg: 'referral reward failed', error: (err as Error).message })
      }
    }
  }

  return buildAuthResult(fastify, user, referralBonus)
}

// ---------------------------------------------------------------------------
// Shared token + safe-user builder (used by all login flows)
// ---------------------------------------------------------------------------
type UserRow = Awaited<ReturnType<typeof prisma.user.create>>

function buildAuthResult(
  fastify: FastifyInstance,
  user: UserRow,
  referralBonus: { xp: number; bonusWords: number } | null = null,
) {
  const payload = {
    userId: user.id,
    telegramId: user.telegramId?.toString() ?? null,
    isAdmin: user.isAdmin,
    isPremium: user.isPremium,
    premiumUntil: user.premiumUntil?.toISOString(),
  }
  const accessToken = fastify.jwt.sign(payload, { expiresIn: config.jwt.expiresIn })
  const refreshToken = fastify.jwt.sign({ userId: user.id }, { expiresIn: config.jwt.refreshExpiresIn })

  const safeUser = {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    avatarUrl: user.avatarUrl,
    phone: user.phone,
    language: user.language,
    isPremium: user.isPremium,
    premiumUntil: user.premiumUntil?.toISOString() ?? null,
    isAdmin: user.isAdmin,
    streak: user.streak,
    xp: user.xp + (referralBonus?.xp ?? 0),
    cefrLevel: user.cefrLevel,
    gender: user.gender,
    notifyAt: user.notifyAt,
    notifyEnabled: user.notifyEnabled,
    telegramId: user.telegramId?.toString() ?? null,
  }
  return { user: safeUser, accessToken, refreshToken, referralBonus: referralBonus ?? null }
}

// ---------------------------------------------------------------------------
// Phone + password auth (native app, no Telegram)
// ---------------------------------------------------------------------------

/** Normalizes an Uzbek phone to canonical `+998XXXXXXXXX`. Returns null if invalid. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, '')
  // Accept "998XXXXXXXXX" (12 digits) or local "XXXXXXXXX" (9 digits)
  if (/^998\d{9}$/.test(digits)) return `+${digits}`
  if (/^\d{9}$/.test(digits)) return `+998${digits}`
  return null
}

class AuthError extends Error {
  statusCode: number
  constructor(message: string, statusCode = 400) {
    super(message)
    this.statusCode = statusCode
  }
}
export { AuthError }

export async function registerWithPhone(
  data: { phone: string; password: string; firstName: string },
  fastify: FastifyInstance,
) {
  const phone = normalizePhone(data.phone)
  if (!phone) throw new AuthError('Invalid phone number')

  const existing = await prisma.user.findUnique({ where: { phone }, select: { id: true } })
  if (existing) throw new AuthError('Phone already registered', 409)

  const { hash } = await import('bcryptjs')
  const passwordHash = await hash(data.password, 10)

  const user = await prisma.user.create({
    data: { phone, passwordHash, firstName: data.firstName.trim() },
  })
  return buildAuthResult(fastify, user)
}

/**
 * Sets (or updates) a phone + password on the CURRENT account — used by existing
 * Telegram users so they can also log into the native app with phone+password
 * against their SAME account (data preserved).
 */
export async function setUserCredentials(userId: string, rawPhone: string, password: string) {
  const phone = normalizePhone(rawPhone)
  if (!phone) throw new AuthError('Invalid phone number')

  const owner = await prisma.user.findUnique({ where: { phone }, select: { id: true } })
  if (owner && owner.id !== userId) throw new AuthError('Phone already in use', 409)

  const { hash } = await import('bcryptjs')
  const passwordHash = await hash(password, 10)
  await prisma.user.update({ where: { id: userId }, data: { phone, passwordHash } })
  return { phone }
}

/**
 * Saves a Telegram‑shared (verified) phone onto the user with that telegramId.
 * Best‑effort: silently skips if the user is unknown, the phone is invalid, or
 * the number already belongs to a different account.
 */
export async function linkTelegramPhone(telegramId: bigint, rawPhone: string): Promise<void> {
  const phone = normalizePhone(rawPhone)
  if (!phone) return
  const user = await prisma.user.findUnique({ where: { telegramId }, select: { id: true } })
  if (!user) return
  const owner = await prisma.user.findUnique({ where: { phone }, select: { id: true } })
  if (owner && owner.id !== user.id) return
  await prisma.user.update({ where: { id: user.id }, data: { phone } })
}

export async function loginWithPhone(
  data: { phone: string; password: string },
  fastify: FastifyInstance,
) {
  const phone = normalizePhone(data.phone)
  if (!phone) throw new AuthError('Invalid phone number', 401)

  const user = await prisma.user.findUnique({ where: { phone } })
  if (!user || !user.passwordHash) throw new AuthError('Invalid phone or password', 401)

  const { compare } = await import('bcryptjs')
  const ok = await compare(data.password, user.passwordHash)
  if (!ok) throw new AuthError('Invalid phone or password', 401)

  await prisma.user.update({ where: { id: user.id }, data: { lastActive: new Date() } })
  return buildAuthResult(fastify, user)
}
