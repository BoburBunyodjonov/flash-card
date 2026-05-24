import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../middlewares/auth.middleware'
import { prisma } from '../lib/prisma'
import { getPremiumPrices, getFreeLimits } from '../services/plan-settings.service'
import type { JwtPayload } from '@wordswipe/shared'

export async function profileRoutes(fastify: FastifyInstance) {
  fastify.get('/settings/plan', async (req, reply) => {
    const [prices, limits] = await Promise.all([getPremiumPrices(), getFreeLimits()])
    return reply.send({ success: true, data: { prices, limits } })
  })

  fastify.addHook('onRequest', requireAuth)

  fastify.get('/', async (req, reply) => {
    const user = req.user as JwtPayload
    const data = await prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        avatarUrl: true,
        language: true,
        isPremium: true,
        premiumUntil: true,
        streak: true,
        xp: true,
        notifyAt: true,
        createdAt: true,
        _count: { select: { followers: true, following: true } },
      },
    })
    return reply.send({ success: true, data })
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

  fastify.put('/language', async (req, reply) => {
    const body = z.object({ language: z.enum(['uz', 'en', 'ru']) }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })

    const user = req.user as JwtPayload
    await prisma.user.update({ where: { id: user.userId }, data: { language: body.data.language } })
    return reply.send({ success: true })
  })

  fastify.put('/notifications', async (req, reply) => {
    const body = z.object({ notifyAt: z.string().regex(/^\d{2}:\d{2}$/) }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })

    const user = req.user as JwtPayload
    await prisma.user.update({ where: { id: user.userId }, data: { notifyAt: body.data.notifyAt } })
    return reply.send({ success: true })
  })
}
