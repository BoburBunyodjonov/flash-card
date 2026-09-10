import type { FastifyInstance } from 'fastify'
import { createReadStream, createWriteStream } from 'node:fs'
import { promises as fsp } from 'node:fs'
import { stat } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import multipart from '@fastify/multipart'
import { requireAuth } from '../middlewares/auth.middleware'
import * as cinema from '../services/cinema.service'
import { contentTypeForVideo } from '../lib/browser-video'
import {
  CinemaNotFoundError,
  CinemaUnavailableError,
  CinemaForbiddenError,
} from '../services/cinema.service'
import { TranscribeUnavailableError, TranscribeFileTooLargeError } from '../services/transcription.service'
import { MediaLimitError, canUseHd } from '../services/media-limits.service'
import type { JwtPayload } from '@wordswipe/shared'
import { config } from '../config'

const listQuerySchema = z.object({
  level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).optional(),
  mineOnly: z
    .union([z.literal('1'), z.literal('true'), z.literal('0'), z.literal('false')])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
})
const idParamSchema = z.object({ id: z.string().uuid() })

const segmentSchema = z.object({
  start: z.number().min(0),
  end: z.number().min(0),
  text: z.string().max(2000),
  translation: z.string().max(2000).optional(),
})

const STREAM_TOKEN_TTL = '12h'

function handleErr(err: unknown, reply: any): boolean {
  if (err instanceof MediaLimitError) {
    reply.code(402).send({ success: false, error: err.message, reason: err.reason })
    return true
  }
  if (err instanceof CinemaNotFoundError) {
    reply.code(404).send({ success: false, error: 'Clip not found' })
    return true
  }
  if (err instanceof CinemaForbiddenError) {
    reply.code(403).send({ success: false, error: 'Forbidden' })
    return true
  }
  if (err instanceof CinemaUnavailableError) {
    reply.code(503).send({
      success: false,
      error: 'Cinema video source not configured. Set TELEGRAM_API_ID/HASH/SESSION + CINEMA_CHANNEL_ID.',
    })
    return true
  }
  if (err instanceof TranscribeUnavailableError) {
    reply.code(503).send({
      success: false,
      error: 'Speech-to-text not configured. Set TRANSCRIBE_API_KEY.',
    })
    return true
  }
  if (err instanceof TranscribeFileTooLargeError) {
    reply.code(413).send({
      success: false,
      error: 'Video too large for auto-transcript.',
    })
    return true
  }
  return false
}

