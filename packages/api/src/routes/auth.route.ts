import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  loginWithTelegramWidget,
  loginWithWebApp,
  registerWithPhone,
  loginWithPhone,
  setUserCredentials,
  AuthError,
} from '../services/auth.service'
import { requireAuth } from '../middlewares/auth.middleware'
import type { JwtPayload } from '@wordswipe/shared'
import { config } from '../config'

const setPasswordSchema = z.object({
  phone: z.string().min(7).max(20),
  password: z.string().min(6).max(100),
})

const registerSchema = z.object({
  phone: z.string().min(7).max(20),
  password: z.string().min(6).max(100),
  firstName: z.string().min(1).max(60),
})

const loginSchema = z.object({
  phone: z.string().min(7).max(20),
  password: z.string().min(1).max(100),
})

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
  fastify.get('/public-config', async (_req, reply) => {
    return reply.send({
      success: true,
      data: {
        telegram_bot_username: config.telegram.botUsername || null,
        app_url: config.telegram.appUrl,
      },
    })
  })

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
      const clientMessage =
        e.statusCode === 401 || e.message.includes('Invalid Telegram')
          ? e.message
          : 'Login failed. Please try again.'
      return reply.code(e.statusCode ?? 500).send({ success: false, error: clientMessage })
    }
  })

  // Phone + password registration (native app, no Telegram)
  fastify.post('/register', async (req, reply) => {
    const body = registerSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })
    try {
      const result = await registerWithPhone(body.data, fastify)
      return reply.send({ success: true, data: result })
    } catch (err) {
      if (err instanceof AuthError) return reply.code(err.statusCode).send({ success: false, error: err.message })
      throw err
    }
  })

  // Phone + password login
  fastify.post('/login', async (req, reply) => {
    const body = loginSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })
    try {
      const result = await loginWithPhone(body.data, fastify)
      return reply.send({ success: true, data: result })
    } catch (err) {
      if (err instanceof AuthError) return reply.code(err.statusCode).send({ success: false, error: err.message })
      throw err
    }
  })

  // Set/update phone+password on the current account (existing Telegram users
  // linking native-app credentials). Auth required.
  fastify.post('/set-password', { onRequest: requireAuth }, async (req, reply) => {
    const body = setPasswordSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })
    const user = req.user as JwtPayload
    try {
      const result = await setUserCredentials(user.userId, body.data.phone, body.data.password)
      return reply.send({ success: true, data: result })
    } catch (err) {
      if (err instanceof AuthError) return reply.code(err.statusCode).send({ success: false, error: err.message })
      throw err
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
      // The admin pseudo-user must keep its isAdmin claim, or requireAdmin
      // rejects every request made with a refreshed token
      const newToken = fastify.jwt.sign(
        payload.userId === 'admin'
          ? { userId: 'admin', isAdmin: true, isPremium: false }
          : { userId: payload.userId },
        { expiresIn: '15m' },
      )
      return reply.send({ success: true, data: { accessToken: newToken } })
    } catch {
      return reply.code(401).send({ success: false, error: 'Invalid refresh token' })
    }
  })
}
