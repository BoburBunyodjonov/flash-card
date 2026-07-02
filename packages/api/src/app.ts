import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import websocket from '@fastify/websocket'
import { config } from './config'
import { prisma } from './lib/prisma'
import { registerRoutes } from './routes'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: typeof prisma
  }
}

export async function buildApp() {
  const fastify = Fastify({
    logger: config.isDev
      ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
      : true,
  })

  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    ...(process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? []),
  ]

  // Flutter Web (`flutter run -d chrome`) serves on a RANDOM localhost port each
  // run, so we can't hardcode it — allow any localhost / 127.0.0.1 origin.
  // Native Flutter (Android/iOS) sends no Origin header at all (`!origin` → allowed).
  const localhostOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

  const isAllowedOrigin = (origin?: string) =>
    !origin || allowedOrigins.includes(origin) || localhostOrigin.test(origin)

  await fastify.register(cors, {
    origin: config.isDev ? true : (origin, cb) => {
      if (isAllowedOrigin(origin)) return cb(null, true)
      // Reject cleanly WITHOUT throwing — passing an Error makes the OPTIONS
      // preflight return 500, which the browser surfaces as a generic "CORS error".
      cb(null, false)
    },
    credentials: true,
  })

  await fastify.register(jwt, {
    secret: config.jwt.secret,
  })

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  })

  await fastify.register(websocket)

  fastify.decorate('prisma', prisma)

  fastify.setErrorHandler((error, req, reply) => {
    fastify.log.error(error)
    const statusCode = error.statusCode ?? 500
    reply.code(statusCode).send({
      success: false,
      error: config.isDev ? error.message : 'Internal Server Error',
    })
  })

  fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  await registerRoutes(fastify)

  return fastify
}