export async function cinemaRoutes(fastify: FastifyInstance) {
  await fastify.register(multipart, {
    limits: { fileSize: config.cinema.maxUploadBytes, files: 1 },
  })

  fastify.get('/', { onRequest: requireAuth }, async (req, reply) => {
    const parsed = listQuerySchema.safeParse(req.query)
    if (!parsed.success) return reply.code(400).send({ success: false, error: 'Invalid query' })
    const user = req.user as JwtPayload
    const clips = await cinema.listClips(user.userId, {
      level: parsed.data.level,
      mineOnly: parsed.data.mineOnly,
    })
    return reply.send({ success: true, data: clips })
  })

  fastify.get('/status', { onRequest: requireAuth }, async (_req, reply) => {
    return reply.send({
      success: true,
      data: { ready: cinema.mtprotoReady(), transcribeReady: cinema.transcribeReady() },
    })
  })

  // POST /upload — multipart: video file + fields (title, hasEmbeddedSubtitles, …)
  fastify.post('/upload', { onRequest: requireAuth }, async (req, reply) => {
    const user = req.user as JwtPayload
    if (!cinema.mtprotoReady()) {
      return reply.code(503).send({
        success: false,
        error: 'Cinema video source not configured.',
      })
    }

    let title = 'Untitled'
    let hasEmbeddedSubtitles = false
    let level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' = 'A1'
    let transcript = ''
    let translationUz = ''
    let autoTranscribe = true
    let tmpPath: string | null = null

    try {
      const parts = req.parts()
      for await (const part of parts) {
        if (part.type === 'file') {
          if (!part.mimetype?.startsWith('video/') && !part.filename?.match(/\.(mp4|webm|mov|mkv)$/i)) {
            return reply.code(400).send({ success: false, error: 'Only video files are allowed' })
          }
          await fsp.mkdir(config.cinema.cacheDir, { recursive: true })
          tmpPath = path.join(config.cinema.cacheDir, `upload-${user.userId}-${randomUUID()}.tmp`)
          await pipeline(part.file, createWriteStream(tmpPath))
        } else {
          const v = String(part.value ?? '')
          if (part.fieldname === 'title') title = v.trim() || title
          if (part.fieldname === 'hasEmbeddedSubtitles') {
            hasEmbeddedSubtitles = v === '1' || v === 'true'
          }
          if (part.fieldname === 'level' && ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(v)) {
            level = v as typeof level
          }
          if (part.fieldname === 'transcript') transcript = v
          if (part.fieldname === 'translationUz') translationUz = v
          if (part.fieldname === 'autoTranscribe') {
            autoTranscribe = v !== '0' && v !== 'false'
          }
        }
      }

      if (!tmpPath) {
        return reply.code(400).send({ success: false, error: 'Video file is required' })
      }

      const clip = await cinema.userUploadClip(user.userId, tmpPath, {
        title,
        hasEmbeddedSubtitles,
        level,
        transcript: transcript || undefined,
        translationUz: translationUz || undefined,
        autoTranscribe: hasEmbeddedSubtitles ? false : autoTranscribe,
      })

      return reply.code(201).send({ success: true, data: clip })
    } catch (err) {
      if (handleErr(err, reply)) return
      const msg = err instanceof Error ? err.message : 'Upload failed'
      // Surface known Telegram/upload failures instead of opaque 500.
      if (/not a video|CHANNEL|CHAT_|USER_|FLOOD|PEER|upload/i.test(msg)) {
        return reply.code(400).send({ success: false, error: msg })
      }
      throw err
    } finally {
      if (tmpPath) await fsp.unlink(tmpPath).catch(() => {})
    }
  })

  // POST /from-channel — import an existing channel message as private (user)
  fastify.post('/from-channel', { onRequest: requireAuth }, async (req, reply) => {
    const user = req.user as JwtPayload
    const body = z
      .object({
        tgMessageId: z.number().int().positive(),
        title: z.string().min(1).max(200),
        hasEmbeddedSubtitles: z.boolean().default(false),
        level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).default('A1'),
        transcript: z.string().max(200000).optional(),
        translationUz: z.string().max(200000).optional(),
        segments: z.array(segmentSchema).max(5000).nullish(),
        autoTranscribe: z.boolean().default(true),
      })
      .safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })

    try {
      const clip = await cinema.createClipFromChannel({
        ...body.data,
        visibility: 'private',
        uploadedByUserId: user.userId,
        autoTranscribe: body.data.hasEmbeddedSubtitles ? false : body.data.autoTranscribe,
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

  fastify.patch('/:id', { onRequest: requireAuth }, async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    const body = z
      .object({
        title: z.string().min(1).max(200).optional(),
        transcript: z.string().max(200000).optional(),
        translationUz: z.string().max(200000).optional(),
        level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).optional(),
        segments: z.array(segmentSchema).max(5000).nullish(),
        hasEmbeddedSubtitles: z.boolean().optional(),
      })
      .safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })
    const user = req.user as JwtPayload
    try {
      const clip = await cinema.userUpdateClip(user.userId, params.data.id, body.data)
      return reply.send({ success: true, data: clip })
    } catch (err) {
      if (handleErr(err, reply)) return
      throw err
    }
  })

  fastify.delete('/:id', { onRequest: requireAuth }, async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    const user = req.user as JwtPayload
    try {
      await cinema.userDeleteClip(user.userId, params.data.id)
      return reply.send({ success: true })
    } catch (err) {
      if (handleErr(err, reply)) return
      throw err
    }
  })

  fastify.get('/:id', { onRequest: requireAuth }, async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    const user = req.user as JwtPayload & { isPremium?: boolean }
    try {
      const clip = await cinema.getClip(user.userId, params.data.id, !!user.isPremium)
      const hd = await canUseHd(!!user.isPremium)
      const token = fastify.jwt.sign(
        { userId: user.userId, clipId: clip.id, typ: 'cinema', hd },
        { expiresIn: STREAM_TOKEN_TTL },
      )
      const streamPath = `/api/cinema/${clip.id}/stream?token=${token}`
      return reply.send({ success: true, data: { ...clip, streamPath, hd } })
    } catch (err) {
      if (handleErr(err, reply)) return
      throw err
    }
  })

  // GET /:id/share — Telegram deep link for a shareable (global) clip
  fastify.get('/:id/share', { onRequest: requireAuth }, async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    const user = req.user as JwtPayload
    try {
      const data = await cinema.getShareLink(user.userId, params.data.id)
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof CinemaForbiddenError) {
        return reply.code(403).send({ success: false, error: 'Clip is not shareable' })
      }
      if (handleErr(err, reply)) return
      throw err
    }
  })

  // GET /:id/status — warm-up phase (downloading/transcoding/ready) for the loader
  fastify.get('/:id/status', { onRequest: requireAuth }, async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    const user = req.user as JwtPayload
    try {
      const phase = await cinema.getClipStatus(user.userId, params.data.id)
      return reply.send({ success: true, data: { phase } })
    } catch (err) {
      if (handleErr(err, reply)) return
      throw err
    }
  })

  // GET /:id/words?level=B1 — vocabulary extracted from the clip
  fastify.get('/:id/words', { onRequest: requireAuth }, async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    const query = z
      .object({ level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).optional() })
      .safeParse(req.query)
    if (!query.success) return reply.code(400).send({ success: false, error: 'Invalid query' })
    const user = req.user as JwtPayload & { isPremium?: boolean }
    try {
      const words = await cinema.listClipVocabulary(
        user.userId,
        params.data.id,
        query.data.level,
        !!user.isPremium,
      )
      return reply.send({ success: true, data: words })
    } catch (err) {
      if (handleErr(err, reply)) return
      throw err
    }
  })

  // POST /:id/words/save — add one vocab word to My Words
  fastify.post('/:id/words/save', { onRequest: requireAuth }, async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    const body = z.object({ word: z.string().min(1).max(100) }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })
    const user = req.user as JwtPayload & { isPremium?: boolean }
    try {
      const data = await cinema.saveClipWordToMyWords(
        user.userId,
        params.data.id,
        body.data.word,
        !!user.isPremium,
      )
      return reply.send({ success: true, data })
    } catch (err) {
      if (handleErr(err, reply)) return
      throw err
    }
  })

  fastify.post('/:id/complete', { onRequest: requireAuth }, async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    const user = req.user as JwtPayload
    try {
      const data = await cinema.completeClip(user.userId, params.data.id)
      return reply.send({ success: true, data })
    } catch (err) {
      if (handleErr(err, reply)) return
      throw err
    }
  })

  fastify.get(
    '/:id/stream',
    { config: { rateLimit: false } },
    async (req, reply) => {
      const params = idParamSchema.safeParse(req.params)
      if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
      const { token } = req.query as { token?: string }
      if (!token) return reply.code(401).send({ success: false, error: 'Missing token' })

      let payload: any
      try {
        payload = fastify.jwt.verify(token)
      } catch {
        return reply.code(401).send({ success: false, error: 'Invalid token' })
      }
      if (payload?.typ !== 'cinema' || payload?.clipId !== params.data.id) {
        return reply.code(403).send({ success: false, error: 'Forbidden' })
      }

      let filePath: string
      try {
        filePath = await cinema.resolveClipPath(params.data.id, !!payload?.hd)
      } catch (err) {
        if (handleErr(err, reply)) return
        throw err
      }

      const { size } = await stat(filePath)
      reply.header('Accept-Ranges', 'bytes')
      reply.header('Content-Type', contentTypeForVideo(filePath))
      reply.header('Cache-Control', 'private, max-age=3600')

      const range = req.headers.range
      if (range) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(range)
        if (!m) {
          reply.code(416).header('Content-Range', `bytes */${size}`)
          return reply.send()
        }
        let start = m[1] ? parseInt(m[1], 10) : 0
        let end = m[2] ? parseInt(m[2], 10) : size - 1
        if (Number.isNaN(start)) start = 0
        if (Number.isNaN(end) || end >= size) end = size - 1
        if (start > end || start >= size) {
          reply.code(416).header('Content-Range', `bytes */${size}`)
          return reply.send()
        }
        reply.code(206)
        reply.header('Content-Range', `bytes ${start}-${end}/${size}`)
        reply.header('Content-Length', end - start + 1)
        return reply.send(createReadStream(filePath, { start, end }))
      }

      reply.header('Content-Length', size)
      return reply.send(createReadStream(filePath))
    },
  )
}
