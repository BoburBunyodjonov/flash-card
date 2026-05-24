import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'

const categorySchema = z.object({
  nameUz: z.string().min(1),
  nameEn: z.string().min(1),
  nameRu: z.string().min(1),
  icon: z.string().optional(),
  color: z.string().default('#6366f1'),
  isPremium: z.boolean().default(false),
  order: z.number().default(0),
})

export async function adminCategoriesRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (req, reply) => {
    const categories = await prisma.category.findMany({
      orderBy: { order: 'asc' },
      include: { _count: { select: { words: true } } },
    })
    return reply.send({ success: true, data: categories })
  })

  fastify.post('/', async (req, reply) => {
    const body = categorySchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })

    const category = await prisma.category.create({ data: body.data })
    return reply.code(201).send({ success: true, data: category })
  })

  fastify.put('/:id', async (req, reply) => {
    const body = categorySchema.partial().safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })

    const { id } = req.params as { id: string }
    const category = await prisma.category.update({ where: { id }, data: body.data })
    return reply.send({ success: true, data: category })
  })

  fastify.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const wordCount = await prisma.word.count({ where: { categoryId: id } })
    if (wordCount > 0) {
      return reply.code(400).send({ success: false, error: `Category has ${wordCount} words. Move them first.` })
    }
    await prisma.category.delete({ where: { id } })
    return reply.send({ success: true })
  })
}
