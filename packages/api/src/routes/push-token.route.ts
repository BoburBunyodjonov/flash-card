import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middlewares/auth.middleware'
import type { JwtPayload } from '@wordswipe/shared'

// Accept both `token` and `fcmToken` so we're resilient to the mobile client's
// exact field name. Platform is optional metadata.
const upsertSchema = z
  .object({
    token: z.string().min(10).max(4096).optional(),
    fcmToken: z.string().min(10).max(4096).optional(),
    platform: z.enum(['android', 'ios', 'web']).optional(),
  })
  .refine((d) => Boolean(d.token || d.fcmToken), { message: 'token is required' })

const deleteSchema = z.object({
  token: z.string().min(1).optional(),
  fcmToken: z.string().min(1).optional(),
})

export async function pushTokenRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth)

  // PUT /api/push-token — register or refresh this device's FCM token (idempotent).
  fastify.put('/push-token', async (req, reply) => {
    const parsed = upsertSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ success: false, error: 'Invalid body' })

    const { userId } = req.user as JwtPayload
    const token = (parsed.data.token ?? parsed.data.fcmToken)!
    const platform = parsed.data.platform ?? null

    // Token is globally unique to one device; on conflict reassign it to the
    // current user so a reused device follows the latest logged-in account.
    await prisma.pushToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    })

    return reply.send({ success: true })
  })

  // DELETE /api/push-token — unregister a token on logout. Only removes the
  // caller's own token; a missing/unknown token is a silent success.
  fastify.delete('/push-token', async (req, reply) => {
    const parsed = deleteSchema.safeParse(req.body)
    const token = parsed.success ? (parsed.data.token ?? parsed.data.fcmToken) : undefined
    const { userId } = req.user as JwtPayload

    if (token) {
      await prisma.pushToken.deleteMany({ where: { token, userId } })
    }

    return reply.send({ success: true })
  })
}
