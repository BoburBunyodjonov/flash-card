import { prisma } from '../lib/prisma'
import {
  validateTelegramAuth,
  validateWebAppInitData,
  parseWebAppUser,
  getInitDataDebug,
} from '../utils/telegram'
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
) {
  const user = await prisma.user.upsert({
    where: { telegramId: data.telegramId },
    update: {
      firstName: data.firstName,
      lastName: data.lastName ?? null,
      username: data.username ?? null,
      avatarUrl: data.avatarUrl ?? null,
      lastActive: new Date(),
    },
    create: {
      telegramId: data.telegramId,
      firstName: data.firstName,
      lastName: data.lastName ?? null,
      username: data.username ?? null,
      avatarUrl: data.avatarUrl ?? null,
    },
  })

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
    telegramId: user.telegramId.toString(),
  }

  return { user: safeUser, accessToken, refreshToken }
}
