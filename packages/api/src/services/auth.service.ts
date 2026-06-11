import { prisma } from '../lib/prisma'
import {
  validateTelegramAuth,
  validateWebAppInitData,
  parseWebAppUser,
  parseStartParam,
  getInitDataDebug,
} from '../utils/telegram'
import { resolveReferrer, grantReferralRewards } from './referral.service'
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
      await grantReferralRewards(referredById, user.id).catch((err) =>
        fastify.log.error({ msg: 'referral reward failed', error: (err as Error).message }),
      )
    }
  }

  const payload = {
    userId: user.id,
    telegramId: user.telegramId.toString(),
    isAdmin: user.isAdmin,
    isPremium: user.isPremium,
    premiumUntil: user.premiumUntil?.toISOString(),
  }

  const accessToken = fastify.jwt.sign(payload, { expiresIn: config.jwt.expiresIn })
  const refreshToken = fastify.jwt.sign(
    { userId: user.id },
    { expiresIn: config.jwt.refreshExpiresIn },
  )

  const safeUser = {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    avatarUrl: user.avatarUrl,
    language: user.language,
    isPremium: user.isPremium,
    premiumUntil: user.premiumUntil?.toISOString() ?? null,
    isAdmin: user.isAdmin,
    streak: user.streak,
    xp: user.xp,
    notifyAt: user.notifyAt,
    notifyEnabled: user.notifyEnabled,
    telegramId: user.telegramId.toString(),
  }

  return { user: safeUser, accessToken, refreshToken }
}
