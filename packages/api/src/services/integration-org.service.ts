import type { Prisma } from '@prisma/client'
import type {
  IntegrationGroupInput,
  IntegrationGroupSyncResult,
  IntegrationStaffInput,
  IntegrationStaffSyncResult,
  IntegrationSyncError,
  SyncMode,
} from '@wordswipe/shared'
import { INTEGRATION_ERROR_CODES } from '@wordswipe/shared'
import { prisma } from '../lib/prisma'
import { normalizePhone } from './auth.service'

function parseStaff(input: IntegrationStaffInput, errors: IntegrationSyncError[]) {
  const externalId = input.external_id?.trim()
  if (!externalId) {
    errors.push({
      external_id: input.external_id ?? '',
      code: INTEGRATION_ERROR_CODES.VALIDATION,
      message: 'external_id is required',
    })
    return null
  }
  const phone = normalizePhone(input.phone)
  if (!phone) {
    errors.push({
      external_id: externalId,
      code: INTEGRATION_ERROR_CODES.INVALID_PHONE,
      message: 'Invalid phone',
    })
    return null
  }
  return {
    externalId,
    phone,
    firstName: input.first_name?.trim() || null,
    lastName: input.last_name?.trim() || null,
    role: input.role === 'admin' ? ('admin' as const) : ('teacher' as const),
    status: input.status === 'inactive' ? ('inactive' as const) : ('active' as const),
    metadata: input.metadata ?? null,
  }
}

export async function syncStaff(
  partnerId: string,
  staff: IntegrationStaffInput[],
  mode: SyncMode,
): Promise<IntegrationStaffSyncResult> {
  const result: IntegrationStaffSyncResult = {
    created: 0,
    updated: 0,
    deactivated: 0,
    unchanged: 0,
    errors: [],
  }
  const activeIds: string[] = []

  for (const input of staff) {
    const parsed = parseStaff(input, result.errors)
    if (!parsed) continue

    const existing = await prisma.integrationStaff.findUnique({
      where: { partnerId_externalId: { partnerId, externalId: parsed.externalId } },
    })

    if (!existing) {
      const phoneOwner = await prisma.integrationStaff.findUnique({
        where: { partnerId_phone: { partnerId, phone: parsed.phone } },
      })
      if (phoneOwner) {
        result.errors.push({
          external_id: parsed.externalId,
          code: INTEGRATION_ERROR_CODES.DUPLICATE_PHONE,
          message: 'Phone already used by another staff member',
        })
        continue
      }
      await prisma.integrationStaff.create({
        data: {
          partnerId,
          externalId: parsed.externalId,
          phone: parsed.phone,
          firstName: parsed.firstName,
          lastName: parsed.lastName,
          role: parsed.role,
          status: parsed.status,
          metadata: (parsed.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      })
      result.created++
      if (parsed.status === 'active') activeIds.push(parsed.externalId)
      continue
    }

    const changed =
      existing.phone !== parsed.phone ||
      existing.firstName !== parsed.firstName ||
      existing.lastName !== parsed.lastName ||
      existing.role !== parsed.role ||
      existing.status !== parsed.status

    if (!changed) {
      result.unchanged++
      if (parsed.status === 'active') activeIds.push(parsed.externalId)
      continue
    }

    await prisma.integrationStaff.update({
      where: { id: existing.id },
      data: {
        phone: parsed.phone,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        role: parsed.role,
        status: parsed.status,
        metadata: (parsed.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    })
    result.updated++
    if (parsed.status === 'active') activeIds.push(parsed.externalId)
  }

  if (mode === 'replace' && result.errors.length === 0) {
    const rows = await prisma.integrationStaff.findMany({
      where: { partnerId, status: 'active', externalId: { notIn: activeIds } },
      select: { id: true },
    })
    if (rows.length) {
      await prisma.integrationStaff.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { status: 'inactive' },
      })
      result.deactivated = rows.length
    }
  }

  return result
}

export async function syncGroups(
  partnerId: string,
  groups: IntegrationGroupInput[],
  mode: SyncMode,
): Promise<IntegrationGroupSyncResult> {
  const result: IntegrationGroupSyncResult = {
    created: 0,
    updated: 0,
    deactivated: 0,
    unchanged: 0,
    errors: [],
  }
  const activeIds: string[] = []

  for (const input of groups) {
    const externalId = input.external_id?.trim()
    if (!externalId) {
      result.errors.push({
        external_id: input.external_id ?? '',
        code: INTEGRATION_ERROR_CODES.VALIDATION,
        message: 'external_id is required',
      })
      continue
    }

    let teacherStaffId: string | null = null
    if (input.teacher_external_id?.trim()) {
      const teacher = await prisma.integrationStaff.findUnique({
        where: {
          partnerId_externalId: { partnerId, externalId: input.teacher_external_id.trim() },
        },
      })
      if (!teacher) {
        result.errors.push({
          external_id: externalId,
          code: INTEGRATION_ERROR_CODES.NOT_FOUND,
          message: `teacher_external_id ${input.teacher_external_id} not found — sync staff first`,
        })
        continue
      }
      teacherStaffId = teacher.id
    }

    const name = input.name?.trim() || externalId
    const status = input.status === 'inactive' ? ('inactive' as const) : ('active' as const)

    const existing = await prisma.integrationGroup.findUnique({
      where: { partnerId_externalId: { partnerId, externalId } },
    })

    if (!existing) {
      await prisma.integrationGroup.create({
        data: {
          partnerId,
          externalId,
          name,
          teacherStaffId,
          status,
          metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      })
      result.created++
      if (status === 'active') activeIds.push(externalId)
      continue
    }

    const changed =
      existing.name !== name ||
      existing.teacherStaffId !== teacherStaffId ||
      existing.status !== status

    if (!changed) {
      result.unchanged++
      if (status === 'active') activeIds.push(externalId)
      continue
    }

    await prisma.integrationGroup.update({
      where: { id: existing.id },
      data: {
        name,
        teacherStaffId,
        status,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    })
    result.updated++
    if (status === 'active') activeIds.push(externalId)
  }

  if (mode === 'replace' && result.errors.length === 0) {
    const rows = await prisma.integrationGroup.findMany({
      where: { partnerId, status: 'active', externalId: { notIn: activeIds } },
      select: { id: true },
    })
    if (rows.length) {
      await prisma.integrationGroup.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { status: 'inactive' },
      })
      result.deactivated = rows.length
    }
  }

  return result
}
