import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../middlewares/auth.middleware'
import * as progressService from '../services/progress.service'
import type { JwtPayload } from '@wordswipe/shared'

export async function progressRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth)

  fastify.get('/', async (req, reply) => {
    const user = req.user as JwtPayload
    const data = await progressService.getOverallProgress(user.userId)
    return reply.send({ success: true, data })
  })

  fastify.get('/streak', async (req, reply) => {
    const user = req.user as JwtPayload
    const u = await fastify.prisma.user.findUnique({
      where: { id: user.userId },
      select: { streak: true, lastActive: true, xp: true },
    })
    return reply.send({ success: true, data: u })
  })

  fastify.get('/weak-words', async (req, reply) => {
    const user = req.user as JwtPayload
    const data = await progressService.getWeakWords(user.userId)
    return reply.send({ success: true, data })
  })

  fastify.get('/history', async (req, reply) => {
    const query = z.object({ period: z.enum(['week', 'month']).default('week') }).parse(req.query)
    const user = req.user as JwtPayload
    const data = await progressService.getHistory(user.userId, query.period)
    return reply.send({ success: true, data })
  })
}
