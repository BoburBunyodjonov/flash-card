import { prisma } from '../lib/prisma'

export async function getOverallProgress(userId: string) {
  const [total, byStatus, user] = await Promise.all([
    prisma.userWord.count({ where: { userId } }),
    prisma.userWord.groupBy({
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

  return {
    totalWordsEncountered: total,
    new: statusMap['new'] ?? 0,
    learning: statusMap['learning'] ?? 0,
    learned: statusMap['learned'] ?? 0,
    mastered: statusMap['mastered'] ?? 0,
    streak: user?.streak ?? 0,
    streakFreezes: user?.streakFreezes ?? 0,
    xp: user?.xp ?? 0,
    savedWords: total,
  }
}

export async function getWeakWords(userId: string, limit = 20) {
  const rows = await prisma.userWord.findMany({
    where: { userId, status: { in: ['new', 'learning'] } },
    orderBy: { strength: 'asc' },
    take: limit,
  })

  return (rows as any[]).map((uw) => ({
    id: uw.id,
    strength: uw.strength,
    word: {
      id: uw.id,
      word: uw.word,
      pronunciation: uw.pronunciation,
      partOfSpeech: uw.partOfSpeech,
      difficulty: null,
      translations: [{
        translation: uw.translation,
        definitionEn: uw.definitionEn,
        exampleEn: uw.exampleEn,
      }],
      category: null,
    },
  }))
}

export async function getHistory(userId: string, period: 'week' | 'month' | '3months') {
  const days = period === 'week' ? 7 : period === 'month' ? 30 : 90
  const since = new Date()
  since.setDate(since.getDate() - days)

  const reviews = await prisma.userWord.findMany({
    where: {
      userId,
      lastReviewed: { gte: since },
    },
    select: { lastReviewed: true, status: true },
  })

  const grouped: Record<string, { learned: number; reviewed: number }> = {}

  for (const r of reviews) {
    if (!r.lastReviewed) continue
    const date = r.lastReviewed.toISOString().split('T')[0]
    if (!grouped[date]) grouped[date] = { learned: 0, reviewed: 0 }
    grouped[date].reviewed++
    if (r.status === 'learned' || r.status === 'mastered') grouped[date].learned++
  }

  return grouped
}
