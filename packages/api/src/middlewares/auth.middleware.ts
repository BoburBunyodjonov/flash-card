import type { FastifyRequest, FastifyReply } from 'fastify'

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
  } catch {
    reply.code(401).send({ success: false, error: 'Unauthorized' })
  }
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
    const payload = req.user as { isAdmin: boolean }
    if (!payload.isAdmin) {
      reply.code(403).send({ success: false, error: 'Forbidden' })
    }
  } catch {
    reply.code(401).send({ success: false, error: 'Unauthorized' })
  }
}

export async function requirePremium(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
    const payload = req.user as { isPremium: boolean; premiumUntil?: string }
    const isActive =
      payload.isPremium &&
      (!payload.premiumUntil || new Date(payload.premiumUntil) > new Date())
    if (!isActive) {
      reply.code(402).send({ success: false, error: 'Premium required' })
    }
  } catch {
    reply.code(401).send({ success: false, error: 'Unauthorized' })
  }
}
