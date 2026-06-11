import { prisma } from '../lib/prisma'

/**
 * Creates a mutual follow between two users so they appear in each other's
 * friends leaderboard. Used when a referral lands or a duel is joined.
 * Never throws — a failed follow must not break the calling flow.
 */
export async function mutualFollow(userIdA: string, userIdB: string) {
  if (!userIdA || !userIdB || userIdA === userIdB) return
  try {
    await prisma.$transaction([
      prisma.follow.upsert({
        where: { followerId_followingId: { followerId: userIdA, followingId: userIdB } },
        update: {},
        create: { followerId: userIdA, followingId: userIdB },
      }),
      prisma.follow.upsert({
        where: { followerId_followingId: { followerId: userIdB, followingId: userIdA } },
        update: {},
        create: { followerId: userIdB, followingId: userIdA },
      }),
    ])
  } catch (err) {
    console.error('[Follow] mutualFollow failed:', err)
  }
}
