import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getAllSettings, updateSetting } from '../../services/plan-settings.service'
import type { JwtPayload } from '@wordswipe/shared'

export async function adminSettingsRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (req, reply) => {
    const settings = await getAllSettings()
    return reply.send({ success: true, data: settings })
  })

  fastify.put('/:key', async (req, reply) => {
    const body = z.object({ value: z.union([z.number(), z.boolean()]) }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })

    const user = req.user as JwtPayload
    const { key } = req.params as { key: string }
    await updateSetting(key, body.data.value, user.userId)
    return reply.send({ success: true })
  })
}
