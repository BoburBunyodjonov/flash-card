import type { FastifyInstance } from 'fastify'
import { createReadStream, createWriteStream } from 'node:fs'
import { stat, unlink } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import multipart from '@fastify/multipart'
import { requireAuth } from '../middlewares/auth.middleware'
import * as shadowing from '../services/shadowing.service'
import { ShadowingNotFoundError, ShadowingUnavailableError } from '../services/shadowing.service'
import { MediaLimitError, canUseHd } from '../services/media-limits.service'
import {
  TranscribeUnavailableError,
  TranscribeFileTooLargeError,
} from '../services/transcription.service'
import { contentTypeForVideo } from '../lib/browser-video'
import { SHADOWING_SPEAK_MAX_AUDIO_BYTES, type JwtPayload } from '@wordswipe/shared'

const listQuerySchema = z.object({
  level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).optional(),
  categoryId: z.string().uuid().optional(),
})
const idParamSchema = z.object({ id: z.string().uuid() })

// The <video> element can't send an Authorization header, so the stream URL
// carries a short-lived signed token instead. Detail responses hand it out.
const STREAM_TOKEN_TTL = '12h'

export async function shadowingRoutes(fastify: FastifyInstance) {
  // Speak-along recordings are small audio blobs uploaded via multipart.
  await fastify.register(multipart, {
    limits: { fileSize: SHADOWING_SPEAK_MAX_AUDIO_BYTES, files: 1 },
  })

  // GET / — published clips (+ per-user completion flags)
  fastify.get('/', { onRequest: requireAuth }, async (req, reply) => {
    const parsed = listQuerySchema.safeParse(req.query)
    if (!parsed.success) return reply.code(400).send({ success: false, error: 'Invalid query' })
    const user = req.user as JwtPayload
    const clips = await shadowing.listClips(user.userId, parsed.data)
    return reply.send({ success: true, data: clips })
  })

  // GET /:id — clip detail + a signed stream path
  fastify.get('/:id', { onRequest: requireAuth }, async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    const user = req.user as JwtPayload & { isPremium?: boolean }
    try {
      const clip = await shadowing.getClip(user.userId, params.data.id, !!user.isPremium)
      const hd = await canUseHd(!!user.isPremium)
      const token = fastify.jwt.sign(
        { userId: user.userId, clipId: clip.id, typ: 'shadow', hd },
        { expiresIn: STREAM_TOKEN_TTL },
      )
      const streamPath = `/api/shadowing/${clip.id}/stream?token=${token}`
      return reply.send({ success: true, data: { ...clip, streamPath, hd } })
    } catch (err) {
      if (err instanceof MediaLimitError) {
        return reply.code(402).send({ success: false, error: err.message, reason: err.reason })
      }
      if (err instanceof ShadowingNotFoundError) {
        return reply.code(404).send({ success: false, error: 'Clip not found' })
      }
      throw err
    }
  })

  // GET /:id/share — Telegram deep link for a published clip
  fastify.get('/:id/share', { onRequest: requireAuth }, async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    const user = req.user as JwtPayload
    try {
      const data = await shadowing.getShareLink(user.userId, params.data.id)
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof ShadowingNotFoundError) {
        return reply.code(404).send({ success: false, error: 'Clip not found' })
      }
      throw err
    }
  })

  // GET /:id/status — warm-up phase (downloading/transcoding/ready) for the loader
  fastify.get('/:id/status', { onRequest: requireAuth }, async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    try {
      const phase = await shadowing.getClipStatus(params.data.id)
      return reply.send({ success: true, data: { phase } })
    } catch (err) {
      if (err instanceof ShadowingNotFoundError) {
        return reply.code(404).send({ success: false, error: 'Clip not found' })
      }
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
      const words = await shadowing.listClipVocabulary(
        user.userId,
        params.data.id,
        query.data.level,
        !!user.isPremium,
      )
      return reply.send({ success: true, data: words })
    } catch (err) {
      if (err instanceof ShadowingNotFoundError) {
        return reply.code(404).send({ success: false, error: 'Clip not found' })
      }
      throw err
    }
  })

  // POST /:id/words/save — add one vocab word to My Words (or return existing)
  fastify.post('/:id/words/save', { onRequest: requireAuth }, async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    const body = z.object({ word: z.string().min(1).max(100) }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })
    const user = req.user as JwtPayload & { isPremium?: boolean }
    try {
      const data = await shadowing.saveClipWordToMyWords(
        user.userId,
        params.data.id,
        body.data.word,
        !!user.isPremium,
      )
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof MediaLimitError) {
        return reply.code(402).send({ success: false, error: err.message, reason: err.reason })
      }
      if (err instanceof ShadowingNotFoundError) {
        return reply.code(404).send({ success: false, error: 'Clip not found' })
      }
      throw err
    }
  })

  // POST /:id/complete — record a shadowing session, award XP (first time only)
  fastify.post('/:id/complete', { onRequest: requireAuth }, async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    const user = req.user as JwtPayload
    try {
      const data = await shadowing.completeClip(user.userId, params.data.id)
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof ShadowingNotFoundError) {
        return reply.code(404).send({ success: false, error: 'Clip not found' })
      }
      throw err
    }
  })

  // POST /:id/speak — upload a recording of segment `segmentIndex`, get a
  // server-STT similarity score. All-segments-passed grants a one-time XP bonus.
  fastify.post('/:id/speak', { onRequest: requireAuth }, async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    const user = req.user as JwtPayload

    const data = await req.file()
    if (!data) return reply.code(400).send({ success: false, error: 'Missing audio file' })

    const rawIndex = (data.fields?.segmentIndex as { value?: string } | undefined)?.value
    const segmentIndex = Number.parseInt(rawIndex ?? '', 10)
    if (!Number.isInteger(segmentIndex) || segmentIndex < 0) {
      return reply.code(400).send({ success: false, error: 'Invalid segmentIndex' })
    }

    const ext = path.extname(data.filename || '') || '.webm'
    const tmpPath = path.join(os.tmpdir(), `speak-${randomUUID()}${ext}`)
    try {
      await pipeline(data.file, createWriteStream(tmpPath))
      if (data.file.truncated) {
        return reply.code(413).send({ success: false, error: 'Audio too large' })
      }
      const result = await shadowing.scoreSpeakSegment(
        user.userId,
        params.data.id,
        segmentIndex,
        tmpPath,
      )
      return reply.send({ success: true, data: result })
    } catch (err) {
      if (err instanceof ShadowingNotFoundError) {
        return reply.code(404).send({ success: false, error: 'Clip or segment not found' })
      }
      if (err instanceof TranscribeUnavailableError) {
        return reply.code(503).send({ success: false, error: 'Speech scoring unavailable' })
      }
      if (err instanceof TranscribeFileTooLargeError) {
        return reply.code(413).send({ success: false, error: 'Audio too large' })
      }
      throw err
    } finally {
      await unlink(tmpPath).catch(() => {})
    }
  })

  // GET /:id/stream?token= — range-capable video proxy. Auth via signed query
  // token (not header). Rate limiting is disabled: a single <video> makes many
  // range requests as the user seeks.
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
      if (payload?.typ !== 'shadow' || payload?.clipId !== params.data.id) {
        return reply.code(403).send({ success: false, error: 'Forbidden' })
      }

      let filePath: string
      try {
        filePath = await shadowing.resolveClipPath(params.data.id, !!payload?.hd)
      } catch (err) {
        if (err instanceof ShadowingNotFoundError) {
          return reply.code(404).send({ success: false, error: 'Clip not found' })
        }
        if (err instanceof ShadowingUnavailableError) {
          return reply.code(503).send({ success: false, error: 'Video source unavailable' })
        }
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
