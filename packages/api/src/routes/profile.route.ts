import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../middlewares/auth.middleware'
import { prisma } from '../lib/prisma'
import { getPremiumPrices, getFreeLimits } from '../services/plan-settings.service'
import { config } from '../config'
import { REFERRAL_PREFIX } from '@wordswipe/shared'
import type { JwtPayload } from '@wordswipe/shared'

export async function profileRoutes(fastify: FastifyInstance) {
  fastify.get('/settings/plan', async (req, reply) => {
    const [prices, limits] = await Promise.all([getPremiumPrices(), getFreeLimits()])
    return reply.send({ success: true, data: { prices, limits } })
  })

  fastify.addHook('onRequest', requireAuth)

  fastify.get('/', async (req, reply) => {
    const user = req.user as JwtPayload
    const row = await prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        avatarUrl: true,
        phone: true,
        passwordHash: true,
        language: true,
        isPremium: true,
        premiumUntil: true,
        streak: true,
        streakFreezes: true,
        xp: true,
        cefrLevel: true,
        gender: true,
        leagueTier: true,
        notifyAt: true,
        notifyEnabled: true,
        createdAt: true,
        _count: { select: { followers: true, following: true } },
      },
    })
    // Never expose the hash; surface only whether a mobile-app password exists
    const data = row && (({ passwordHash, ...rest }) => ({ ...rest, hasPassword: passwordHash != null }))(row)
    return reply.send({ success: true, data })
  })

  fastify.get('/referral', async (req, reply) => {
    const user = req.user as JwtPayload
    const startParam = `${REFERRAL_PREFIX}${user.userId}`
    const [count, referrals] = await Promise.all([
      prisma.user.count({ where: { referredById: user.userId } }),
      prisma.user.findMany({
        where: { referredById: user.userId },
        select: { firstName: true, avatarUrl: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ])
    // Deep link that opens the Mini App with the referral param attached.
    const link = config.telegram.webAppUrl
      ? `${config.telegram.webAppUrl}?startapp=${startParam}`
      : null
    return reply.send({ success: true, data: { startParam, link, count, referrals } })
  })

  fastify.put('/', async (req, reply) => {
    const body = z.object({
      firstName: z.string().min(1).optional(),
      lastName: z.string().optional(),
    }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })

    const user = req.user as JwtPayload
    const updated = await prisma.user.update({
      where: { id: user.userId },
      data: body.data,
    })
    return reply.send({ success: true, data: updated })
  })

  fastify.put('/level', async (req, reply) => {
    const body = z.object({ level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })

    const user = req.user as JwtPayload
    await prisma.user.update({ where: { id: user.userId }, data: { cefrLevel: body.data.level } })
    return reply.send({ success: true })
  })

  fastify.put('/gender', async (req, reply) => {
    const body = z.object({ gender: z.enum(['male', 'female']).nullable() }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })

    const user = req.user as JwtPayload
    await prisma.user.update({ where: { id: user.userId }, data: { gender: body.data.gender } })
    return reply.send({ success: true })
  })

  fastify.put('/language', async (req, reply) => {
    const body = z.object({ language: z.enum(['uz', 'en', 'ru']) }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })

    const user = req.user as JwtPayload
    await prisma.user.update({ where: { id: user.userId }, data: { language: body.data.language } })
    return reply.send({ success: true })
  })

  fastify.put('/notifications', async (req, reply) => {
    const body = z.object({
      notifyAt: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      enabled: z.boolean().optional(),
    }).safeParse(req.body)
    if (!body.success || (body.data.notifyAt === undefined && body.data.enabled === undefined)) {
      return reply.code(400).send({ success: false, error: 'Invalid body' })
    }

    const user = req.user as JwtPayload
    await prisma.user.update({
      where: { id: user.userId },
      data: {
        ...(body.data.notifyAt !== undefined && { notifyAt: body.data.notifyAt }),
        ...(body.data.enabled !== undefined && { notifyEnabled: body.data.enabled }),
      },
    })
    return reply.send({ success: true })
  })
}
