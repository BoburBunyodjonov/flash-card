import { prisma } from '../lib/prisma'

export async function getOverallProgress(userId: string) {
  const [total, byStatus, user] = await Promise.all([
    prisma.userWordProgress.count({ where: { userId } }),
    prisma.userWordProgress.groupBy({
      by: ['status'],
      where: { userId },
      _count: true,
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { streak: true, streakFreezes: true, xp: true },
    }),
  ])

  const statusMap = Object.fromEntries(
    (byStatus as Array<{ status: string; _count: number }>).map((s) => [s.status, s._count]),
  )

  const savedDeck = await prisma.userDeck.findFirst({
    where: { userId, isDefault: true },
    include: { _count: { select: { words: true } } },
  })
  const savedWords = savedDeck?._count?.words ?? 0

  return {
    totalWordsEncountered: total,
    new: statusMap['new'] ?? 0,
    learning: statusMap['learning'] ?? 0,
    learned: statusMap['learned'] ?? 0,
    mastered: statusMap['mastered'] ?? 0,
    streak: user?.streak ?? 0,
    streakFreezes: user?.streakFreezes ?? 0,
    xp: user?.xp ?? 0,
    savedWords,
  }
}

export async function getWeakWords(userId: string, limit = 20) {
  return prisma.userWordProgress.findMany({
    where: { userId, status: { in: ['new', 'learning'] } },
    orderBy: { strength: 'asc' },
    take: limit,
    include: {
      word: {
        include: { translations: true, category: true },
      },
    },
  })
}

export async function getHistory(userId: string, period: 'week' | 'month' | '3months') {
  const days = period === 'week' ? 7 : period === 'month' ? 30 : 90
  const since = new Date()
  since.setDate(since.getDate() - days)

  const progress = await prisma.userWordProgress.findMany({
    where: {
      userId,
      lastReviewed: { gte: since },
    },
    select: { lastReviewed: true, status: true },
  })

  const grouped: Record<string, { learned: number; reviewed: number }> = {}

  for (const p of progress) {
    if (!p.lastReviewed) continue
    const date = p.lastReviewed.toISOString().split('T')[0]
    if (!grouped[date]) grouped[date] = { learned: 0, reviewed: 0 }
    grouped[date].reviewed++
    if (p.status === 'learned' || p.status === 'mastered') grouped[date].learned++
  }

  return grouped
}
