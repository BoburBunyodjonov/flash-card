import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as shadowing from '../../services/shadowing.service'
import { ShadowingNotFoundError, ShadowingUnavailableError } from '../../services/shadowing.service'
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
  transcript: z.string().min(1).max(20000),
  translationUz: z.string().min(1).max(20000),
  level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
  categoryId: z.string().uuid().nullish(),
  durationSec: z.number().int().positive().nullish(),
  segments: z.array(segmentSchema).max(500).nullish(),
  order: z.number().int().optional(),
  isPublished: z.boolean().optional(),
})

const updateSchema = createSchema.partial().omit({ tgMessageId: true })
const idParamSchema = z.object({ id: z.string().uuid() })

function handleErr(err: unknown, reply: any): boolean {
  if (err instanceof ShadowingNotFoundError) {
    reply.code(404).send({ success: false, error: 'Clip or channel message not found' })
    return true
  }
  if (err instanceof ShadowingUnavailableError) {
    reply.code(503).send({
      success: false,
      error: 'Telegram MTProto not configured. Set TELEGRAM_API_ID/HASH/SESSION + SHADOWING_CHANNEL_ID.',
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

export async function adminShadowingRoutes(fastify: FastifyInstance) {
  // GET /status — whether the Telegram video source + STT are wired up
  fastify.get('/status', async (_req, reply) => {
    return reply.send({
      success: true,
      data: { ready: shadowing.mtprotoReady(), transcribeReady: shadowing.transcribeReady() },
    })
  })

  // POST /transcribe — auto-generate transcript (+ segments, + uz translation)
  fastify.post('/transcribe', async (req, reply) => {
    const body = z
      .object({ tgMessageId: z.number().int().positive(), translate: z.boolean().default(true) })
      .safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })
    try {
      const data = await shadowing.transcribeMessage(body.data.tgMessageId, body.data.translate)
      return reply.send({ success: true, data })
    } catch (err) {
      if (handleErr(err, reply)) return
      throw err
    }
  })

  // GET /channel-videos — recent videos in the channel, for the picker
  fastify.get('/channel-videos', async (_req, reply) => {
    try {
      const videos = await shadowing.adminListChannelVideos(true)
      return reply.send({ success: true, data: videos })
    } catch (err) {
      if (handleErr(err, reply)) return
      throw err
    }
  })

  // GET /clips — all clips (incl. unpublished)
  fastify.get('/clips', async (_req, reply) => {
    const clips = await shadowing.adminListClips()
    return reply.send({ success: true, data: clips })
  })

  // POST /clips — import a channel video as a shadowing clip
  fastify.post('/clips', async (req, reply) => {
    const body = createSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })
    try {
      const clip = await shadowing.adminCreateClip(body.data)
      return reply.code(201).send({ success: true, data: clip })
    } catch (err: any) {
      if (err?.code === 'P2002') {
        return reply.code(409).send({ success: false, error: 'This video is already imported' })
      }
      if (handleErr(err, reply)) return
      throw err
    }
  })

  // PUT /clips/:id
  fastify.put('/clips/:id', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    const body = updateSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })
    try {
      const clip = await shadowing.adminUpdateClip(params.data.id, body.data)
      return reply.send({ success: true, data: clip })
    } catch (err) {
      if (handleErr(err, reply)) return
      throw err
    }
  })

  // DELETE /clips/:id
  fastify.delete('/clips/:id', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    try {
      await shadowing.adminDeleteClip(params.data.id)
      return reply.send({ success: true })
    } catch (err) {
      if (handleErr(err, reply)) return
      throw err
    }
  })
}
