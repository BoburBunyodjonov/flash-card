import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  ENROLLMENT_STATUSES,
  INTEGRATION_API_VERSION,
  STAFF_ROLES,
  SYNC_MODES,
  type IntegrationLearnerInput,
} from '@wordswipe/shared'
import { requireActivePartner, requirePartnerAuth } from '../../middlewares/partner.middleware'
import { syncGroups, syncStaff } from '../../services/integration-org.service'
import {
  getGroupLearnersProgress,
  getGroupSummary,
  listPartnerGroups,
} from '../../services/integration-analytics.service'
import {
  getPartnerIntegrationSettings,
  updatePartnerIntegrationSettings,
} from '../../services/integration-partner-settings.service'
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

const settingsPatchSchema = z.object({
  integration_enabled: z.boolean().optional(),
  premium_included: z.boolean().optional(),
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
        integration_enabled: req.partner!.status === 'active',
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
        settings: 'GET/PATCH /settings — integration & premium switches (CRM)',
        analytics: {
          groups_list: 'GET /groups',
          group_summary: 'GET /groups/:external_id/summary',
          group_progress: 'GET /groups/:external_id/learners/progress',
          learner_progress: 'GET /learners/:external_id/progress',
        },
      },
    })
  })

  // Settings — works even when integration_enabled=false (re-enable)
  fastify.get('/settings', async (req, reply) => {
    const settings = await getPartnerIntegrationSettings(req.partner!.id)
    if (!settings) return reply.code(404).send({ success: false, error: 'Partner not found' })
    return reply.send({ success: true, data: settings })
  })

  fastify.patch('/settings', async (req, reply) => {
    const body = settingsPatchSchema.safeParse(req.body)
    if (!body.success) {
      return reply.code(400).send({ success: false, error: body.error.message })
    }
    try {
      const settings = await updatePartnerIntegrationSettings(req.partner!.id, body.data)
      return reply.send({ success: true, data: settings })
    } catch (err) {
      const e = err as Error & { statusCode?: number }
      return reply.code(e.statusCode ?? 500).send({ success: false, error: e.message })
    }
  })

  await fastify.register(async (activeRoutes) => {
    activeRoutes.addHook('onRequest', requireActivePartner)

    activeRoutes.post('/staff/sync', async (req, reply) => {
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

    activeRoutes.post('/groups/sync', async (req, reply) => {
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

    activeRoutes.post('/learners/sync', async (req, reply) => {
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

    activeRoutes.put('/learners/:externalId', async (req, reply) => {
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

    activeRoutes.get('/learners/:externalId', async (req, reply) => {
      const { externalId } = req.params as { externalId: string }
      const record = await getLearner(req.partner!.id, decodeURIComponent(externalId))
      if (!record) return reply.code(404).send({ success: false, error: 'Learner not found' })
      return reply.send({ success: true, data: record })
    })

    activeRoutes.get('/learners/:externalId/progress', async (req, reply) => {
      const { externalId } = req.params as { externalId: string }
      const progress = await getLearnerProgress(req.partner!.id, decodeURIComponent(externalId))
      if (!progress) return reply.code(404).send({ success: false, error: 'Learner not found' })
      return reply.send({ success: true, data: progress })
    })

    activeRoutes.delete('/learners/:externalId', async (req, reply) => {
      const { externalId } = req.params as { externalId: string }
      const record = await deactivateLearner(req.partner!.id, decodeURIComponent(externalId))
      if (!record) return reply.code(404).send({ success: false, error: 'Learner not found' })
      return reply.send({ success: true, data: record })
    })

    activeRoutes.get('/groups', async (req, reply) => {
      const groups = await listPartnerGroups(req.partner!.id)
      return reply.send({ success: true, data: { groups } })
    })

    activeRoutes.get('/groups/:externalId/summary', async (req, reply) => {
      const { externalId } = req.params as { externalId: string }
      const summary = await getGroupSummary(req.partner!.id, decodeURIComponent(externalId))
      if (!summary) return reply.code(404).send({ success: false, error: 'Group not found' })
      return reply.send({ success: true, data: summary })
    })

    activeRoutes.get('/groups/:externalId/learners/progress', async (req, reply) => {
      const { externalId } = req.params as { externalId: string }
      const query = z
        .object({ status: z.enum(['active', 'inactive', 'all']).optional() })
        .safeParse(req.query)
      if (!query.success) {
        return reply.code(400).send({ success: false, error: query.error.message })
      }

      const result = await getGroupLearnersProgress(
        req.partner!.id,
        decodeURIComponent(externalId),
        { status: query.data.status },
      )
      if (!result) return reply.code(404).send({ success: false, error: 'Group not found' })
      return reply.send({ success: true, data: result })
    })
  })
}
