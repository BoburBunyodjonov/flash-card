import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as cinema from '../../services/cinema.service'
import { CinemaNotFoundError, CinemaUnavailableError } from '../../services/cinema.service'
import { TranscribeUnavailableError, TranscribeFileTooLargeError } from '../../services/transcription.service'

const segmentSchema = z.object({
  start: z.number().min(0),
  end: z.number().min(0),
  text: z.string().max(2000),
  translation: z.string().max(2000).optional(),
})

const createSchema = z.object({
  tgMessageId: z.number().int().positive(),
  title: z.string().min(1).max(200),
  transcript: z.string().max(200000).optional().default(''),
  translationUz: z.string().max(200000).optional().default(''),
  level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).default('A1'),
  categoryId: z.string().uuid().nullish(),
  durationSec: z.number().int().positive().nullish(),
  // Cinema clips can be longer than Shadowing — Whisper may emit thousands of lines.
  segments: z.array(segmentSchema).max(5000).nullish(),
  order: z.number().int().optional(),
  isPublished: z.boolean().optional(),
  visibility: z.enum(['private', 'global']).optional(),
  hasEmbeddedSubtitles: z.boolean().optional(),
  autoTranscribe: z.boolean().optional(),
})

const updateSchema = createSchema.partial().omit({ tgMessageId: true, autoTranscribe: true })
const idParamSchema = z.object({ id: z.string().uuid() })

function handleErr(err: unknown, reply: any): boolean {
  if (err instanceof CinemaNotFoundError) {
    reply.code(404).send({ success: false, error: 'Clip or channel message not found' })
    return true
  }
  if (err instanceof CinemaUnavailableError) {
    reply.code(503).send({
      success: false,
      error: 'Telegram MTProto not configured. Set TELEGRAM_API_ID/HASH/SESSION + CINEMA_CHANNEL_ID.',
    })
    return true
  }
  if (err instanceof TranscribeUnavailableError) {
    reply.code(503).send({
      success: false,
      error: 'Speech-to-text not configured. Set TRANSCRIBE_API_KEY (Groq/OpenAI).',
    })
    return true
  }
  if (err instanceof TranscribeFileTooLargeError) {
    reply.code(413).send({
      success: false,
      error: 'Video 24MB dan katta — avto-transkript hozircha qisqaroq kliplar uchun.',
    })
    return true
  }
  return false
}

export async function adminCinemaRoutes(fastify: FastifyInstance) {
  fastify.get('/status', async (_req, reply) => {
    return reply.send({
      success: true,
      data: { ready: cinema.mtprotoReady(), transcribeReady: cinema.transcribeReady() },
    })
  })

  fastify.post('/transcribe', async (req, reply) => {
    const body = z
      .object({ tgMessageId: z.number().int().positive(), translate: z.boolean().default(true) })
      .safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })
    try {
      const data = await cinema.transcribeMessage(body.data.tgMessageId, body.data.translate)
      return reply.send({ success: true, data })
    } catch (err) {
      if (handleErr(err, reply)) return
      throw err
    }
  })

  fastify.get('/channel-videos', async (_req, reply) => {
    try {
      const videos = await cinema.adminListChannelVideos(true)
      return reply.send({ success: true, data: videos })
    } catch (err) {
      if (handleErr(err, reply)) return
      throw err
    }
  })

  fastify.get('/clips', async (_req, reply) => {
    const clips = await cinema.adminListClips()
    return reply.send({ success: true, data: clips })
  })

  fastify.post('/clips', async (req, reply) => {
    const body = createSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })
    try {
      const clip = await cinema.adminCreateClip({
        ...body.data,
        visibility: body.data.visibility ?? 'global',
        autoTranscribe: body.data.hasEmbeddedSubtitles
          ? false
          : (body.data.autoTranscribe ?? false),
      })
      return reply.code(201).send({ success: true, data: clip })
    } catch (err: any) {
      if (err?.code === 'P2002') {
        return reply.code(409).send({ success: false, error: 'This video is already imported' })
      }
      if (handleErr(err, reply)) return
      throw err
    }
  })

  fastify.put('/clips/:id', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    const body = updateSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })
    try {
      const clip = await cinema.adminUpdateClip(params.data.id, body.data)
      return reply.send({ success: true, data: clip })
    } catch (err) {
      if (handleErr(err, reply)) return
      throw err
    }
  })

  /** Promote a user (or private) clip to global — or demote back to private. */
  fastify.post('/clips/:id/visibility', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    const body = z.object({ visibility: z.enum(['private', 'global']) }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })
    try {
      const clip = await cinema.adminSetVisibility(params.data.id, body.data.visibility)
      return reply.send({ success: true, data: clip })
    } catch (err) {
      if (handleErr(err, reply)) return
      throw err
    }
  })

  fastify.delete('/clips/:id', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    try {
      await cinema.adminDeleteClip(params.data.id)
      return reply.send({ success: true })
    } catch (err) {
      if (handleErr(err, reply)) return
      throw err
    }
  })
}
