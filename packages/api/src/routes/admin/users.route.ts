import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'

export async function adminUsersRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (req, reply) => {
    const query = z.object({
      q: z.string().default(''),
      isPremium: z.coerce.boolean().optional(),
      page: z.coerce.number().default(1),
      limit: z.coerce.number().max(100).default(20),
    }).parse(req.query)

    const skip = (query.page - 1) * query.limit
    const where: any = {}
    if (query.q) {
      where.OR = [
        { firstName: { contains: query.q, mode: 'insensitive' } },
        { username: { contains: query.q, mode: 'insensitive' } },
      ]
    }
    if (query.isPremium !== undefined) where.isPremium = query.isPremium

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          telegramId: true,
          firstName: true,
          lastName: true,
          username: true,
          isPremium: true,
          premiumUntil: true,
          streak: true,
          xp: true,
          isAdmin: true,
          createdAt: true,
          lastActive: true,
          _count: { select: { wordProgress: true } },
        },
      }),
      prisma.user.count({ where }),
    ])

    return reply.send({ success: true, data: { users, total, page: query.page, limit: query.limit } })
  })

  fastify.put('/:id', async (req, reply) => {
    const body = z.object({
      isPremium: z.boolean().optional(),
      premiumUntil: z.string().datetime().optional(),
      isAdmin: z.boolean().optional(),
    }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })

    const { id } = req.params as { id: string }
    const data: any = { ...body.data }
    if (data.premiumUntil) data.premiumUntil = new Date(data.premiumUntil)

    const user = await prisma.user.update({ where: { id }, data })
    return reply.send({ success: true, data: user })
  })
}
