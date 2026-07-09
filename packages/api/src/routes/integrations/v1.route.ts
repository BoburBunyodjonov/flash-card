import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  ENROLLMENT_STATUSES,
  INTEGRATION_API_VERSION,
  STAFF_ROLES,
  SYNC_MODES,
  type IntegrationLearnerInput,
} from '@wordswipe/shared'
import { requirePartnerAuth } from '../../middlewares/partner.middleware'
import { syncGroups, syncStaff } from '../../services/integration-org.service'
import {
  deactivateLearner,
  getCachedSyncResult,
  getLearner,
  getLearnerProgress,
  logSync,
  syncLearners,
  upsertLearner,
} from '../../services/integration.service'

const groupSchema = z
  .object({
    external_id: z.string().max(120).optional(),
    name: z.string().max(120).optional(),
  })
  .optional()

const learnerSchema = z.object({
  external_id: z.string().min(1).max(120),
  phone: z.string().min(7).max(20),
  first_name: z.string().max(80).optional(),
  last_name: z.string().max(80).optional(),
  status: z.enum(ENROLLMENT_STATUSES).optional(),
  group: groupSchema,
  metadata: z.record(z.unknown()).optional(),
})

const syncBodySchema = z.object({
  mode: z.enum(SYNC_MODES).default('upsert'),
  learners: z.array(learnerSchema).min(1).max(500),
})

const staffSchema = z.object({
  external_id: z.string().min(1).max(120),
  phone: z.string().min(7).max(20),
  first_name: z.string().max(80).optional(),
  last_name: z.string().max(80).optional(),
  role: z.enum(STAFF_ROLES).optional(),
  status: z.enum(ENROLLMENT_STATUSES).optional(),
  metadata: z.record(z.unknown()).optional(),
})

const groupSyncSchema = z.object({
  external_id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  teacher_external_id: z.string().max(120).optional(),
  status: z.enum(ENROLLMENT_STATUSES).optional(),
  metadata: z.record(z.unknown()).optional(),
})

export async function integrationsV1Routes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requirePartnerAuth)

  fastify.get('/ping', async (req, reply) => {
    return reply.send({
      success: true,
      data: {
        api_version: INTEGRATION_API_VERSION,
        partner: req.partner!.slug,
        partner_name: req.partner!.name,
        timestamp: new Date().toISOString(),
      },
    })
  })

  fastify.get('/schema', async (_req, reply) => {
    return reply.send({
      success: true,
      data: {
        api_version: INTEGRATION_API_VERSION,
        learner: {
          external_id: 'string (required) — ERP student ID',
          phone: 'string (required) — 9 digits or +998…',
          first_name: 'string (optional)',
          last_name: 'string (optional)',
          status: 'active | inactive',
          group: { external_id: 'string?', name: 'string?' },
          metadata: 'object (optional) — ERP-specific fields',
        },
        sync_modes: SYNC_MODES,
        auth: 'Authorization: Bearer ws_live_… or X-API-Key header',
        idempotency: 'Idempotency-Key header on POST /learners/sync',
        staff_sync: 'POST /staff/sync — teachers/admins from ERP',
        groups_sync: 'POST /groups/sync — classes with teacher_external_id',
      },
    })
  })

  fastify.post('/staff/sync', async (req, reply) => {
    const body = z
      .object({
        mode: z.enum(SYNC_MODES).default('upsert'),
        staff: z.array(staffSchema).min(1).max(200),
      })
      .safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })

    const result = await syncStaff(req.partner!.id, body.data.staff, body.data.mode)
    const statusCode = result.errors.length > 0 && result.created + result.updated === 0 ? 422 : 200
    return reply.code(statusCode).send({ success: statusCode < 400, data: result })
  })

  fastify.post('/groups/sync', async (req, reply) => {
    const body = z
      .object({
        mode: z.enum(SYNC_MODES).default('upsert'),
        groups: z.array(groupSyncSchema).min(1).max(200),
      })
      .safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })

    const result = await syncGroups(req.partner!.id, body.data.groups, body.data.mode)
    const statusCode = result.errors.length > 0 && result.created + result.updated === 0 ? 422 : 200
    return reply.code(statusCode).send({ success: statusCode < 400, data: result })
  })

  fastify.post('/learners/sync', async (req, reply) => {
    const partnerId = req.partner!.id
    const idempotencyKey = (req.headers['idempotency-key'] as string | undefined)?.trim()

    if (idempotencyKey) {
      const cached = await getCachedSyncResult(partnerId, idempotencyKey)
      if (cached?.resultSummary) {
        return reply.code(cached.statusCode).send({
          success: cached.statusCode < 400,
          data: cached.resultSummary,
          meta: { idempotent: true },
        })
      }
    }

    const body = syncBodySchema.safeParse(req.body)
    if (!body.success) {
      return reply.code(400).send({ success: false, error: body.error.message })
    }

    const result = await syncLearners(
      partnerId,
      body.data.learners as IntegrationLearnerInput[],
      body.data.mode,
    )

    const statusCode = result.errors.length > 0 && result.created + result.updated === 0 ? 422 : 200

    if (idempotencyKey) {
      await logSync(
        partnerId,
        'learners.sync',
        idempotencyKey,
        { count: body.data.learners.length, mode: body.data.mode },
        result,
        statusCode,
      )
    }

    return reply.code(statusCode).send({ success: statusCode < 400, data: result })
  })

  fastify.put('/learners/:externalId', async (req, reply) => {
    const { externalId } = req.params as { externalId: string }
    const body = learnerSchema.safeParse({ ...(req.body as object), external_id: externalId })
    if (!body.success) {
      return reply.code(400).send({ success: false, error: body.error.message })
    }

    try {
      const { record, created } = await upsertLearner(
        req.partner!.id,
        body.data as IntegrationLearnerInput,
      )
      return reply.code(created ? 201 : 200).send({ success: true, data: record })
    } catch (err) {
      const e = err as Error & { statusCode?: number }
      return reply.code(e.statusCode ?? 500).send({ success: false, error: e.message })
    }
  })

  fastify.get('/learners/:externalId', async (req, reply) => {
    const { externalId } = req.params as { externalId: string }
    const record = await getLearner(req.partner!.id, decodeURIComponent(externalId))
    if (!record) return reply.code(404).send({ success: false, error: 'Learner not found' })
    return reply.send({ success: true, data: record })
  })

  fastify.get('/learners/:externalId/progress', async (req, reply) => {
    const { externalId } = req.params as { externalId: string }
    const progress = await getLearnerProgress(req.partner!.id, decodeURIComponent(externalId))
    if (!progress) return reply.code(404).send({ success: false, error: 'Learner not found' })
    return reply.send({ success: true, data: progress })
  })

  fastify.delete('/learners/:externalId', async (req, reply) => {
    const { externalId } = req.params as { externalId: string }
    const record = await deactivateLearner(req.partner!.id, decodeURIComponent(externalId))
    if (!record) return reply.code(404).send({ success: false, error: 'Learner not found' })
    return reply.send({ success: true, data: record })
  })
}
