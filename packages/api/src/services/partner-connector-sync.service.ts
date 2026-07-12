import { prisma } from '../lib/prisma'
import { parsePartnerConnectorConfig, runPartnerConnectorSync } from '../integrations/connectors'

/**
 * Manual bo'lmagan (edupage / generic_rest) aktiv partnerlar uchun
 * ERP dan avtomatik pull sync.
 */
export async function runScheduledPartnerConnectorSyncs(): Promise<{
  attempted: number
  succeeded: number
  failed: number
  skipped: number
  errors: Array<{ partner_slug: string; error: string }>
}> {
  const partners = await prisma.partner.findMany({
    where: { status: 'active' },
    select: { id: true, slug: true, metadata: true },
  })

  let attempted = 0
  let succeeded = 0
  let failed = 0
  let skipped = 0
  const errors: Array<{ partner_slug: string; error: string }> = []

  for (const partner of partners) {
    const config = parsePartnerConnectorConfig(partner.metadata)
    const connector = config.connector ?? 'manual'
    if (connector === 'manual') {
      skipped++
      continue
    }

    attempted++
    try {
      await runPartnerConnectorSync(partner.id, 'upsert')
      succeeded++
      console.log(`[ConnectorSync] OK partner=${partner.slug} connector=${connector}`)
    } catch (err) {
      failed++
      const message = (err as Error).message
      errors.push({ partner_slug: partner.slug, error: message })
      console.error(`[ConnectorSync] FAIL partner=${partner.slug}:`, message)
    }
  }

  return { attempted, succeeded, failed, skipped, errors }
}
