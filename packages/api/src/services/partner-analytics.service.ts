import { prisma } from '../lib/prisma'
import {
  getGroupSummary,
  listPartnerGroups,
} from './integration-analytics.service'

export async function getPartnerAnalyticsOverview(partnerId: string) {
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      premiumIncluded: true,
      accessMode: true,
    },
  })
  if (!partner) return null

  const [
    studentsTotal,
    studentsLinked,
    studentsActive,
    staffCount,
    groupsCount,
    linkedUsers,
  ] = await Promise.all([
    prisma.integrationEnrollment.count({ where: { partnerId } }),
    prisma.integrationEnrollment.count({ where: { partnerId, userId: { not: null } } }),
    prisma.integrationEnrollment.count({ where: { partnerId, status: 'active' } }),
    prisma.integrationStaff.count({ where: { partnerId, status: 'active' } }),
    prisma.integrationGroup.count({ where: { partnerId, status: 'active' } }),
    prisma.integrationEnrollment.findMany({
      where: { partnerId, userId: { not: null }, status: 'active' },
      select: {
        user: { select: { xp: true, streak: true, lastActive: true } },
      },
    }),
  ])

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  let totalXp = 0
  let totalStreak = 0
  let activeLast7 = 0
  for (const row of linkedUsers) {
    totalXp += row.user?.xp ?? 0
    totalStreak += row.user?.streak ?? 0
    if (row.user?.lastActive && row.user.lastActive >= sevenDaysAgo) activeLast7++
  }
  const linked = linkedUsers.length || 1

  const groups = await listPartnerGroups(partnerId)

  return {
    partner,
    overview: {
      students_total: studentsTotal,
      students_active: studentsActive,
      students_linked: studentsLinked,
      students_unlinked: studentsActive - Math.min(studentsLinked, studentsActive),
      link_rate: studentsActive
        ? Math.round((Math.min(studentsLinked, studentsActive) / studentsActive) * 1000) / 10
        : 0,
      staff_count: staffCount,
      groups_count: groupsCount,
      active_last_7_days: activeLast7,
      avg_xp: linkedUsers.length ? Math.round(totalXp / linked) : 0,
      avg_streak: linkedUsers.length ? Math.round((totalStreak / linked) * 10) / 10 : 0,
    },
    groups,
  }
}

export async function getPartnerGroupAnalytics(partnerId: string, groupExternalId: string) {
  return getGroupSummary(partnerId, groupExternalId)
}
