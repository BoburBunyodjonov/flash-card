import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { CONNECTOR_TYPES, PARTNER_ACCESS_MODES, SYNC_MODES } from '@wordswipe/shared'
import { runPartnerConnectorSync } from '../../integrations/connectors'
import {
  createPartner,
  getPartner,
  listPartners,
  rotatePartnerApiKey,
  updatePartner,
} from '../../services/partner.service'
import {
  listWebhookDeliveries,
  sendPartnerWebhookPing,
} from '../../services/partner-webhook.service'
import { buildIntegrationKit } from '../../services/integration-kit.service'
import {
  getPartnerAnalyticsOverview,
} from '../../services/partner-analytics.service'
import { getGroupLearnersProgress } from '../../services/integration-analytics.service'

const connectorMetadataSchema = z.object({
  connector: z.enum(CONNECTOR_TYPES).optional(),
  generic_rest: z
    .object({
      staff_url: z.string().url().optional(),
      groups_url: z.string().url().optional(),
      learners_url: z.string().url().optional(),
      bundle_url: z.string().url().optional(),
      auth_header: z.string().optional(),
    })
    .optional(),
  edupage: z
    .object({
      username: z.string().min(1),
      password: z.string().optional(),
      school_subdomain: z.string().min(1),
      student_phone_field: z.string().optional(),
    })
    .optional(),
})

export async function adminPartnersRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (_req, reply) => {
    return reply.send({ success: true, data: await listPartners() })
  })

  fastify.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const partner = await getPartner(id)
    if (!partner) return reply.code(404).send({ success: false, error: 'Not found' })
    return reply.send({ success: true, data: partner })
  })

  fastify.get('/:id/webhooks', async (req, reply) => {
    const { id } = req.params as { id: string }
    const query = z.object({ limit: z.coerce.number().max(100).default(30) }).parse(req.query)
    const rows = await listWebhookDeliveries(id, query.limit)
    return reply.send({ success: true, data: rows })
  })

  fastify.get('/:id/analytics', async (req, reply) => {
    const { id } = req.params as { id: string }
    const data = await getPartnerAnalyticsOverview(id)
    if (!data) return reply.code(404).send({ success: false, error: 'Not found' })
    return reply.send({ success: true, data })
  })

  fastify.get('/:id/groups/:externalId/learners/progress', async (req, reply) => {
    const { id, externalId } = req.params as { id: string; externalId: string }
    const query = z
      .object({ status: z.enum(['active', 'inactive', 'all']).optional() })
      .safeParse(req.query)
    if (!query.success) return reply.code(400).send({ success: false, error: query.error.message })

    const data = await getGroupLearnersProgress(id, decodeURIComponent(externalId), {
      status: query.data.status,
    })
    if (!data) return reply.code(404).send({ success: false, error: 'Group not found' })
    return reply.send({ success: true, data })
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
        metadata: connectorMetadataSchema.optional(),
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
        connector: (body.data.metadata?.connector as string) ?? 'manual',
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
        metadata: connectorMetadataSchema.optional(),
      })
      .safeParse(req.body)

    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })

    const partner = await updatePartner(id, body.data)
    return reply.send({ success: true, data: partner })
  })

  fastify.post('/:id/integration-kit', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z
      .object({ apiKey: z.string().min(20).optional() })
      .safeParse(req.body ?? {})
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })

    const partner = await getPartner(id)
    if (!partner) return reply.code(404).send({ success: false, error: 'Not found' })

    const kit = await buildIntegrationKit(
      {
        name: partner.name,
        slug: partner.slug,
        accessMode: partner.accessMode,
        premiumIncluded: partner.premiumIncluded,
        apiKeyPrefix: partner.apiKeyPrefix,
        webhookUrl: partner.webhookUrl,
      },
      body.data.apiKey,
    )

    return reply.send({ success: true, data: kit })
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

  fastify.post('/:id/test-webhook', async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      await sendPartnerWebhookPing(id)
      const latest = await listWebhookDeliveries(id, 1)
      return reply.send({ success: true, data: latest[0] ?? null })
    } catch (err) {
      return reply.code(400).send({ success: false, error: (err as Error).message })
    }
  })

  fastify.post('/:id/sync', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z.object({ mode: z.enum(SYNC_MODES).default('upsert') }).safeParse(req.body ?? {})
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })

    try {
      const result = await runPartnerConnectorSync(id, body.data.mode)
      return reply.send({ success: true, data: result })
    } catch (err) {
      const e = err as Error & { statusCode?: number }
      return reply.code(e.statusCode ?? 500).send({ success: false, error: e.message })
    }
  })
}
