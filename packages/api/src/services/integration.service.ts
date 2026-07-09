import type { Prisma } from '@prisma/client'
import type {
  IntegrationLearnerInput,
  IntegrationSyncError,
  IntegrationSyncResult,
  SyncMode,
} from '@wordswipe/shared'
import { INTEGRATION_ERROR_CODES } from '@wordswipe/shared'
import { prisma } from '../lib/prisma'
import { normalizePhone } from './auth.service'
import { applyPartnerBenefitsForUser } from './partner-enrollment.service'
import { dispatchPartnerWebhook } from './partner-webhook.service'

export interface LearnerRecord {
  external_id: string
  phone: string
  first_name: string | null
  last_name: string | null
  status: string
  group: { external_id: string | null; name: string | null } | null
  user_id: string | null
  linked: boolean
  metadata: Record<string, unknown> | null
  enrolled_at: string
  updated_at: string
}

function toLearnerRecord(row: {
  externalId: string
  phone: string
  firstName: string | null
  lastName: string | null
  status: string
  groupExternalId: string | null
  groupName: string | null
  userId: string | null
  metadata: unknown
  enrolledAt: Date
  updatedAt: Date
}): LearnerRecord {
  return {
    external_id: row.externalId,
    phone: row.phone,
    first_name: row.firstName,
    last_name: row.lastName,
    status: row.status,
    group:
      row.groupName || row.groupExternalId
        ? { external_id: row.groupExternalId, name: row.groupName }
        : null,
    user_id: row.userId,
    linked: !!row.userId,
    metadata: (row.metadata as Record<string, unknown>) ?? null,
    enrolled_at: row.enrolledAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

function parseLearner(
  input: IntegrationLearnerInput,
  errors: IntegrationSyncError[],
): {
  externalId: string
  phone: string
  firstName: string | null
  lastName: string | null
  status: 'active' | 'inactive'
  groupExternalId: string | null
  groupName: string | null
  metadata: Record<string, unknown> | null
} | null {
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
      message: 'Invalid Uzbek phone (use 9 digits or +998XXXXXXXXX)',
    })
    return null
  }

  const status = input.status === 'inactive' ? 'inactive' : 'active'
  return {
    externalId,
    phone,
    firstName: input.first_name?.trim() || null,
    lastName: input.last_name?.trim() || null,
    status,
    groupExternalId: input.group?.external_id?.trim() || null,
    groupName: input.group?.name?.trim() || null,
    metadata: input.metadata ?? null,
  }
}

