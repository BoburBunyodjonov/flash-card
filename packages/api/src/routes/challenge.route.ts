import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middlewares/auth.middleware'
import * as challengeService from '../services/challenge.service'
import type { JwtPayload } from '@wordswipe/shared'

export async function challengeRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth)

  fastify.get('/today', async (req, reply) => {
    const user = req.user as JwtPayload
    const questions = await challengeService.getTodayChallenge(user.userId)
    return reply.send({ success: true, data: { questions, date: new Date().toISOString().slice(0, 10) } })
  })
}
