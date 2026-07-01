import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../middlewares/auth.middleware'
import * as gcService from '../services/group-challenge.service'
import type { JwtPayload, Language } from '@wordswipe/shared'

const submitSchema = z.object({
  score: z.number().int().min(0).max(50),
  timeMs: z.number().int().min(0),
})

export async function groupChallengeRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth)

  fastify.get('/', async (req, reply) => {
    const user = req.user as JwtPayload
    const data = await gcService.getMyGroupChallenges(user.userId)
    return reply.send({ success: true, data })
  })

  fastify.post('/', async (req, reply) => {
    const user = req.user as JwtPayload & { language?: string }
    try {
      const gc = await gcService.createGroupChallenge(user.userId, (user.language as Language) ?? 'uz')
      return reply.send({ success: true, data: gc })
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message })
    }
  })

  fastify.get('/:id', async (req, reply) => {
    const user = req.user as JwtPayload
    const { id } = req.params as { id: string }
    const gc = await gcService.getGroupChallenge(id, user.userId)
    if (!gc) return reply.code(404).send({ success: false, error: 'Challenge not found' })
    return reply.send({ success: true, data: gc })
  })

  fastify.post('/:id/join', async (req, reply) => {
    const user = req.user as JwtPayload
    const { id } = req.params as { id: string }
    try {
      const gc = await gcService.joinGroupChallenge(id, user.userId)
      return reply.send({ success: true, data: gc })
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message })
    }
  })

  fastify.post('/:id/submit', async (req, reply) => {
    const body = submitSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })

    const user = req.user as JwtPayload
    const { id } = req.params as { id: string }
    try {
      const gc = await gcService.submitGroupChallenge(id, user.userId, body.data.score, body.data.timeMs)
      return reply.send({ success: true, data: gc })
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message })
    }
  })
}
