import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middlewares/auth.middleware'
import { prisma } from '../lib/prisma'
import { getFreeLimits } from '../services/plan-settings.service'
import type { JwtPayload } from '@wordswipe/shared'

export async function leaderboardRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth)

  fastify.get('/global', async (req, reply) => {
    const user = req.user as JwtPayload
    const [top, following] = await Promise.all([
      prisma.user.findMany({
        orderBy: { xp: 'desc' },
        take: 100,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
          avatarUrl: true,
          xp: true,
          streak: true,
        },
      }),
      prisma.follow.findMany({
        where: { followerId: user.userId },
        select: { followingId: true },
      }),
    ])
    const followingIds = new Set(following.map((f: { followingId: string }) => f.followingId))
    const data = top.map((u: { id: string }) => ({ ...u, isFollowing: followingIds.has(u.id) }))
    return reply.send({ success: true, data })
  })

  fastify.get('/friends', async (req, reply) => {
    const user = req.user as JwtPayload & { isPremium: boolean }
    const limits = await getFreeLimits()

    if (!user.isPremium && !limits.friendsLeaderboard) {
      return reply.code(402).send({ success: false, error: 'Premium required for friends leaderboard' })
    }

    const following = await prisma.follow.findMany({
      where: { followerId: user.userId },
      select: { followingId: true },
    })
    const ids = [user.userId, ...following.map((f: { followingId: string }) => f.followingId)]

    const friends = await prisma.user.findMany({
      where: { id: { in: ids } },
      orderBy: { xp: 'desc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        avatarUrl: true,
        xp: true,
        streak: true,
      },
    })
    return reply.send({ success: true, data: friends })
  })

  fastify.post('/users/:id/follow', async (req, reply) => {
    const user = req.user as JwtPayload
    const { id } = req.params as { id: string }
    if (id === user.userId) return reply.code(400).send({ success: false, error: 'Cannot follow yourself' })

    await prisma.follow.upsert({
      where: { followerId_followingId: { followerId: user.userId, followingId: id } },
      update: {},
      create: { followerId: user.userId, followingId: id },
    })
    return reply.send({ success: true })
  })

  fastify.delete('/users/:id/follow', async (req, reply) => {
    const user = req.user as JwtPayload
    const { id } = req.params as { id: string }
    await prisma.follow.deleteMany({ where: { followerId: user.userId, followingId: id } })
    return reply.send({ success: true })
  })
}
