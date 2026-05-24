import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
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

  await fastify.register(cors, {
    origin: config.isDev ? true : ['https://yourdomain.com'],
    credentials: true,
  })

  await fastify.register(jwt, {
    secret: config.jwt.secret,
  })

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  })

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
