import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { PARTNER_ACCESS_MODES } from '@wordswipe/shared'
import {
  createPartner,
  listPartners,
  rotatePartnerApiKey,
  updatePartner,
} from '../../services/partner.service'

export async function adminPartnersRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (_req, reply) => {
    const partners = await listPartners()
    return reply.send({ success: true, data: partners })
  })

  fastify.post('/', async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(2).max(120),
        slug: z.string().min(2).max(48).optional(),
        accessMode: z.enum(PARTNER_ACCESS_MODES).optional(),
        premiumIncluded: z.boolean().optional(),
        webhookUrl: z.string().url().nullable().optional(),
        webhookSecret: z.string().min(8).max(128).nullable().optional(),
        metadata: z.record(z.unknown()).optional(),
      })
      .safeParse(req.body)

    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })

    const { partner, apiKey } = await createPartner(body.data)
    return reply.code(201).send({
      success: true,
      data: {
        id: partner.id,
        name: partner.name,
        slug: partner.slug,
        accessMode: partner.accessMode,
        premiumIncluded: partner.premiumIncluded,
        apiKeyPrefix: partner.apiKeyPrefix,
        apiKey,
      },
      warning: 'Save apiKey now — it will not be shown again.',
    })
  })

  fastify.patch('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z
      .object({
        name: z.string().min(2).max(120).optional(),
        status: z.enum(['active', 'suspended']).optional(),
        accessMode: z.enum(PARTNER_ACCESS_MODES).optional(),
        premiumIncluded: z.boolean().optional(),
        webhookUrl: z.string().url().nullable().optional(),
        webhookSecret: z.string().min(8).max(128).nullable().optional(),
        metadata: z.record(z.unknown()).optional(),
      })
      .safeParse(req.body)

    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })

    const partner = await updatePartner(id, body.data)
    return reply.send({ success: true, data: partner })
  })

  fastify.post('/:id/rotate-key', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { partner, apiKey } = await rotatePartnerApiKey(id)
    return reply.send({
      success: true,
      data: { id: partner.id, apiKeyPrefix: partner.apiKeyPrefix, apiKey },
      warning: 'Save apiKey now — it will not be shown again.',
    })
  })
}