export async function syncLearners(
  partnerId: string,
  learners: IntegrationLearnerInput[],
  mode: SyncMode,
): Promise<IntegrationSyncResult> {
  const result: IntegrationSyncResult = {
    created: 0,
    updated: 0,
    deactivated: 0,
    unchanged: 0,
    errors: [],
  }

  const seenExternal = new Set<string>()
  const activeExternalIds: string[] = []

  for (const input of learners) {
    if (seenExternal.has(input.external_id)) {
      result.errors.push({
        external_id: input.external_id,
        code: INTEGRATION_ERROR_CODES.DUPLICATE_EXTERNAL_ID,
        message: 'Duplicate external_id in batch',
      })
      continue
    }
    seenExternal.add(input.external_id)

    const parsed = parseLearner(input, result.errors)
    if (!parsed) continue

    const existing = await prisma.integrationEnrollment.findUnique({
      where: {
        partnerId_externalId: { partnerId, externalId: parsed.externalId },
      },
    })

    if (!existing) {
      const phoneOwner = await prisma.integrationEnrollment.findUnique({
        where: { partnerId_phone: { partnerId, phone: parsed.phone } },
      })
      if (phoneOwner && phoneOwner.externalId !== parsed.externalId) {
        result.errors.push({
          external_id: parsed.externalId,
          code: INTEGRATION_ERROR_CODES.DUPLICATE_PHONE,
          message: 'Phone already used by another learner in this organization',
        })
        continue
      }

      await prisma.integrationEnrollment.create({
        data: {
          partnerId,
          externalId: parsed.externalId,
          phone: parsed.phone,
          firstName: parsed.firstName,
          lastName: parsed.lastName,
          groupExternalId: parsed.groupExternalId,
          groupName: parsed.groupName,
          status: parsed.status,
          metadata: (parsed.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          deactivatedAt: parsed.status === 'inactive' ? new Date() : null,
        },
      })
      result.created++
      if (parsed.status === 'active') activeExternalIds.push(parsed.externalId)
      continue
    }

    const changed =
      existing.phone !== parsed.phone ||
      existing.firstName !== parsed.firstName ||
      existing.lastName !== parsed.lastName ||
      existing.groupExternalId !== parsed.groupExternalId ||
      existing.groupName !== parsed.groupName ||
      existing.status !== parsed.status

    if (parsed.phone !== existing.phone) {
      const phoneOwner = await prisma.integrationEnrollment.findUnique({
        where: { partnerId_phone: { partnerId, phone: parsed.phone } },
      })
      if (phoneOwner && phoneOwner.id !== existing.id) {
        result.errors.push({
          external_id: parsed.externalId,
          code: INTEGRATION_ERROR_CODES.DUPLICATE_PHONE,
          message: 'Phone already used by another learner in this organization',
        })
        continue
      }
    }

    if (!changed) {
      result.unchanged++
      if (parsed.status === 'active') activeExternalIds.push(parsed.externalId)
      continue
    }

    const updated = await prisma.integrationEnrollment.update({
      where: { id: existing.id },
      data: {
        phone: parsed.phone,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        groupExternalId: parsed.groupExternalId,
        groupName: parsed.groupName,
        status: parsed.status,
        metadata: (parsed.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        deactivatedAt: parsed.status === 'inactive' ? new Date() : null,
      },
    })
    result.updated++

    if (updated.userId) {
      await applyPartnerBenefitsForUser(updated.userId)
    }
    if (parsed.status === 'active') activeExternalIds.push(parsed.externalId)
  }

  if (mode === 'replace' && result.errors.length === 0) {
    const toDeactivate = await prisma.integrationEnrollment.findMany({
      where: {
        partnerId,
        status: 'active',
        externalId: { notIn: activeExternalIds },
      },
      select: { id: true, userId: true },
    })
    if (toDeactivate.length > 0) {
      await prisma.integrationEnrollment.updateMany({
        where: { id: { in: toDeactivate.map((r) => r.id) } },
        data: { status: 'inactive', deactivatedAt: new Date() },
      })
      result.deactivated = toDeactivate.length
      for (const row of toDeactivate) {
        if (row.userId) await applyPartnerBenefitsForUser(row.userId)
      }
    }
  }

  return result
}

export async function upsertLearner(
  partnerId: string,
  input: IntegrationLearnerInput,
): Promise<{ record: LearnerRecord; created: boolean }> {
  const errors: IntegrationSyncError[] = []
  const parsed = parseLearner(input, errors)
  if (!parsed || errors.length > 0) {
    const err = errors[0]!
    const e = new Error(err.message) as Error & { statusCode?: number; code?: string }
    e.statusCode = 400
    e.code = err.code
    throw e
  }

  const existing = await prisma.integrationEnrollment.findUnique({
    where: { partnerId_externalId: { partnerId, externalId: parsed.externalId } },
  })

  if (!existing) {
    const phoneOwner = await prisma.integrationEnrollment.findUnique({
      where: { partnerId_phone: { partnerId, phone: parsed.phone } },
    })
    if (phoneOwner) {
      const e = new Error('Phone already used by another learner') as Error & { statusCode?: number }
      e.statusCode = 409
      throw e
    }
    const row = await prisma.integrationEnrollment.create({
      data: {
        partnerId,
        externalId: parsed.externalId,
        phone: parsed.phone,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        groupExternalId: parsed.groupExternalId,
        groupName: parsed.groupName,
        status: parsed.status,
        metadata: (parsed.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        deactivatedAt: parsed.status === 'inactive' ? new Date() : null,
      },
    })
    return { record: toLearnerRecord(row), created: true }
  }

  const row = await prisma.integrationEnrollment.update({
    where: { id: existing.id },
    data: {
      phone: parsed.phone,
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      groupExternalId: parsed.groupExternalId,
      groupName: parsed.groupName,
      status: parsed.status,
      metadata: (parsed.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      deactivatedAt: parsed.status === 'inactive' ? new Date() : null,
    },
  })
  if (row.userId) await applyPartnerBenefitsForUser(row.userId)
  return { record: toLearnerRecord(row), created: false }
}

export async function getLearner(partnerId: string, externalId: string): Promise<LearnerRecord | null> {
  const row = await prisma.integrationEnrollment.findUnique({
    where: { partnerId_externalId: { partnerId, externalId } },
  })
  return row ? toLearnerRecord(row) : null
}

export async function deactivateLearner(
  partnerId: string,
  externalId: string,
): Promise<LearnerRecord | null> {
  const existing = await prisma.integrationEnrollment.findUnique({
    where: { partnerId_externalId: { partnerId, externalId } },
  })
  if (!existing) return null

  const row = await prisma.integrationEnrollment.update({
    where: { id: existing.id },
    data: { status: 'inactive', deactivatedAt: new Date() },
  })
  if (row.userId) await applyPartnerBenefitsForUser(row.userId)
  dispatchPartnerWebhook(partnerId, 'learner.deactivated', {
    external_id: row.externalId,
    user_id: row.userId,
    phone: row.phone,
  }).catch(() => {})
  return toLearnerRecord(row)
}

export async function getLearnerProgress(partnerId: string, externalId: string) {
  const enrollment = await prisma.integrationEnrollment.findUnique({
    where: { partnerId_externalId: { partnerId, externalId } },
    include: {
      user: {
        select: {
          id: true,
          streak: true,
          xp: true,
          lastActive: true,
          _count: { select: { userWords: true } },
        },
      },
    },
  })
  if (!enrollment) return null

  const dueCount = enrollment.userId
    ? await prisma.userWord.count({
        where: {
          userId: enrollment.userId,
          status: { not: 'mastered' },
          nextReview: { lte: new Date() },
        },
      })
    : 0

  return {
    external_id: enrollment.externalId,
    linked: !!enrollment.userId,
    user_id: enrollment.userId,
    streak: enrollment.user?.streak ?? 0,
    xp: enrollment.user?.xp ?? 0,
    words_count: enrollment.user?._count.userWords ?? 0,
    words_due: dueCount,
    last_active: enrollment.user?.lastActive?.toISOString() ?? null,
  }
}

export async function logSync(
  partnerId: string,
  operation: string,
  idempotencyKey: string | undefined,
  requestSummary: unknown,
  resultSummary: unknown,
  statusCode: number,
) {
  if (!idempotencyKey) return null

  try {
    return await prisma.integrationSyncLog.create({
      data: {
        partnerId,
        operation,
        idempotencyKey,
        requestSummary: requestSummary as object,
        resultSummary: resultSummary as object,
        statusCode,
      },
    })
  } catch {
    const cached = await prisma.integrationSyncLog.findUnique({
      where: { partnerId_idempotencyKey: { partnerId, idempotencyKey } },
    })
    return cached
  }
}

export async function getCachedSyncResult(partnerId: string, idempotencyKey: string) {
  return prisma.integrationSyncLog.findUnique({
    where: { partnerId_idempotencyKey: { partnerId, idempotencyKey } },
  })
}
