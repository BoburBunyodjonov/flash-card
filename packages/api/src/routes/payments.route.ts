import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../middlewares/auth.middleware'
import { createStarsInvoice } from '../services/payments.service'
import { STARS_PLANS } from '@wordswipe/shared'
import type { JwtPayload } from '@wordswipe/shared'

export async function paymentsRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth)

  // POST /api/payments/invoice { plan: 'monthly' | 'yearly' } → { link }
  fastify.post('/invoice', async (req, reply) => {
    const body = z.object({ plan: z.enum(STARS_PLANS) }).safeParse(req.body)
    if (!body.success) {
      return reply.code(400).send({ success: false, error: 'Invalid body' })
    }

    const user = req.user as JwtPayload
    try {
      const link = await createStarsInvoice(user.userId, body.data.plan)
      return reply.send({ success: true, data: { link } })
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      if (code === 'PAYMENTS_UNAVAILABLE') {
        return reply.code(503).send({ success: false, error: 'Payments are not available right now' })
      }
      req.log.error(err, 'Failed to create Stars invoice')
      return reply.code(500).send({ success: false, error: 'Failed to create invoice' })
    }
  })
}
