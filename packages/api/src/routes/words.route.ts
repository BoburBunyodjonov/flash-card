import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../middlewares/auth.middleware'
import { searchWords, getWordById, fetchDictionaryData, toggleBookmark } from '../services/words.service'
import type { JwtPayload } from '@wordswipe/shared'

export async function wordsRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth)

  fastify.get('/', async (req, reply) => {
    const query = z.object({
      q: z.string().default(''),
      page: z.coerce.number().default(1),
      limit: z.coerce.number().max(50).default(20),
    }).parse(req.query)

    const user = req.user as JwtPayload & { language: string }
    const result = await searchWords(query.q, (user as any).language ?? 'uz', query.page, query.limit)
    return reply.send({ success: true, data: result })
  })

  fastify.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const user = req.user as JwtPayload & { language: string }
    const word = await getWordById(id, (user as any).language ?? 'uz')
    if (!word) return reply.code(404).send({ success: false, error: 'Word not found' })
    return reply.send({ success: true, data: word })
  })

  fastify.get('/:id/dictionary', async (req, reply) => {
    const { id } = req.params as { id: string }
    const word = await fastify.prisma.word.findUnique({ where: { id }, select: { word: true } })
    if (!word) return reply.code(404).send({ success: false, error: 'Word not found' })
    const data = await fetchDictionaryData(word.word)
    return reply.send({ success: true, data })
  })

  fastify.post('/:id/bookmark', async (req, reply) => {
    const { id } = req.params as { id: string }
    const user = req.user as JwtPayload
    const bookmarked = await toggleBookmark(user.userId, id)
    return reply.send({ success: true, data: { bookmarked } })
  })
}
