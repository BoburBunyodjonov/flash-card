import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'

export async function adminAnalyticsRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (req, reply) => {
    const now = new Date()
    const todayStart = new Date(now.setHours(0, 0, 0, 0))
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [
      totalUsers,
      premiumUsers,
      activeToday,
      totalWords,
      totalSwipes,
      newUsersThisMonth,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isPremium: true } }),
      prisma.user.count({ where: { lastActive: { gte: todayStart } } }),
      prisma.word.count(),
      prisma.userWordProgress.count(),
      prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
    ])

    const hardestWords = await prisma.userWordProgress.groupBy({
      by: ['wordId'],
      where: { status: 'learning' },
      _count: { wordId: true },
      orderBy: { _count: { wordId: 'desc' } },
      take: 10,
    })

    const wordIds = (hardestWords as any[]).map((w) => w.wordId)
    const words = await prisma.word.findMany({
      where: { id: { in: wordIds } },
      select: { id: true, word: true },
    })

    const topHard = (hardestWords as any[]).map((h) => ({
      word: (words as any[]).find((w) => w.id === h.wordId)?.word,
      count: h._count.wordId,
    }))

    return reply.send({
      success: true,
      data: {
        totalUsers,
        premiumUsers,
        activeToday,
        totalWords,
        totalSwipes,
        newUsersThisMonth,
        conversionRate: totalUsers > 0 ? ((premiumUsers / totalUsers) * 100).toFixed(1) : '0',
        topHardWords: topHard,
      },
    })
  })
}
