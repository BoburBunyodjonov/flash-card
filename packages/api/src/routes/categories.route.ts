import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma'

export async function categoriesRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (_req, reply) => {
    const categories = await prisma.category.findMany({
      orderBy: { order: 'asc' },
      select: { id: true, nameUz: true, nameEn: true, icon: true, color: true, isPremium: true },
    })
    return reply.send({ success: true, data: categories })
  })
}
