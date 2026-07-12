import { prisma } from '../lib/prisma'
import { applyPartnerBenefitsForUser } from './partner-enrollment.service'

export interface PartnerIntegrationSettings {
  partner_slug: string
  partner_name: string
  integration_enabled: boolean
  premium_included: boolean
  access_mode: string
}

function toSettings(partner: {
  slug: string
  name: string
  status: string
  premiumIncluded: boolean
  accessMode: string
}): PartnerIntegrationSettings {
  return {
    partner_slug: partner.slug,
    partner_name: partner.name,
    integration_enabled: partner.status === 'active',
    premium_included: partner.premiumIncluded,
    access_mode: partner.accessMode,
  }
}

async function refreshPartnerUserBenefits(partnerId: string) {
  const rows = await prisma.integrationEnrollment.findMany({
    where: { partnerId, userId: { not: null } },
    select: { userId: true },
    distinct: ['userId'],
  })
  for (const row of rows) {
    if (row.userId) await applyPartnerBenefitsForUser(row.userId)
  }
}

export async function getPartnerIntegrationSettings(
  partnerId: string,
): Promise<PartnerIntegrationSettings | null> {
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: {
      slug: true,
      name: true,
      status: true,
      premiumIncluded: true,
      accessMode: true,
    },
  })
  if (!partner) return null
  return toSettings(partner)
}

export async function updatePartnerIntegrationSettings(
  partnerId: string,
  patch: { integration_enabled?: boolean; premium_included?: boolean },
): Promise<PartnerIntegrationSettings> {
  const data: { status?: 'active' | 'suspended'; premiumIncluded?: boolean } = {}
  if (patch.integration_enabled !== undefined) {
    data.status = patch.integration_enabled ? 'active' : 'suspended'
  }
  if (patch.premium_included !== undefined) {
    data.premiumIncluded = patch.premium_included
  }

  if (Object.keys(data).length === 0) {
    const current = await getPartnerIntegrationSettings(partnerId)
    if (!current) {
      const err = new Error('Partner not found') as Error & { statusCode?: number }
      err.statusCode = 404
      throw err
    }
    return current
  }

  const partner = await prisma.partner.update({
    where: { id: partnerId },
    data,
    select: {
      slug: true,
      name: true,
      status: true,
      premiumIncluded: true,
      accessMode: true,
    },
  })

  if (patch.premium_included !== undefined || patch.integration_enabled !== undefined) {
    await refreshPartnerUserBenefits(partnerId)
  }

  return toSettings(partner)
}
