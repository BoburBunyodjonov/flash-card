import type { Prisma } from '@prisma/client'
import { generateApiKey, hashApiKey } from '../lib/partner-auth'
import {
  encryptConnectorMetadata,
  mergeConnectorSecrets,
  redactConnectorMetadataForAdmin,
} from '../lib/partner-secrets'
import { prisma } from '../lib/prisma'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'partner'
}

export async function createPartner(data: {
  name: string
  slug?: string
  accessMode?: 'benefit_only' | 'whitelist'
  premiumIncluded?: boolean
  webhookUrl?: string | null
  webhookSecret?: string | null
  metadata?: Record<string, unknown>
}) {
  const baseSlug = data.slug?.trim() || slugify(data.name)
  let slug = baseSlug
  let n = 0
  while (await prisma.partner.findUnique({ where: { slug } })) {
    n++
    slug = `${baseSlug}-${n}`
  }

  const { raw, hash, prefix } = generateApiKey()
  const metadata = encryptConnectorMetadata(data.metadata)
  const partner = await prisma.partner.create({
    data: {
      name: data.name.trim(),
      slug,
      apiKeyHash: hash,
      apiKeyPrefix: prefix,
      accessMode: data.accessMode ?? 'benefit_only',
      premiumIncluded: data.premiumIncluded ?? true,
      webhookUrl: data.webhookUrl ?? null,
      webhookSecret: data.webhookSecret ?? null,
      metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  })

  return { partner, apiKey: raw }
}

export async function rotatePartnerApiKey(partnerId: string) {
  const { raw, hash, prefix } = generateApiKey()
  const partner = await prisma.partner.update({
    where: { id: partnerId },
    data: { apiKeyHash: hash, apiKeyPrefix: prefix },
  })
  return { partner, apiKey: raw }
}

export async function listPartners() {
  const partners = await prisma.partner.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { enrollments: true, staff: true, groups: true, webhookDeliveries: true } },
    },
  })
  return partners.map((p) => {
    const meta = (p.metadata ?? {}) as Record<string, unknown>
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      status: p.status,
      accessMode: p.accessMode,
      premiumIncluded: p.premiumIncluded,
      apiKeyPrefix: p.apiKeyPrefix,
      webhookUrl: p.webhookUrl,
      connector: (meta.connector as string) ?? 'manual',
      enrollmentsCount: p._count.enrollments,
      staffCount: p._count.staff,
      groupsCount: p._count.groups,
      webhookDeliveriesCount: p._count.webhookDeliveries,
      createdAt: p.createdAt.toISOString(),
    }
  })
}

export async function getPartner(partnerId: string) {
  const p = await prisma.partner.findUnique({
    where: { id: partnerId },
    include: { _count: { select: { enrollments: true, staff: true, groups: true } } },
  })
  if (!p) return null
  const meta = redactConnectorMetadataForAdmin(p.metadata)
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    status: p.status,
    accessMode: p.accessMode,
    premiumIncluded: p.premiumIncluded,
    apiKeyPrefix: p.apiKeyPrefix,
    webhookUrl: p.webhookUrl,
    hasWebhookSecret: Boolean(p.webhookSecret),
    metadata: meta,
    connector: (meta.connector as string) ?? 'manual',
    enrollmentsCount: p._count.enrollments,
    staffCount: p._count.staff,
    groupsCount: p._count.groups,
    createdAt: p.createdAt.toISOString(),
  }
}

export async function updatePartner(
  partnerId: string,
  data: Partial<{
    name: string
    status: 'active' | 'suspended'
    accessMode: 'benefit_only' | 'whitelist'
    premiumIncluded: boolean
    webhookUrl: string | null
    webhookSecret: string | null
    metadata: Record<string, unknown>
  }>,
) {
  const { metadata, ...rest } = data
  const patch: Prisma.PartnerUpdateInput = { ...rest }
  if (metadata !== undefined) {
    const existing = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { metadata: true },
    })
    const merged = mergeConnectorSecrets(metadata, existing?.metadata)
    patch.metadata = (merged ?? metadata) as Prisma.InputJsonValue
  }
  return prisma.partner.update({ where: { id: partnerId }, data: patch })
}

// Re-export for admin manual key set (emergency)
export { hashApiKey }
