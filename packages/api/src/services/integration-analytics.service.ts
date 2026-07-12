import { prisma } from '../lib/prisma'

export interface LearnerProgressSnapshot {
  external_id: string
  first_name: string | null
  last_name: string | null
  phone: string
  linked: boolean
  user_id: string | null
  streak: number
  xp: number
  words_count: number
  words_due: number
  last_active: string | null
}

type EnrollmentWithUser = {
  externalId: string
  firstName: string | null
  lastName: string | null
  phone: string
  userId: string | null
  user: {
    id: string
    streak: number
    xp: number
    lastActive: Date | null
    _count: { userWords: number }
  } | null
}

async function dueCountsByUser(userIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (!userIds.length) return map

  const rows = await prisma.userWord.groupBy({
    by: ['userId'],
    where: {
      userId: { in: userIds },
      status: { not: 'mastered' },
      nextReview: { lte: new Date() },
    },
    _count: { _all: true },
  })
  for (const row of rows) {
    map.set(row.userId, row._count._all)
  }
  return map
}

function toProgressSnapshot(
  enrollment: EnrollmentWithUser,
  dueByUser: Map<string, number>,
): LearnerProgressSnapshot {
  return {
    external_id: enrollment.externalId,
    first_name: enrollment.firstName,
    last_name: enrollment.lastName,
    phone: enrollment.phone,
    linked: !!enrollment.userId,
    user_id: enrollment.userId,
    streak: enrollment.user?.streak ?? 0,
    xp: enrollment.user?.xp ?? 0,
    words_count: enrollment.user?._count.userWords ?? 0,
    words_due: enrollment.userId ? (dueByUser.get(enrollment.userId) ?? 0) : 0,
    last_active: enrollment.user?.lastActive?.toISOString() ?? null,
  }
}

const enrollmentInclude = {
  user: {
    select: {
      id: true,
      streak: true,
      xp: true,
      lastActive: true,
      _count: { select: { userWords: true } },
    },
  },
} as const

export async function buildLearnerProgressSnapshot(
  partnerId: string,
  externalId: string,
): Promise<LearnerProgressSnapshot | null> {
  const enrollment = await prisma.integrationEnrollment.findUnique({
    where: { partnerId_externalId: { partnerId, externalId } },
    include: enrollmentInclude,
  })
  if (!enrollment) return null

  const dueByUser = enrollment.userId
    ? await dueCountsByUser([enrollment.userId])
    : new Map<string, number>()
  return toProgressSnapshot(enrollment, dueByUser)
}

export async function listPartnerGroups(partnerId: string) {
  const groups = await prisma.integrationGroup.findMany({
    where: { partnerId, status: 'active' },
    orderBy: { name: 'asc' },
    select: {
      externalId: true,
      name: true,
      teacherStaffId: true,
      teacher: { select: { externalId: true, firstName: true, lastName: true } },
    },
  })

  const counts = await prisma.integrationEnrollment.groupBy({
    by: ['groupExternalId'],
    where: { partnerId, status: 'active', groupExternalId: { not: null } },
    _count: { _all: true },
  })
  const countMap = new Map(
    counts.map((c) => [c.groupExternalId!, c._count._all]),
  )

  const linkedCounts = await prisma.integrationEnrollment.groupBy({
    by: ['groupExternalId'],
    where: {
      partnerId,
      status: 'active',
      groupExternalId: { not: null },
      userId: { not: null },
    },
    _count: { _all: true },
  })
  const linkedMap = new Map(
    linkedCounts.map((c) => [c.groupExternalId!, c._count._all]),
  )

  return groups.map((g) => ({
    external_id: g.externalId,
    name: g.name,
    teacher_external_id: g.teacher?.externalId ?? null,
    teacher_name: g.teacher
      ? [g.teacher.firstName, g.teacher.lastName].filter(Boolean).join(' ') || null
      : null,
    students_total: countMap.get(g.externalId) ?? 0,
    students_linked: linkedMap.get(g.externalId) ?? 0,
  }))
}

export async function getGroupRecord(partnerId: string, groupExternalId: string) {
  const group = await prisma.integrationGroup.findUnique({
    where: { partnerId_externalId: { partnerId, externalId: groupExternalId } },
    select: {
      externalId: true,
      name: true,
      status: true,
      teacher: { select: { externalId: true, firstName: true, lastName: true } },
    },
  })
  if (!group) return null
  return {
    external_id: group.externalId,
    name: group.name,
    status: group.status,
    teacher_external_id: group.teacher?.externalId ?? null,
    teacher_name: group.teacher
      ? [group.teacher.firstName, group.teacher.lastName].filter(Boolean).join(' ') || null
      : null,
  }
}

export async function getGroupSummary(partnerId: string, groupExternalId: string) {
  const group = await getGroupRecord(partnerId, groupExternalId)
  if (!group) return null

  const enrollments = await prisma.integrationEnrollment.findMany({
    where: {
      partnerId,
      groupExternalId,
      status: 'active',
    },
    include: enrollmentInclude,
  })

  const userIds = enrollments.map((e) => e.userId).filter((id): id is string => !!id)
  const dueByUser = await dueCountsByUser(userIds)

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  let totalXp = 0
  let totalStreak = 0
  let totalWords = 0
  let totalDue = 0
  let linked = 0
  let activeLast7Days = 0

  for (const e of enrollments) {
    if (!e.userId) continue
    linked++
    totalXp += e.user?.xp ?? 0
    totalStreak += e.user?.streak ?? 0
    totalWords += e.user?._count.userWords ?? 0
    totalDue += dueByUser.get(e.userId) ?? 0
    if (e.user?.lastActive && e.user.lastActive >= sevenDaysAgo) {
      activeLast7Days++
    }
  }

  const studentsTotal = enrollments.length
  const divisor = linked || 1

  return {
    group,
    students_total: studentsTotal,
    students_linked: linked,
    students_unlinked: studentsTotal - linked,
    active_last_7_days: activeLast7Days,
    avg_xp: linked ? Math.round(totalXp / linked) : 0,
    avg_streak: linked ? Math.round((totalStreak / linked) * 10) / 10 : 0,
    avg_words_count: linked ? Math.round(totalWords / linked) : 0,
    total_words_due: totalDue,
    link_rate: studentsTotal ? Math.round((linked / studentsTotal) * 1000) / 10 : 0,
  }
}

export async function getGroupLearnersProgress(
  partnerId: string,
  groupExternalId: string,
  opts?: { status?: 'active' | 'inactive' | 'all' },
) {
  const group = await prisma.integrationGroup.findUnique({
    where: { partnerId_externalId: { partnerId, externalId: groupExternalId } },
    select: { externalId: true, name: true },
  })
  if (!group) return null

  const statusFilter =
    opts?.status === 'all' ? undefined : opts?.status === 'inactive' ? 'inactive' : 'active'

  const enrollments = await prisma.integrationEnrollment.findMany({
    where: {
      partnerId,
      groupExternalId,
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    include: enrollmentInclude,
  })

  const userIds = enrollments.map((e) => e.userId).filter((id): id is string => !!id)
  const dueByUser = await dueCountsByUser(userIds)

  return {
    group_external_id: group.externalId,
    group_name: group.name,
    learners: enrollments.map((e) => toProgressSnapshot(e, dueByUser)),
  }
}
