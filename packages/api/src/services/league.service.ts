import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'
import { redis } from '../lib/redis'
import {
  LEAGUE_GROUP_SIZE,
  LEAGUE_PROMOTE_COUNT,
  LEAGUE_DEMOTE_COUNT,
  LEAGUE_TIERS,
} from '@wordswipe/shared'

const MAX_TIER = LEAGUE_TIERS.length - 1

/** Monday 00:00 UTC of the week containing `date`. */
export function getWeekStart(date = new Date()): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay() // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1
  d.setUTCDate(d.getUTCDate() - diff)
  return d
}

/**
 * Lazily places a user into a league group for the current week.
 * Groups fill up to LEAGUE_GROUP_SIZE per tier; a new group opens when full.
 */
export async function ensureMembership(userId: string) {
  const weekStart = getWeekStart()

  const existing = await prisma.leagueMember.findUnique({
    where: { userId_weekStart: { userId, weekStart } },
  })
  if (existing) return existing

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { leagueTier: true } })
  const tier = user?.leagueTier ?? 0

  const groups = await prisma.leagueMember.groupBy({
    by: ['groupId'],
    where: { weekStart, tier },
    _count: { _all: true },
  })
  const open = groups.find((g) => g._count._all < LEAGUE_GROUP_SIZE)
  const groupId = open?.groupId ?? randomUUID()

  return prisma.leagueMember.create({
    data: { userId, weekStart, groupId, tier },
  })
}

/** Adds XP to the user's current-week league entry. Never throws — league must not break swipes. */
export async function addLeagueXp(userId: string, xp: number) {
  if (xp <= 0) return
  try {
    const member = await ensureMembership(userId)
    await prisma.leagueMember.update({
      where: { id: member.id },
      data: { weeklyXp: { increment: xp } },
    })
  } catch (err) {
    console.error('[League] Failed to add XP:', err)
  }
}

export async function getMyLeague(userId: string) {
  const member = await ensureMembership(userId)

  const members = await prisma.leagueMember.findMany({
    where: { groupId: member.groupId, weekStart: member.weekStart },
    orderBy: { weeklyXp: 'desc' },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, username: true, avatarUrl: true, streak: true } },
    },
  })

  const weekEnd = new Date(member.weekStart)
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7)

  return {
    tier: member.tier,
    tierName: LEAGUE_TIERS[member.tier] ?? LEAGUE_TIERS[0],
    maxTier: MAX_TIER,
    weekStart: member.weekStart,
    weekEnd,
    promoteCount: LEAGUE_PROMOTE_COUNT,
    demoteCount: LEAGUE_DEMOTE_COUNT,
    myRank: members.findIndex((m) => m.userId === userId) + 1,
    members: members.map((m, i) => ({
      rank: i + 1,
      userId: m.userId,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      username: m.user.username,
      avatarUrl: m.user.avatarUrl,
      streak: m.user.streak,
      weeklyXp: m.weeklyXp,
      isMe: m.userId === userId,
    })),
  }
}

/**
 * Finalizes the previous week: promotes the top, demotes the bottom of each group,
 * and persists the user's new tier. Idempotent via Redis lock + finalRank check.
 */
export async function finalizeLastWeek() {
  const lastWeek = getWeekStart(new Date(Date.now() - 7 * 86400_000))
  const lockKey = `league:finalized:${lastWeek.toISOString().slice(0, 10)}`
  const acquired = await redis.set(lockKey, '1', 'EX', 14 * 86400, 'NX')
  if (acquired !== 'OK') return

  const groups = await prisma.leagueMember.groupBy({
    by: ['groupId'],
    where: { weekStart: lastWeek, finalRank: null },
  })

  for (const { groupId } of groups) {
    const members = await prisma.leagueMember.findMany({
      where: { groupId, weekStart: lastWeek },
      orderBy: { weeklyXp: 'desc' },
    })

    for (let i = 0; i < members.length; i++) {
      const m = members[i]
      const rank = i + 1
      let newTier = m.tier

      if (rank <= LEAGUE_PROMOTE_COUNT && m.weeklyXp > 0) {
        newTier = Math.min(m.tier + 1, MAX_TIER)
      } else if (rank > members.length - LEAGUE_DEMOTE_COUNT && members.length > LEAGUE_DEMOTE_COUNT) {
        newTier = Math.max(m.tier - 1, 0)
      }

      await prisma.leagueMember.update({ where: { id: m.id }, data: { finalRank: rank } })
      if (newTier !== m.tier) {
        await prisma.user.update({ where: { id: m.userId }, data: { leagueTier: newTier } })
      }
    }
  }

  console.log(`[League] Finalized week ${lastWeek.toISOString().slice(0, 10)} (${groups.length} groups)`)
}
