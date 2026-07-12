import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../middlewares/auth.middleware'
import type { JwtPayload } from '@wordswipe/shared'
import * as shareService from '../services/word-share.service'
import { WordShareError } from '../services/word-share.service'

const createSchema = z.object({
  toUserIds: z.array(z.string().uuid()).min(1).max(20),
  wordIds: z.array(z.string().uuid()).max(100).optional(),
  all: z.boolean().optional(),
}).refine((d) => d.all === true || (d.wordIds && d.wordIds.length > 0), {
  message: 'Provide wordIds or all=true',
})

const idParam = z.object({ id: z.string().uuid() })

export async function wordShareRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth)

  // GET /recipients — my followers
  fastify.get('/recipients', async (req, reply) => {
    const user = req.user as JwtPayload
    const data = await shareService.listShareRecipients(user.userId)
    return reply.send({ success: true, data })
  })

  // GET /incoming — pending shares for me
  fastify.get('/incoming', async (req, reply) => {
    const user = req.user as JwtPayload
    const data = await shareService.listIncomingShares(user.userId)
    return reply.send({ success: true, data })
  })

  // GET /incoming/count
  fastify.get('/incoming/count', async (req, reply) => {
    const user = req.user as JwtPayload
    const count = await shareService.pendingIncomingCount(user.userId)
    return reply.send({ success: true, data: { count } })
  })

  // GET /:id
  fastify.get('/:id', async (req, reply) => {
    const parsed = idParam.safeParse(req.params)
    if (!parsed.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    const user = req.user as JwtPayload
    try {
      const data = await shareService.getShareForUser(parsed.data.id, user.userId)
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof WordShareError) {
        return reply.code(err.statusCode).send({ success: false, error: err.message })
      }
      throw err
    }
  })

  // POST / — create shares
  fastify.post('/', async (req, reply) => {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ success: false, error: 'Invalid body' })
    const user = req.user as JwtPayload
    try {
      const data = await shareService.createWordShares(user.userId, {
        toUserIds: parsed.data.toUserIds,
        wordIds: parsed.data.wordIds,
        all: parsed.data.all,
      })
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof WordShareError) {
        return reply.code(err.statusCode).send({ success: false, error: err.message })
      }
      throw err
    }
  })

  // POST /:id/accept
  fastify.post('/:id/accept', async (req, reply) => {
    const parsed = idParam.safeParse(req.params)
    if (!parsed.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    const user = req.user as JwtPayload
    try {
      const data = await shareService.acceptWordShare(user.userId, parsed.data.id)
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof WordShareError) {
        return reply.code(err.statusCode).send({ success: false, error: err.message })
      }
      throw err
    }
  })

  // POST /:id/decline
  fastify.post('/:id/decline', async (req, reply) => {
    const parsed = idParam.safeParse(req.params)
    if (!parsed.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    const user = req.user as JwtPayload
    try {
      await shareService.declineWordShare(user.userId, parsed.data.id)
      return reply.send({ success: true })
    } catch (err) {
      if (err instanceof WordShareError) {
        return reply.code(err.statusCode).send({ success: false, error: err.message })
      }
      throw err
    }
  })
}
