import type { ConnectorType, SyncMode } from '@wordswipe/shared'
import { prisma } from '../../lib/prisma'
import { syncGroups, syncStaff } from '../../services/integration-org.service'
import { syncLearners } from '../../services/integration.service'
import { pullEdupage } from './edupage.connector'
import { pullGenericRest } from './generic-rest.connector'
import type { ConnectorPullResult, PartnerConnectorConfig } from './types'

export function parsePartnerConnectorConfig(metadata: unknown): PartnerConnectorConfig {
  if (!metadata || typeof metadata !== 'object') return { connector: 'manual' }
  return metadata as PartnerConnectorConfig
}

export async function pullFromConnector(
  connector: ConnectorType,
  config: PartnerConnectorConfig,
): Promise<ConnectorPullResult> {
  switch (connector) {
    case 'generic_rest':
      return pullGenericRest(config)
    case 'edupage':
      return pullEdupage(config)
    case 'manual':
    default:
      return { staff: [], groups: [], learners: [], warnings: ['Manual connector — ERP pushes via API'] }
  }
}

export async function runPartnerConnectorSync(partnerId: string, mode: SyncMode = 'upsert') {
  const partner = await prisma.partner.findUnique({ where: { id: partnerId } })
  if (!partner) throw new Error('Partner not found')

  const config = parsePartnerConnectorConfig(partner.metadata)
  const connector = config.connector ?? 'manual'
  if (connector === 'manual') {
    const err = new Error('Partner uses manual connector — ERP must POST to Integration API') as Error & {
      statusCode?: number
    }
    err.statusCode = 400
    throw err
  }

  const pulled = await pullFromConnector(connector, config)

  const staffResult = pulled.staff.length
    ? await syncStaff(partnerId, pulled.staff, mode)
    : { created: 0, updated: 0, deactivated: 0, unchanged: 0, errors: [] }

  const groupsResult = pulled.groups.length
    ? await syncGroups(partnerId, pulled.groups, mode)
    : { created: 0, updated: 0, deactivated: 0, unchanged: 0, errors: [] }

  const learnersResult = pulled.learners.length
    ? await syncLearners(partnerId, pulled.learners, mode)
    : { created: 0, updated: 0, deactivated: 0, unchanged: 0, errors: [] }

  return {
    connector,
    warnings: pulled.warnings,
    staff: staffResult,
    groups: groupsResult,
    learners: learnersResult,
  }
}
