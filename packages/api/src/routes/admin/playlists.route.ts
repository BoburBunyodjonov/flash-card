import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  adminListPlaylists,
  adminGetPlaylist,
  adminCreatePlaylist,
  adminUpdatePlaylist,
  adminDeletePlaylist,
  adminSetItems,
  PlaylistNotFoundError,
} from '../../services/playlist.service'

const idParamSchema = z.object({ id: z.string().uuid() })
const DIFFICULTY = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])
const PLAYLIST_TYPE = z.enum(['cinema', 'shadowing', 'mixed'])
const MEDIA_KIND = z.enum(['cinema', 'shadowing'])

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  coverUrl: z.string().url().max(2000).nullable().optional(),
  type: PLAYLIST_TYPE.optional(),
  level: DIFFICULTY.nullable().optional(),
  isPublished: z.boolean().optional(),
  order: z.number().int().optional(),
})

const updateSchema = createSchema.partial()

const setItemsSchema = z.object({
  items: z.array(z.object({ kind: MEDIA_KIND, clipId: z.string().uuid() })).max(200),
})

function notFound(err: unknown, reply: any): boolean {
  if (err instanceof PlaylistNotFoundError) {
    reply.code(404).send({ success: false, error: 'Playlist not found' })
    return true
  }
  return false
}

export async function adminPlaylistsRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (_req, reply) => {
    const data = await adminListPlaylists()
    return reply.send({ success: true, data })
  })

  fastify.get('/:id', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    try {
      const data = await adminGetPlaylist(params.data.id)
      return reply.send({ success: true, data })
    } catch (err) {
      if (notFound(err, reply)) return
      throw err
    }
  })

  fastify.post('/', async (req, reply) => {
    const body = createSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })
    const data = await adminCreatePlaylist(body.data)
    return reply.code(201).send({ success: true, data })
  })

  fastify.patch('/:id', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    const body = updateSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })
    try {
      const data = await adminUpdatePlaylist(params.data.id, body.data)
      return reply.send({ success: true, data })
    } catch (err) {
      if (notFound(err, reply)) return
      throw err
    }
  })

  fastify.put('/:id/items', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    const body = setItemsSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })
    try {
      const data = await adminSetItems(params.data.id, body.data.items)
      return reply.send({ success: true, data })
    } catch (err) {
      if (notFound(err, reply)) return
      throw err
    }
  })

  fastify.delete('/:id', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })
    try {
      await adminDeletePlaylist(params.data.id)
      return reply.send({ success: true })
    } catch (err) {
      if (notFound(err, reply)) return
      throw err
    }
  })
}
