import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middlewares/auth.middleware'
import * as onboardingService from '../services/onboarding.service'

export async function onboardingRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth)

  fastify.get('/level-test', async (_req, reply) => {
    const questions = await onboardingService.getLevelTest()
    return reply.send({ success: true, data: { questions } })
  })
}
