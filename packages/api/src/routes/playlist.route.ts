import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../middlewares/auth.middleware'
import type { JwtPayload } from '@wordswipe/shared'
import { listPlaylists, getPlaylist, PlaylistNotFoundError } from '../services/playlist.service'

const idParamSchema = z.object({ id: z.string().uuid() })

export async function playlistRoutes(fastify: FastifyInstance) {
  // GET / — published playlists (series)
  fastify.get('/', { onRequest: requireAuth }, async (req, reply) => {
    const user = req.user as JwtPayload
    const data = await listPlaylists(user.userId)
    return reply.send({ success: true, data })
  })

  // GET /:id — a playlist with its ordered, resolved items
  fastify.get('/:id', { onRequest: requireAuth }, async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    const user = req.user as JwtPayload
    try {
      const data = await getPlaylist(user.userId, params.data.id)
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof PlaylistNotFoundError) {
        return reply.code(404).send({ success: false, error: 'Playlist not found' })
      }
      throw err
    }
  })
}
