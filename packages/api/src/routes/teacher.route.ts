import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../middlewares/auth.middleware'
import {
  TeacherAuthError,
  addWordsToPack,
  createWordPack,
  getTeacherProfiles,
  isTeacher,
  listWordPacks,
  publishWordPack,
} from '../services/teacher.service'

const wordSchema = z.object({
  word: z.string().min(1).max(120),
  translation: z.string().min(1).max(300),
  pronunciation: z.string().max(120).optional(),
  definition_en: z.string().max(500).optional(),
  example_en: z.string().max(500).optional(),
})

export async function teacherRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth)

  fastify.get('/context', async (req, reply) => {
    const user = req.user as { userId: string }
    const profiles = await getTeacherProfiles(user.userId)
    if (!profiles.length) {
      return reply.code(403).send({ success: false, error: 'Not a registered teacher' })
    }
    return reply.send({ success: true, data: { profiles, is_teacher: true } })
  })

  fastify.get('/status', async (req, reply) => {
    const user = req.user as { userId: string }
    const teacher = await isTeacher(user.userId)
    return reply.send({ success: true, data: { is_teacher: teacher } })
  })

  fastify.get('/packs', async (req, reply) => {
    const user = req.user as { userId: string }
    const query = z.object({ staff_id: z.string().uuid() }).parse(req.query)
    try {
      const packs = await listWordPacks(user.userId, query.staff_id)
      return reply.send({ success: true, data: packs })
    } catch (err) {
      if (err instanceof TeacherAuthError) {
        return reply.code(err.statusCode).send({ success: false, error: err.message })
      }
      throw err
    }
  })

  fastify.post('/packs', async (req, reply) => {
    const user = req.user as { userId: string }
    const body = z
      .object({
        staff_id: z.string().uuid(),
        title: z.string().min(1).max(120),
        group_external_id: z.string().min(1).max(120),
      })
      .safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })

    try {
      const pack = await createWordPack(user.userId, body.data.staff_id, {
        title: body.data.title,
        groupExternalId: body.data.group_external_id,
      })
      return reply.code(201).send({ success: true, data: pack })
    } catch (err) {
      if (err instanceof TeacherAuthError) {
        return reply.code(err.statusCode).send({ success: false, error: err.message })
      }
      throw err
    }
  })

  fastify.post('/packs/:id/words', async (req, reply) => {
    const user = req.user as { userId: string }
    const { id } = req.params as { id: string }
    const body = z.object({ words: z.array(wordSchema).min(1).max(50) }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })

    try {
      const pack = await addWordsToPack(
        user.userId,
        id,
        body.data.words.map((w) => ({
          word: w.word,
          translation: w.translation,
          pronunciation: w.pronunciation,
          definitionEn: w.definition_en,
          exampleEn: w.example_en,
        })),
      )
      return reply.send({ success: true, data: pack })
    } catch (err) {
      if (err instanceof TeacherAuthError) {
        return reply.code(err.statusCode).send({ success: false, error: err.message })
      }
      throw err
    }
  })

  fastify.post('/packs/:id/publish', async (req, reply) => {
    const user = req.user as { userId: string }
    const { id } = req.params as { id: string }
    try {
      const result = await publishWordPack(user.userId, id)
      return reply.send({ success: true, data: result })
    } catch (err) {
      if (err instanceof TeacherAuthError) {
        return reply.code(err.statusCode).send({ success: false, error: err.message })
      }
      throw err
    }
  })
}
