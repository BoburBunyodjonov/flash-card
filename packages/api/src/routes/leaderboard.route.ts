import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middlewares/auth.middleware'
import { prisma } from '../lib/prisma'
import { getFreeLimits } from '../services/plan-settings.service'
import { notificationQueue } from '../jobs'
import type { JwtPayload } from '@wordswipe/shared'

// Telegram ping sent to a user when someone new follows them.
const newFollowerMessages: Record<string, (follower: string) => string> = {
  uz: (f) => `👤 ${f} sizni kuzatishni boshladi! Profilini ko'rib, siz ham kuzating.`,
  en: (f) => `👤 ${f} started following you! Check their profile and follow back.`,
  ru: (f) => `👤 ${f} подписался на вас! Загляните в профиль и подпишитесь в ответ.`,
}

/**
 * Notifies the followed user via the Telegram bot. Fire-and-forget — never
 * blocks or breaks the follow action. Only call this for brand-new follows.
 */
async function notifyNewFollower(followerId: string, followingId: string) {
  const [follower, target] = await Promise.all([
    prisma.user.findUnique({ where: { id: followerId }, select: { firstName: true } }),
    prisma.user.findUnique({
      where: { id: followingId },
      select: { telegramId: true, language: true, notifyEnabled: true },
    }),
  ])
  if (!follower || !target?.telegramId || !target.notifyEnabled) return
  const text = (newFollowerMessages[target.language] ?? newFollowerMessages.en)(follower.firstName)
  await notificationQueue.add(
    'bulk-message',
    { telegramIds: [target.telegramId.toString()], message: text },
    { removeOnComplete: true, removeOnFail: 50, attempts: 2 },
  )
}

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

  // Who follows me — lets users see and follow back. Newest followers first;
  // isFollowing flags the ones I already follow (so the UI can hide "follow back").
  fastify.get('/followers', async (req, reply) => {
    const user = req.user as JwtPayload
    const [followers, iFollow] = await Promise.all([
      prisma.follow.findMany({
        where: { followingId: user.userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          createdAt: true,
          follower: {
            select: { id: true, firstName: true, lastName: true, username: true, avatarUrl: true, xp: true, streak: true },
          },
        },
      }),
      prisma.follow.findMany({ where: { followerId: user.userId }, select: { followingId: true } }),
    ])
    const followingIds = new Set(iFollow.map((f: { followingId: string }) => f.followingId))
    const data = followers.map((f) => ({ ...f.follower, followedAt: f.createdAt, isFollowing: followingIds.has(f.follower.id) }))
    return reply.send({ success: true, data })
  })

  fastify.post('/users/:id/follow', async (req, reply) => {
    const user = req.user as JwtPayload
    const { id } = req.params as { id: string }
    if (id === user.userId) return reply.code(400).send({ success: false, error: 'Cannot follow yourself' })

    // Detect whether this is a brand-new follow so we only notify once.
    const existing = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: user.userId, followingId: id } },
    })

    await prisma.follow.upsert({
      where: { followerId_followingId: { followerId: user.userId, followingId: id } },
      update: {},
      create: { followerId: user.userId, followingId: id },
    })

    if (!existing) {
      notifyNewFollower(user.userId, id).catch((err) =>
        fastify.log.error({ msg: 'follow: notify failed', followerId: user.userId, followingId: id, err }),
      )
    }
    return reply.send({ success: true })
  })

  fastify.delete('/users/:id/follow', async (req, reply) => {
    const user = req.user as JwtPayload
    const { id } = req.params as { id: string }
    await prisma.follow.deleteMany({ where: { followerId: user.userId, followingId: id } })
    return reply.send({ success: true })
  })
}
