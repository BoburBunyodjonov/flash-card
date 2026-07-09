import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../middlewares/auth.middleware'
import { prisma } from '../lib/prisma'
import * as onboardingService from '../services/onboarding.service'
import { DIFFICULTIES } from '@wordswipe/shared'
import type { JwtPayload } from '@wordswipe/shared'

export async function onboardingRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth)

  fastify.get('/level-test', async (_req, reply) => {
    const questions = await onboardingService.getLevelTest()
    return reply.send({ success: true, data: { questions } })
  })

  fastify.post('/complete', async (req, reply) => {
    const body = z.object({ level: z.enum(DIFFICULTIES) }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })

    const user = req.user as JwtPayload
    await prisma.user.update({
      where: { id: user.userId },
      data: { cefrLevel: body.data.level, onboardingDone: true },
    })
    return reply.send({ success: true })
  })

  fastify.post('/skip', async (req, reply) => {
    const user = req.user as JwtPayload
    await prisma.user.update({
      where: { id: user.userId },
      data: { onboardingDone: true },
    })
    return reply.send({ success: true })
  })
}
