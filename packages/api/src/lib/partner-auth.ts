import { createHash, randomBytes } from 'crypto'
import { prisma } from './prisma'

const KEY_PREFIX = 'ws_live_'

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = `${KEY_PREFIX}${randomBytes(24).toString('base64url')}`
  return { raw, hash: hashApiKey(raw), prefix: raw.slice(0, 12) }
}

/** Suspended partners can still call GET/PATCH /settings to re-enable integration. */
export async function resolvePartnerFromApiKey(rawKey: string) {
  if (!rawKey.startsWith(KEY_PREFIX)) return null
  const hash = hashApiKey(rawKey)
  return prisma.partner.findFirst({ where: { apiKeyHash: hash } })
}

export function extractApiKey(authHeader?: string, apiKeyHeader?: string): string | null {
  if (apiKeyHeader?.trim()) return apiKeyHeader.trim()
  if (!authHeader) return null
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  return m?.[1]?.trim() ?? null
}
