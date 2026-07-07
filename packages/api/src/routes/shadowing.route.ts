import type { FastifyInstance } from 'fastify'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { z } from 'zod'
import { requireAuth } from '../middlewares/auth.middleware'
import * as shadowing from '../services/shadowing.service'
import { ShadowingNotFoundError, ShadowingUnavailableError } from '../services/shadowing.service'
import type { JwtPayload } from '@wordswipe/shared'

const listQuerySchema = z.object({
  level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).optional(),
  categoryId: z.string().uuid().optional(),
})
const idParamSchema = z.object({ id: z.string().uuid() })

// The <video> element can't send an Authorization header, so the stream URL
// carries a short-lived signed token instead. Detail responses hand it out.
const STREAM_TOKEN_TTL = '12h'

export async function shadowingRoutes(fastify: FastifyInstance) {
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
    const user = req.user as JwtPayload
    try {
      const clip = await shadowing.getClip(user.userId, params.data.id)
      const token = fastify.jwt.sign(
        { userId: user.userId, clipId: clip.id, typ: 'shadow' },
        { expiresIn: STREAM_TOKEN_TTL },
      )
      const streamPath = `/api/shadowing/${clip.id}/stream?token=${token}`
      return reply.send({ success: true, data: { ...clip, streamPath } })
    } catch (err) {
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
        filePath = await shadowing.resolveClipPath(params.data.id)
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
      reply.header('Content-Type', 'video/mp4')
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
