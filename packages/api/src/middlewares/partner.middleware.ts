import type { FastifyRequest, FastifyReply } from 'fastify'
import { extractApiKey, resolvePartnerFromApiKey } from '../lib/partner-auth'

declare module 'fastify' {
  interface FastifyRequest {
    partner?: {
      id: string
      name: string
      slug: string
      accessMode: string
      premiumIncluded: boolean
      webhookUrl: string | null
      webhookSecret: string | null
    }
  }
}

export async function requirePartnerAuth(req: FastifyRequest, reply: FastifyReply) {
  const rawKey = extractApiKey(
    req.headers.authorization,
    req.headers['x-api-key'] as string | undefined,
  )
  if (!rawKey) {
    return reply.code(401).send({
      success: false,
      error: 'Missing API key. Use Authorization: Bearer <key> or X-API-Key header.',
    })
  }

  const partner = await resolvePartnerFromApiKey(rawKey)
  if (!partner) {
    return reply.code(401).send({ success: false, error: 'Invalid or inactive API key' })
  }

  req.partner = {
    id: partner.id,
    name: partner.name,
    slug: partner.slug,
    accessMode: partner.accessMode,
    premiumIncluded: partner.premiumIncluded,
    webhookUrl: partner.webhookUrl,
    webhookSecret: partner.webhookSecret,
  }
}
