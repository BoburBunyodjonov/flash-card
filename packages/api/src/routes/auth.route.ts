import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { loginWithTelegramWidget, loginWithWebApp } from '../services/auth.service'
import { config } from '../config'

const widgetSchema = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.string(),
  hash: z.string(),
})

const webAppSchema = z.object({
  initData: z.string(),
})

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/telegram', async (req, reply) => {
    const body = widgetSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })

    const result = await loginWithTelegramWidget(body.data, fastify)
    return reply.send({ success: true, data: result })
  })

  fastify.post('/webapp', async (req, reply) => {
    const body = webAppSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })

    try {
      const result = await loginWithWebApp(body.data.initData, fastify)
      return reply.send({ success: true, data: result })
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      fastify.log.error({ msg: 'webapp auth failed', error: e.message })
      return reply.code(e.statusCode ?? 401).send({ success: false, error: e.message })
    }
  })

  fastify.post('/admin-login', async (req, reply) => {
    const body = z.object({ username: z.string(), password: z.string() }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })

    if (body.data.username !== config.admin.username || body.data.password !== config.admin.password) {
      return reply.code(401).send({ success: false, error: 'Invalid credentials' })
    }

    const accessToken = fastify.jwt.sign(
      { userId: 'admin', isAdmin: true, isPremium: false },
      { expiresIn: config.jwt.expiresIn },
    )
    const refreshToken = fastify.jwt.sign(
      { userId: 'admin' },
      { expiresIn: config.jwt.refreshExpiresIn },
    )

    return reply.send({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: { id: 'admin', firstName: 'Admin', isAdmin: true },
      },
    })
  })

  fastify.post('/refresh', async (req, reply) => {
    const body = z.object({ refreshToken: z.string() }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })

    try {
      const payload = fastify.jwt.verify<{ userId: string }>(body.data.refreshToken)
      const newToken = fastify.jwt.sign({ userId: payload.userId }, { expiresIn: '15m' })
      return reply.send({ success: true, data: { accessToken: newToken } })
    } catch {
      return reply.code(401).send({ success: false, error: 'Invalid refresh token' })
    }
  })
}
