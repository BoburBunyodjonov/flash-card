import { prisma } from '../lib/prisma'
import { normalizePhone } from './auth.service'
import { assignWordsFromPack, type PackWordInput } from './my-words.service'

export class TeacherAuthError extends Error {
  statusCode: number
  constructor(message: string, statusCode = 403) {
    super(message)
    this.statusCode = statusCode
  }
}

export async function linkStaffToUser(userId: string, rawPhone: string) {
  const phone = normalizePhone(rawPhone)
  if (!phone) return []

  const staffRows = await prisma.integrationStaff.findMany({
    where: { phone, status: 'active' },
    include: { partner: { select: { slug: true, name: true, status: true } } },
  })

  const linked: string[] = []
  for (const s of staffRows) {
    if (s.partner.status !== 'active') continue
    if (!s.userId) {
      await prisma.integrationStaff.update({ where: { id: s.id }, data: { userId } })
    }
    linked.push(s.partner.slug)
  }
  return linked
}

export async function getTeacherProfiles(userId: string) {
  const staffList = await prisma.integrationStaff.findMany({
    where: { userId, status: 'active', partner: { status: 'active' } },
    include: {
      partner: { select: { id: true, name: true, slug: true } },
    },
  })
  if (!staffList.length) return []

  const profiles = []
  for (const staff of staffList) {
    const groupWhere =
      staff.role === 'admin'
        ? { partnerId: staff.partnerId, status: 'active' as const }
        : { partnerId: staff.partnerId, status: 'active' as const, teacherStaffId: staff.id }

    const groups = await prisma.integrationGroup.findMany({
      where: groupWhere,
      orderBy: { name: 'asc' },
      select: {
        externalId: true,
        name: true,
      },
    })

    const groupsWithCounts = await Promise.all(
      groups.map(async (g) => {
        const students = await prisma.integrationEnrollment.count({
          where: {
            partnerId: staff.partnerId,
            groupExternalId: g.externalId,
            status: 'active',
          },
        })
        return {
          external_id: g.externalId,
          name: g.name,
          students_count: students,
        }
      }),
    )

    profiles.push({
      staff_id: staff.id,
      partner_id: staff.partnerId,
      partner_name: staff.partner.name,
      partner_slug: staff.partner.slug,
      role: staff.role,
      groups: groupsWithCounts,
    })
  }
  return profiles
}

async function assertStaffAccess(userId: string, staffId: string) {
  const staff = await prisma.integrationStaff.findFirst({
    where: { id: staffId, userId, status: 'active', partner: { status: 'active' } },
    include: { partner: true },
  })
  if (!staff) throw new TeacherAuthError('Not authorized as teacher for this organization')
  return staff
}

async function assertGroupAccess(
  staff: { id: string; partnerId: string; role: string },
  groupExternalId: string,
) {
  const group = await prisma.integrationGroup.findUnique({
    where: { partnerId_externalId: { partnerId: staff.partnerId, externalId: groupExternalId } },
  })
  if (!group || group.status !== 'active') {
    throw new TeacherAuthError('Group not found', 404)
  }
  if (staff.role !== 'admin' && group.teacherStaffId !== staff.id) {
    throw new TeacherAuthError('You are not assigned to this group')
  }
  return group
}

export async function createWordPack(
  userId: string,
  staffId: string,
  data: { title: string; groupExternalId: string },
) {
  const staff = await assertStaffAccess(userId, staffId)
  await assertGroupAccess(staff, data.groupExternalId)

  return prisma.teacherWordPack.create({
    data: {
      partnerId: staff.partnerId,
      staffId: staff.id,
      groupExternalId: data.groupExternalId,
      title: data.title.trim(),
    },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  })
}

export async function listWordPacks(userId: string, staffId: string) {
  await assertStaffAccess(userId, staffId)
  return prisma.teacherWordPack.findMany({
    where: { staffId },
    orderBy: { createdAt: 'desc' },
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { items: true, deliveredWords: true } },
    },
  })
}

export async function addWordsToPack(
  userId: string,
  packId: string,
  words: PackWordInput[],
) {
  const pack = await prisma.teacherWordPack.findUnique({
    where: { id: packId },
    include: { staff: true },
  })
  if (!pack) throw new TeacherAuthError('Pack not found', 404)
  if (pack.staff.userId !== userId) throw new TeacherAuthError('Not your word pack')
  if (pack.status === 'published') throw new TeacherAuthError('Cannot edit a published pack', 400)

  const startOrder = await prisma.teacherWordPackItem.count({ where: { packId } })
  await prisma.teacherWordPackItem.createMany({
    data: words.map((w, i) => ({
      packId,
      word: w.word.trim(),
      translation: w.translation.trim(),
      pronunciation: w.pronunciation ?? null,
      definitionEn: w.definitionEn ?? null,
      exampleEn: w.exampleEn ?? null,
      sortOrder: startOrder + i,
    })),
  })

  return prisma.teacherWordPack.findUnique({
    where: { id: packId },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  })
}

export async function publishWordPack(userId: string, packId: string) {
  const pack = await prisma.teacherWordPack.findUnique({
    where: { id: packId },
    include: {
      staff: true,
      items: { orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!pack) throw new TeacherAuthError('Pack not found', 404)
  if (pack.staff.userId !== userId) throw new TeacherAuthError('Not your word pack')
  if (!pack.items.length) throw new TeacherAuthError('Add at least one word before publishing', 400)

  await assertGroupAccess(pack.staff, pack.groupExternalId)

  const enrollments = await prisma.integrationEnrollment.findMany({
    where: {
      partnerId: pack.partnerId,
      groupExternalId: pack.groupExternalId,
      status: 'active',
      userId: { not: null },
    },
    select: { userId: true },
  })

  const userIds = [...new Set(enrollments.map((e) => e.userId!).filter(Boolean))]
  let delivered = 0
  let skipped = 0

  for (const studentUserId of userIds) {
    const result = await assignWordsFromPack(
      studentUserId,
      pack.id,
      pack.items.map((item) => ({
        word: item.word,
        translation: item.translation,
        pronunciation: item.pronunciation,
        definitionEn: item.definitionEn,
        exampleEn: item.exampleEn,
      })),
    )
    delivered += result.added
    skipped += result.skipped
  }

  await prisma.teacherWordPack.update({
    where: { id: packId },
    data: { status: 'published', publishedAt: new Date() },
  })

  return {
    pack_id: packId,
    group_external_id: pack.groupExternalId,
    students_count: userIds.length,
    words_added: delivered,
    words_skipped_existing: skipped,
    published_at: new Date().toISOString(),
  }
}

export async function isTeacher(userId: string): Promise<boolean> {
  const count = await prisma.integrationStaff.count({
    where: { userId, status: 'active', partner: { status: 'active' } },
  })
  return count > 0
}
