import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../middlewares/auth.middleware'
import * as decksService from '../services/decks.service'
import type { JwtPayload } from '@wordswipe/shared'

export async function decksRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth)

  fastify.get('/', async (req, reply) => {
    const user = req.user as JwtPayload
    const decks = await decksService.getUserDecks(user.userId)
    return reply.send({ success: true, data: decks })
  })

  fastify.post('/', async (req, reply) => {
    const body = z.object({ name: z.string().min(1), description: z.string().optional() }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })

    const user = req.user as JwtPayload & { isPremium: boolean }
    const deck = await decksService.createDeck(user.userId, body.data.name, body.data.description, user.isPremium)
    return reply.code(201).send({ success: true, data: deck })
  })

  fastify.put('/:id', async (req, reply) => {
    const body = z.object({ name: z.string().min(1).optional(), description: z.string().optional() }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })

    const user = req.user as JwtPayload
    const { id } = req.params as { id: string }
    const deck = await decksService.updateDeck(id, user.userId, body.data)
    return reply.send({ success: true, data: deck })
  })

  fastify.delete('/:id', async (req, reply) => {
    const user = req.user as JwtPayload
    const { id } = req.params as { id: string }
    await decksService.deleteDeck(id, user.userId)
    return reply.send({ success: true })
  })

  fastify.post('/:id/words', async (req, reply) => {
    const body = z.object({ wordId: z.string().uuid() }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })

    const user = req.user as JwtPayload & { isPremium: boolean }
    const { id } = req.params as { id: string }
    await decksService.addWordToDeck(id, user.userId, body.data.wordId, user.isPremium)
    return reply.code(201).send({ success: true })
  })

  fastify.delete('/:id/words/:wordId', async (req, reply) => {
    const user = req.user as JwtPayload
    const { id, wordId } = req.params as { id: string; wordId: string }
    await decksService.removeWordFromDeck(id, user.userId, wordId)
    return reply.send({ success: true })
  })

  fastify.get('/:id/words', async (req, reply) => {
    const user = req.user as JwtPayload
    const { id } = req.params as { id: string }
    const data = await decksService.getDeckWords(user.userId, id)
    return reply.send({ success: true, data })
  })
}
