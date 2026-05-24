import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../middlewares/auth.middleware'
import { getDailyFeed, recordSwipe, getTodayStats } from '../services/feed.service'
import type { JwtPayload } from '@wordswipe/shared'

const swipeSchema = z.object({
  wordId: z.string().uuid(),
  direction: z.enum(['left', 'right', 'up']),
})

export async function feedRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth)

  fastify.get('/', async (req, reply) => {
    const user = req.user as JwtPayload & { isPremium: boolean; language: string }
    const feed = await getDailyFeed(user.userId, user.isPremium, (user as any).language ?? 'uz')
    return reply.send({ success: true, data: feed })
  })

  fastify.post('/swipe', async (req, reply) => {
    const body = swipeSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })

    const user = req.user as JwtPayload & { isPremium: boolean }
    const result = await recordSwipe(user.userId, body.data.wordId, body.data.direction, user.isPremium)
    return reply.send({ success: true, data: result })
  })

  fastify.get('/stats', async (req, reply) => {
    const user = req.user as JwtPayload & { isPremium: boolean }
    const stats = await getTodayStats(user.userId, user.isPremium)
    return reply.send({ success: true, data: stats })
  })
}
