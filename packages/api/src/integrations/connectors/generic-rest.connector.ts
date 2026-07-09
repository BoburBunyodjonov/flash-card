import type { ConnectorPullResult, GenericRestConnectorConfig, PartnerConnectorConfig } from './types'

async function fetchJson(url: string, authHeader?: string): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (authHeader?.trim()) {
    const v = authHeader.trim()
    headers.Authorization = v.startsWith('Bearer ') || v.startsWith('Basic ') ? v : `Bearer ${v}`
  }
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`GET ${url} failed: HTTP ${res.status}`)
  return res.json()
}

function asArray<T>(v: unknown, key: string): T[] {
  if (Array.isArray(v)) return v as T[]
  if (v && typeof v === 'object' && Array.isArray((v as Record<string, unknown>)[key])) {
    return (v as Record<string, T[]>)[key]
  }
  return []
}

export async function pullGenericRest(config: PartnerConnectorConfig): Promise<ConnectorPullResult> {
  const cfg = config.generic_rest
  if (!cfg) throw new Error('generic_rest config missing')

  const result: ConnectorPullResult = {
    staff: [],
    groups: [],
    learners: [],
    warnings: [],
  }

  if (cfg.bundle_url) {
    const bundle = (await fetchJson(cfg.bundle_url, cfg.auth_header)) as Record<string, unknown>
    result.staff = asArray(bundle, 'staff')
    result.groups = asArray(bundle, 'groups')
    result.learners = asArray(bundle, 'learners')
    return result
  }

  const gr = cfg as GenericRestConnectorConfig
  if (gr.staff_url) {
    const data = await fetchJson(gr.staff_url, gr.auth_header)
    result.staff = asArray(data, 'staff').length
      ? asArray(data, 'staff')
      : (Array.isArray(data) ? (data as ConnectorPullResult['staff']) : [])
  }
  if (gr.groups_url) {
    const data = await fetchJson(gr.groups_url, gr.auth_header)
    result.groups = asArray(data, 'groups').length
      ? asArray(data, 'groups')
      : (Array.isArray(data) ? (data as ConnectorPullResult['groups']) : [])
  }
  if (gr.learners_url) {
    const data = await fetchJson(gr.learners_url, gr.auth_header)
    result.learners = asArray(data, 'learners').length
      ? asArray(data, 'learners')
      : (Array.isArray(data) ? (data as ConnectorPullResult['learners']) : [])
  }

  if (!result.staff.length && !result.groups.length && !result.learners.length) {
    result.warnings.push('No records returned — check URLs and response JSON shape')
  }
  return result
}
