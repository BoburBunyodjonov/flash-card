import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { fetchDictionaryData } from '../../services/words.service'

const wordSchema = z.object({
  word: z.string().min(1),
  pronunciation: z.string().optional(),
  audioUrl: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
  partOfSpeech: z.string().optional(),
  difficulty: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
  categoryId: z.string().uuid(),
  translation: z.object({
    language: z.enum(['uz', 'ru']),
    translation: z.string().optional(),
    definitionEn: z.string().optional(),
    exampleEn: z.string().optional(),
    exampleTranslated: z.string().optional(),
  }).optional(),
})

export async function adminWordsRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (req, reply) => {
    const query = z.object({
      q: z.string().default(''),
      categoryId: z.string().optional(),
      difficulty: z.string().optional(),
      page: z.coerce.number().default(1),
      limit: z.coerce.number().max(100).default(20),
    }).parse(req.query)

    const skip = (query.page - 1) * query.limit
    const where: any = {}
    if (query.q) where.word = { contains: query.q, mode: 'insensitive' }
    if (query.categoryId) where.categoryId = query.categoryId
    if (query.difficulty) where.difficulty = query.difficulty

    const [words, total] = await Promise.all([
      prisma.word.findMany({
        where,
        skip,
        take: query.limit,
        include: { category: true, translations: true, _count: { select: { userProgress: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.word.count({ where }),
    ])

    return reply.send({ success: true, data: { words, total, page: query.page, limit: query.limit } })
  })

  fastify.post('/', async (req, reply) => {
    const body = wordSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })

    const { translation, ...wordData } = body.data

    const word = await prisma.word.create({
      data: {
        ...wordData,
        ...(translation && {
          translations: { create: translation },
        }),
      },
      include: { translations: true, category: true },
    })

    return reply.code(201).send({ success: true, data: word })
  })

  fastify.put('/:id', async (req, reply) => {
    const body = wordSchema.partial().safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })

    const { id } = req.params as { id: string }
    const { translation, ...wordData } = body.data

    const word = await prisma.word.update({
      where: { id },
      data: {
        ...wordData,
        ...(translation && {
          translations: {
            upsert: {
              where: { wordId_language: { wordId: id, language: translation.language } },
              update: translation,
              create: translation,
            },
          },
        }),
      },
      include: { translations: true, category: true },
    })

    return reply.send({ success: true, data: word })
  })

  fastify.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    await prisma.word.delete({ where: { id } })
    return reply.send({ success: true })
  })

  fastify.post('/fetch-dictionary', async (req, reply) => {
    const body = z.object({ word: z.string() }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })

    const data = await fetchDictionaryData(body.data.word)
    return reply.send({ success: true, data })
  })

  fastify.post('/import', async (req, reply) => {
    const body = z.object({
      words: z.array(wordSchema),
    }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })

    let created = 0
    let skipped = 0

    for (const item of body.data.words) {
      const { translation, ...wordData } = item
      try {
        await prisma.word.create({
          data: {
            ...wordData,
            ...(translation && { translations: { create: translation } }),
          },
        })
        created++
      } catch {
        skipped++
      }
    }

    return reply.send({ success: true, data: { created, skipped } })
  })
}
