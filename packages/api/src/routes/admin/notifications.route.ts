import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { notificationQueue } from '../../jobs'

export async function adminNotificationsRoutes(fastify: FastifyInstance) {
  fastify.post('/send', async (req, reply) => {
    const body = z.object({
      message: z.string().min(1),
      target: z.enum(['all', 'premium', 'free']).default('all'),
    }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })

    const where: any = {}
    if (body.data.target === 'premium') where.isPremium = true
    if (body.data.target === 'free') where.isPremium = false

    const users = await prisma.user.findMany({
      where: { ...where, telegramId: { not: null } },
      select: { telegramId: true },
    })

    await notificationQueue.add('bulk-message', {
      telegramIds: (users as any[])
        .map((u) => u.telegramId?.toString())
        .filter(Boolean),
      message: body.data.message,
    })

    return reply.send({ success: true, data: { queued: users.length } })
  })
}
