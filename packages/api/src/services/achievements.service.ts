import { prisma } from '../lib/prisma'
import { addLeagueXp } from './league.service'

// Server-side achievement definitions. Codes match the badge list rendered by
// the web Progress page; each grants a one-time XP reward when first unlocked.
interface Stats {
  encountered: number
  learnedTotal: number
  mastered: number
  streak: number
  xp: number
  savedWords: number
}

interface AchievementDef {
  code: string
  xp: number
  test: (s: Stats) => boolean
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { code: 'first_word', xp: 5, test: (s) => s.encountered >= 1 },
  { code: 'streak_3', xp: 10, test: (s) => s.streak >= 3 },
  { code: 'streak_7', xp: 25, test: (s) => s.streak >= 7 },
  { code: 'streak_30', xp: 100, test: (s) => s.streak >= 30 },
  { code: 'words_10', xp: 15, test: (s) => s.learnedTotal >= 10 },
  { code: 'words_50', xp: 50, test: (s) => s.learnedTotal >= 50 },
  { code: 'words_100', xp: 100, test: (s) => s.learnedTotal >= 100 },
  { code: 'xp_100', xp: 10, test: (s) => s.xp >= 100 },
  { code: 'xp_1000', xp: 50, test: (s) => s.xp >= 1000 },
  { code: 'master_10', xp: 30, test: (s) => s.mastered >= 10 },
  { code: 'saved_5', xp: 10, test: (s) => s.savedWords >= 5 },
  { code: 'b1_reached', xp: 25, test: (s) => s.learnedTotal >= 50 },
]

const TOTAL_REWARD_XP = ACHIEVEMENTS.reduce((sum, a) => sum + a.xp, 0)
export { TOTAL_REWARD_XP }

async function computeStats(userId: string): Promise<Stats> {
  const [encountered, learnedTotal, mastered, user, savedDeck] = await Promise.all([
    prisma.userWordProgress.count({ where: { userId } }),
    prisma.userWordProgress.count({ where: { userId, status: { in: ['learned', 'mastered'] } } }),
    prisma.userWordProgress.count({ where: { userId, status: 'mastered' } }),
    prisma.user.findUnique({ where: { id: userId }, select: { streak: true, xp: true } }),
    prisma.userDeck.findFirst({ where: { userId, isDefault: true }, include: { _count: { select: { words: true } } } }),
  ])
  return {
    encountered,
    learnedTotal,
    mastered,
    streak: user?.streak ?? 0,
    xp: user?.xp ?? 0,
    savedWords: savedDeck?._count?.words ?? 0,
  }
}

export interface AchievementStatus {
  code: string
  xp: number
  unlocked: boolean
  unlockedAt: string | null
}

/**
 * Unlocks any newly-earned achievements (idempotent via the unique constraint),
 * awards their XP exactly once, and returns the full badge list plus the codes
 * unlocked on this call (so the caller can congratulate the user).
 */
export async function syncAchievements(
  userId: string,
): Promise<{ list: AchievementStatus[]; newlyUnlocked: string[]; awardedXp: number }> {
  const [stats, existing] = await Promise.all([
    computeStats(userId),
    prisma.userAchievement.findMany({ where: { userId }, select: { code: true, unlockedAt: true } }),
  ])

  const unlockedAt = new Map(existing.map((e) => [e.code, e.unlockedAt]))
  const newlyUnlocked: string[] = []
  let awardedXp = 0

  for (const a of ACHIEVEMENTS) {
    if (unlockedAt.has(a.code)) continue
    if (!a.test(stats)) continue
    try {
      const row = await prisma.userAchievement.create({ data: { userId, code: a.code } })
      unlockedAt.set(a.code, row.unlockedAt)
      newlyUnlocked.push(a.code)
      awardedXp += a.xp
    } catch {
      // Unique-constraint race — another request already unlocked it; skip.
    }
  }

  if (awardedXp > 0) {
    await prisma.user.update({ where: { id: userId }, data: { xp: { increment: awardedXp } } })
    await addLeagueXp(userId, awardedXp)
  }

  const list: AchievementStatus[] = ACHIEVEMENTS.map((a) => ({
    code: a.code,
    xp: a.xp,
    unlocked: unlockedAt.has(a.code),
    unlockedAt: unlockedAt.get(a.code)?.toISOString() ?? null,
  }))

  return { list, newlyUnlocked, awardedXp }
}
